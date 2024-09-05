use bech32::ToBase32;
use chia_protocol::{Bytes32, SpendBundle};
use chia_puzzles::offer::SettlementPaymentsSolution;
use chia_traits::Streamable;
use chia_wallet_sdk::{
    decode_offer_data, decompress_offer_bytes, CatLayer, Layer, NftInfo, OfferError, ParsedOffer,
    Puzzle, SpendContext,
};
use clvmr::sha2::Sha256;

use clvm_traits::{FromClvm, ToClvm};
use clvmr::{Allocator, NodePtr};
use futures::StreamExt;
use indexmap::IndexMap;
use libp2p::multiaddr::Protocol;
use libp2p::swarm::SwarmEvent;
use libp2p::{gossipsub, kad, noise, swarm::NetworkBehaviour, tcp, yamux};
use libp2p::{identify, identity, StreamProtocol};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::error::Error;
use std::hash::{DefaultHasher, Hash, Hasher};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::command;
use tauri::Emitter;
use tokio::{io, select, sync::mpsc};

mod dns;

#[derive(NetworkBehaviour)]
struct SplashBehaviour {
    gossipsub: gossipsub::Behaviour,
    kademlia: kad::Behaviour<kad::store::MemoryStore>,
    identify: identify::Behaviour,
}

const MAX_OFFER_SIZE: usize = 300 * 1024;

lazy_static::lazy_static! {
    static ref PEER_COUNT: Arc<Mutex<usize>> = Arc::new(Mutex::new(0));
}

#[derive(Clone)]
struct AppState {
    offer_sender: mpsc::Sender<String>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let (offer_sender, offer_receiver) = mpsc::channel::<String>(100);

    let app_state = AppState { offer_sender };

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                splash_network(app_handle, offer_receiver).await.unwrap();
            });
            Ok(())
        })
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            fetch_nft_metadata,
            fetch_asset,
            fetch_num_peers,
            submit_offer
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

async fn splash_network(
    app_handle: tauri::AppHandle,
    mut offer_receiver: mpsc::Receiver<String>,
) -> Result<(), Box<dyn Error + Send + Sync>> {
    // Initialize the Splash network
    let id_keys = identity::Keypair::generate_ed25519();

    let known_peers = dns::resolve_peers_from_dns()
        .await
        .map_err(|e| format!("Failed to resolve peers from dns: {}", e))
        .unwrap();

    let mut swarm = libp2p::SwarmBuilder::with_existing_identity(id_keys)
        .with_tokio()
        .with_tcp(
            tcp::Config::default(),
            noise::Config::new,
            yamux::Config::default,
        )?
        .with_behaviour(|key| {
            println!("Our Peer ID: {}", key.public().to_peer_id());

            // We can take the hash of message and use it as an ID.
            let unique_offer_fn = |message: &gossipsub::Message| {
                let mut s = DefaultHasher::new();
                Hash::hash(&message.data, &mut s);
                gossipsub::MessageId::from(s.finish().to_string())
            };

            // Set a custom gossipsub configuration
            let gossipsub_config = gossipsub::ConfigBuilder::default()
                .heartbeat_interval(Duration::from_secs(5)) // This is set to aid debugging by not cluttering the log space
                .message_id_fn(unique_offer_fn) // No duplicate offers will be propagated.
                .max_transmit_size(MAX_OFFER_SIZE)
                .build()
                .map_err(|msg| io::Error::new(io::ErrorKind::Other, msg))?; // Temporary hack because `build` does not return a proper `std::error::Error`.

            // build a gossipsub network behaviour
            let gossipsub = gossipsub::Behaviour::new(
                gossipsub::MessageAuthenticity::Signed(key.clone()),
                gossipsub_config,
            )?;

            // Create a Kademlia behaviour.
            let mut cfg =
                kad::Config::new(StreamProtocol::try_from_owned("/splash/kad/1".to_string())?);

            cfg.set_query_timeout(Duration::from_secs(60));
            let store = kad::store::MemoryStore::new(key.public().to_peer_id());

            let mut kademlia = kad::Behaviour::with_config(key.public().to_peer_id(), store, cfg);

            // Add known peers to Kademlia
            for addr in known_peers.iter() {
                let Some(Protocol::P2p(peer_id)) = addr.iter().last() else {
                    return Err("Expect peer multiaddr to contain peer ID.".into());
                };
                kademlia.add_address(&peer_id, addr.clone());
            }

            kademlia.bootstrap().unwrap();

            let identify = identify::Behaviour::new(identify::Config::new(
                "/splash/id/1".into(),
                key.public().clone(),
            ));

            Ok(SplashBehaviour {
                gossipsub,
                kademlia,
                identify,
            })
        })?
        .build();

    // Listen on a default address
    swarm.listen_on("/ip4/0.0.0.0/tcp/0".parse()?)?;

    // Create and subscribe to the Gossipsub topic
    let topic = gossipsub::IdentTopic::new("/splash/offers/1");
    swarm.behaviour_mut().gossipsub.subscribe(&topic)?;

    let mut ctx: SpendContext = SpendContext::new();

    loop {
        select! {
            event = swarm.select_next_some() => match event {
                SwarmEvent::ConnectionEstablished { peer_id, .. } => {
                    println!("Connected to peer: {peer_id}");
                    let num_peers = swarm.connected_peers().count();
                    *PEER_COUNT.lock().unwrap() = num_peers;
                    app_handle.emit("peer-status", num_peers).unwrap();
                },
                SwarmEvent::ConnectionClosed { peer_id, .. } => {
                    println!("Disconnected from peer: {peer_id}");
                    let num_peers = swarm.connected_peers().count();
                    *PEER_COUNT.lock().unwrap() = num_peers;
                    app_handle.emit("peer-status", num_peers).unwrap();
                },
                SwarmEvent::Behaviour(SplashBehaviourEvent::Gossipsub(gossipsub::Event::Message {
                    propagation_source: _,
                    message_id: _,
                    message,
                })) => {
                    let msg_str = String::from_utf8_lossy(&message.data).into_owned();
                    if msg_str.starts_with("offer1") {
                        let offer_summary = parse_offer(&msg_str, &mut ctx.allocator).unwrap();
                        println!("Received Offer: {}", offer_summary.id);

                        // Send the offer to the frontend using a Tauri event
                        app_handle.emit("new-offer", offer_summary).unwrap();
                    }
                },
                _ => {}
            },
            Some(offer_string) = offer_receiver.recv() => {
                println!("Received new offer to publish: {}", offer_string);
                // We don't need to parse the offer here anymore, as it's already been parsed
                if let Err(e) = swarm.behaviour_mut().gossipsub.publish(topic.clone(), offer_string.as_bytes()) {
                    eprintln!("Failed to publish offer: {:?}", e);
                }
            }
        }
    }
}

