import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import Header from "./components/Header";
import OfferTable from "./components/OfferTable";
import { Offer, Asset, NFTMetadata } from "./types";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "./components/ui/card";
import SubmitOfferDialog from "./components/SubmitOfferDialog";

const XCH_ASSET_IDS = [
  "xch",
  "0000000000000000000000000000000000000000000000000000000000000000",
];
const XCH_ASSET: Asset = {
  id: "xch",
  code: "XCH",
  name: "Chia",
};

function App() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [assets, setAssets] = useState<Record<string, Asset | NFTMetadata>>({});
  const [numPeers, setNumPeers] = useState<number>(0);

  useEffect(() => {
    listen<Offer>("new-offer", (event) => {
      setOffers((prevOffers) => {
        const newOffer = event.payload;
        // Remove the old instance of the offer if it exists
        const filteredOffers = prevOffers.filter(
          (offer) => offer.id !== newOffer.id
        );
        // Add the new offer at the beginning of the list
        return [newOffer, ...filteredOffers];
      });
    });

    listen<number>("peer-status", (event) => {
      console.log("peer-status", event.payload);

      setNumPeers(event.payload);
    });
    invoke<number>("fetch_num_peers").then((numPeers) => {
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

      if (assetId.startsWith("nft1")) {
        const nftMetadata: NFTMetadata = await invoke("fetch_nft_metadata", {
          assetId,
        });
        setAssets((prevAssets) => ({ ...prevAssets, [assetId]: nftMetadata }));
        return nftMetadata;
      }

      const asset: Asset = await invoke("fetch_asset", { assetId });
      setAssets((prevAssets) => ({ ...prevAssets, [assetId]: asset }));
      return asset;
    };

    const updateAssets = async () => {
      const allAssetIds = new Set<string>();
      offers.forEach((offer) => {
        Object.keys(offer.offered_assets).forEach((id) => allAssetIds.add(id));
        Object.keys(offer.requested_assets).forEach((id) =>
          allAssetIds.add(id)
        );
      });

      for (const assetId of allAssetIds) {
        await fetchAssetDetails(assetId);
      }
    };

    updateAssets();
  }, [offers]);

  return (
    <div className="min-h-screen">
      <div className="container mx-auto px-8 py-2">
        <Header numPeers={numPeers} />

        <Card x-chunk="dashboard-05-chunk-3">
          <div className="flex justify-between items-center">
            <CardHeader className="px-7">
              <CardTitle>Offers</CardTitle>
              <CardDescription>
                Recent offers received via Splash!
              </CardDescription>
            </CardHeader>
            <div className="flex justify-end p-6 px-7">
              <SubmitOfferDialog />
            </div>
          </div>
          <CardContent>
            <OfferTable offers={offers} assets={assets} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default App;
