use bech32::ToBase32;
use chia_protocol::{Bytes32, SpendBundle};
use chia_puzzles::offer::SettlementPaymentsSolution;
use chia_traits::Streamable;
use chia_wallet_sdk::{
    decode_offer_data, decompress_offer_bytes, CatLayer, Layer, NftInfo, OfferError, ParsedOffer,
    Puzzle, SpendContext,
};
use clvmr::sha2::Sha256;

use chrono::{DateTime, Utc};
use clvm_traits::{FromClvm, ToClvm};
use clvmr::{Allocator, NodePtr};
use indexmap::IndexMap;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use splash::{Splash, SplashEvent};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::command;
use tauri::Emitter;
use tokio::sync::mpsc;

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
) -> Result<(), Box<dyn std::error::Error>> {
    let (splash, mut events) = Splash::new().build().await?;

    let mut ctx: SpendContext = SpendContext::new();

    loop {
        tokio::select! {
            Some(event) = events.recv() => {
                match event {
                    SplashEvent::Initialized(peer_id) => println!("Our Peer ID: {}", peer_id),
                    SplashEvent::NewListenAddress(address) => println!("Listening on: {}", address),

                    SplashEvent::PeerConnected(peer_id) => {
                        println!("Connected to peer: {}", peer_id);

                        *PEER_COUNT.lock().unwrap() += 1;
                        let peer_count = *PEER_COUNT.lock().unwrap();
                        app_handle.emit("peer-status", peer_count).unwrap();
                    }

                    SplashEvent::PeerDisconnected(peer_id) => {
                        println!("Disconnected from peer: {}", peer_id);

                        *PEER_COUNT.lock().unwrap() -= 1;
                        let peer_count = *PEER_COUNT.lock().unwrap();
                        app_handle.emit("peer-status", peer_count).unwrap();
                    }

                    SplashEvent::OfferReceived(offer_string) => {
                        let offer_summary = parse_offer(&offer_string, &mut ctx.allocator).unwrap();
                        println!("Received Offer: {}", offer_summary.id);

                        // Send the offer to the frontend using a Tauri event
                        app_handle.emit("new-offer", offer_summary).unwrap();
                    }

                    SplashEvent::OfferBroadcasted(offer) => println!("Broadcasted offer: {}", offer),
                    SplashEvent::OfferBroadcastFailed(err) => {
                        println!("Failed to broadcast offer: {}", err)
                    }
                }
            }
            Some(offer_string) = offer_receiver.recv() => {
                println!("Received new offer to publish: {}", offer_string);
                if let Err(e) = splash.submit_offer(&offer_string).await {
                    eprintln!("Failed to broadcast offer: {:?}", e);
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
    timestamp: DateTime<Utc>,
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

    for (asset_id, (puzzle, notarized_payments)) in &parsed_offer.requested_payments {
        let mut total_amount = 0;
        for notarized_payment in notarized_payments {
            for payment in &notarized_payment.payments {
                total_amount += payment.amount;
            }
        }
        let mut asset_id_string = hex::encode(asset_id);
        if let Ok(Some(nft)) = NftInfo::<NodePtr>::parse(allocator, *puzzle) {
            asset_id_string = bech32::encode(
                "nft",
                nft.0.launcher_id.as_ref().to_base32(),
                bech32::Variant::Bech32m,
            )
            .unwrap();
        }
        *requested_assets.entry(asset_id_string).or_insert(0) += total_amount;
    }

    Ok(OfferSummary {
        id: offer_id,
        offered_assets,
        requested_assets,
        offer_string: offer_str.to_string(),
        timestamp: Utc::now(),
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