#[derive(Serialize, Deserialize, Clone)]
struct OfferSummary {
    id: String,
    offered_assets: HashMap<String, u64>,
    requested_assets: HashMap<String, u64>,
    offer_string: String,
}

// TODO: move this to chia-wallet-sdk
fn parse(spend_bundle: SpendBundle, allocator: &mut Allocator) -> Result<ParsedOffer, OfferError> {
    let mut parsed = ParsedOffer {
        aggregated_signature: spend_bundle.aggregated_signature,
        coin_spends: Vec::new(),
        requested_payments: IndexMap::new(),
    };

    for coin_spend in spend_bundle.coin_spends {
        if coin_spend.coin.parent_coin_info != Bytes32::default() {
            parsed.coin_spends.push(coin_spend);
            continue;
        }

        if coin_spend.coin.amount != 0 {
            parsed.coin_spends.push(coin_spend);
            continue;
        }

        let solution = coin_spend.solution.to_clvm(allocator)?;
        let settlement_solution = SettlementPaymentsSolution::from_clvm(allocator, solution)?;

        let puzzle = coin_spend.puzzle_reveal.to_clvm(allocator)?;

        let puzzle = Puzzle::parse(allocator, puzzle);

        let mut asset_id = Bytes32::default();

        if let Ok(Some(cat_layer)) = CatLayer::<NodePtr>::parse_puzzle(allocator, puzzle) {
            asset_id = cat_layer.asset_id;
        } else if let Ok(Some(nft)) = NftInfo::<NodePtr>::parse(allocator, puzzle) {
            asset_id = nft.0.launcher_id;
        }

        parsed
            .requested_payments
            .entry(asset_id)
            .or_insert_with(|| (puzzle, Vec::new()))
            .1
            .extend(settlement_solution.notarized_payments);
    }

    Ok(parsed)
}

