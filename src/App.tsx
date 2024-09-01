import { useEffect, useState } from "react";
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import Header from './components/Header';
import OfferTable from './components/OfferTable';
import { Offer, Asset, NFTMetadata } from './types';

const XCH_ASSET_IDS = ['xch', 'cfbfdeed5c4ca2de3d0bf520b9cb4bb7743a359bd2e6a188d19ce7dffc21d3e7'];
const XCH_ASSET: Asset = {
  id: 'xch',
  code: 'XCH',
  name: 'Chia',
};

function App() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [assets, setAssets] = useState<Record<string, Asset | NFTMetadata>>({});
  const [numPeers, setNumPeers] = useState<number>(0);

  useEffect(() => {
    listen<Offer>('new-offer', (event) => {
      setOffers((prevOffers) => {
        const newOffer = event.payload;
        // Remove the old instance of the offer if it exists
        const filteredOffers = prevOffers.filter(offer => offer.id !== newOffer.id);
        // Add the new offer at the beginning of the list
        return [newOffer, ...filteredOffers];
      });
    });

    listen<number>('peer-status', (event) => {
      console.log('peer-status', event.payload);
      
      setNumPeers(event.payload);
    });
    invoke<number>('fetch_num_peers').then((numPeers) => {
      setNumPeers(numPeers);
    });
  }, []);

  useEffect(() => {
    const fetchAssetDetails = async (assetId: string) => {
      if (XCH_ASSET_IDS.includes(assetId)) {
        return XCH_ASSET;
      }

      if (assets[assetId]) {
        return assets[assetId];
      }

      if (assetId.startsWith('nft1')) {
        const nftMetadata: NFTMetadata = await invoke('fetch_nft_metadata', { assetId });
        setAssets((prevAssets) => ({ ...prevAssets, [assetId]: nftMetadata }));
        return nftMetadata;
      }

      const asset: Asset = await invoke('fetch_asset', { assetId });
      setAssets((prevAssets) => ({ ...prevAssets, [assetId]: asset }));
      return asset;
    };

    const updateAssets = async () => {
      const allAssetIds = new Set<string>();
      offers.forEach((offer) => {
        Object.keys(offer.offered_assets).forEach((id) => allAssetIds.add(id));
        Object.keys(offer.requested_assets).forEach((id) => allAssetIds.add(id));
      });

      for (const assetId of allAssetIds) {
        await fetchAssetDetails(assetId);
      }
    };

    updateAssets();
  }, [offers]);

  return (
    <div className="min-h-screen dark bg-neutral-800 text-neutral-100">
      <div className="container mx-auto p-4 ">
        <Header numPeers={numPeers} />
        {offers.length > 0 ? (
          <OfferTable offers={offers} assets={assets} />
        ) : (
          <div className="text-center mt-8 text-neutral-400">
            <p>No offers available yet. New offers will appear here as they are received.</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