fn parse_offer(
    offer_str: &str,
    allocator: &mut Allocator,
) -> Result<OfferSummary, Box<dyn std::error::Error>> {
    // let offer = Offer::decode(offer_str).unwrap();
    let spend_bundle =
        SpendBundle::from_bytes(&decompress_offer_bytes(&decode_offer_data(offer_str)?)?).unwrap();
    let parsed_offer = parse(spend_bundle, allocator).unwrap();

    let offer_id = {
        let mut hasher = Sha256::new();
        hasher.update(offer_str);
        let result = hasher.finalize();
        bs58::encode(result).into_string()
    };

    let mut offered_assets: HashMap<String, u64> = HashMap::new();
    let mut requested_assets: HashMap<String, u64> = HashMap::new();

    for coin_spend in &parsed_offer.coin_spends {
        let puzzle = coin_spend.puzzle_reveal.to_clvm(allocator)?;
        let puzzle = Puzzle::parse(allocator, puzzle);

        let asset_id = get_asset_id(allocator, puzzle);

        *offered_assets.entry(asset_id).or_insert(0) += coin_spend.coin.amount;
    }

    for (asset_id, (_, notarized_payments)) in &parsed_offer.requested_payments {
        let mut total_amount = 0;
        for notarized_payment in notarized_payments {
            for payment in &notarized_payment.payments {
                total_amount += payment.amount;
            }
        }
        *requested_assets.entry(hex::encode(asset_id)).or_insert(0) += total_amount;
    }

    Ok(OfferSummary {
        id: offer_id,
        offered_assets,
        requested_assets,
        offer_string: offer_str.to_string(),
    })
}

fn get_asset_id(allocator: &mut Allocator, puzzle: Puzzle) -> String {
    let mut asset_id: String = "xch".to_string();

    if let Ok(Some(cat_layer)) = CatLayer::<NodePtr>::parse_puzzle(allocator, puzzle) {
        asset_id = hex::encode(cat_layer.asset_id);
    } else if let Ok(Some(nft)) = NftInfo::<NodePtr>::parse(allocator, puzzle) {
        asset_id = bech32::encode(
            "nft",
            nft.0.launcher_id.as_ref().to_base32(),
            bech32::Variant::Bech32m,
        )
        .unwrap();
    }
    asset_id
}

#[derive(Serialize)]
struct NFTMetadata {
    id: String,
    name: String,
    collection: Collection,
    description: String,
    thumbnail_uri: String,
}

#[derive(Serialize)]
struct Collection {
    name: String,
}

#[derive(Serialize)]
struct Asset {
    id: String,
    code: String,
    name: String,
}

#[command]
async fn fetch_nft_metadata(asset_id: String) -> Result<NFTMetadata, String> {
    println!("Fetching NFT metadata: {}", asset_id);
    let url = format!("https://api.mintgarden.io/nfts/{}", asset_id);
    let response = Client::new()
        .get(&url)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let json = response
        .json::<serde_json::Value>()
        .await
        .map_err(|e| e.to_string())?;

    Ok(NFTMetadata {
        id: json["id"].as_str().unwrap().to_string(),
        name: json["data"]["metadata_json"]["name"]
            .as_str()
            .unwrap()
            .to_string(),
        collection: Collection {
            name: json["data"]["metadata_json"]["collection"]["name"]
                .as_str()
                .unwrap()
                .to_string(),
        },
        description: json["data"]["metadata_json"]["description"]
            .as_str()
            .unwrap()
            .to_string(),
        thumbnail_uri: json["data"]["thumbnail_uri"].as_str().unwrap().to_string(),
    })
}

#[command]
async fn fetch_asset(asset_id: String) -> Result<Asset, String> {
    let url = format!(
        "https://dexie.space/v1/assets?page_size=25&page=1&type=all&code={}",
        asset_id
    );
    let response = Client::new()
        .get(&url)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let data = response
        .json::<serde_json::Value>()
        .await
        .map_err(|e| e.to_string())?;
    let asset = &data["assets"][0];

    if asset.is_null() {
        return Ok(Asset {
            id: "unknown".to_string(),
            code: "unknown".to_string(),
            name: "unknown".to_string(),
        });
    }

    Ok(Asset {
        id: asset["id"].as_str().unwrap().to_string(),
        code: asset["code"].as_str().unwrap().to_string(),
        name: asset["name"].as_str().unwrap().to_string(),
    })
}

#[command]
async fn fetch_num_peers() -> Result<usize, String> {
    Ok(*PEER_COUNT.lock().map_err(|e| e.to_string())?)
}

#[tauri::command]
async fn submit_offer(
    offer_string: String,
    state: tauri::State<'_, AppState>,
) -> Result<OfferSummary, String> {
    let mut ctx: SpendContext = SpendContext::new();

    // Parse the offer first
    let offer_summary = parse_offer(&offer_string, &mut ctx.allocator)
        .map_err(|e| format!("Failed to parse offer: {}", e))?;

    // If parsing succeeds, send the offer string to the channel
    state
        .offer_sender
        .send(offer_string)
        .await
        .map_err(|e| format!("Failed to send offer: {}", e))?;

    // Return the parsed offer summary
    Ok(offer_summary)
}
