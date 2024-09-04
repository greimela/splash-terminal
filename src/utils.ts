import { Asset, NFTMetadata } from "./types";

const XCH_ASSET_IDS = [
  "xch",
  "0000000000000000000000000000000000000000000000000000000000000000",
];
const XCH_ASSET: Asset = {
  id: "xch",
  code: "XCH",
  name: "Chia",
};

export function formatAmount(amount: number, assetId: string) {
  if (XCH_ASSET_IDS.includes(assetId)) {
    return Math.floor((amount / 1e12) * 10000) / 10000;
  } else if (assetId.startsWith("nft1")) {
    return amount.toString();
  } else {
    return Math.floor((amount / 1000) * 10000) / 10000;
  }
}

export function getAssetIconAndName(
  assetId: string,
  assets: Record<string, Asset | NFTMetadata>
): { assetName: string; assetIcon: string } {
  const asset = assets[assetId];
  const assetName = XCH_ASSET_IDS.includes(assetId)
    ? XCH_ASSET.code
    : asset?.code || asset?.name || assetId;
  let assetIcon;

  if (XCH_ASSET_IDS.includes(assetId)) {
    assetIcon = "https://icons.dexie.space/xch.webp";
  } else if (assetId.startsWith("nft1")) {
    assetIcon = (asset as NFTMetadata)?.thumbnail_uri;
  } else {
    assetIcon = `https://icons.dexie.space/${assetId}.webp`;
  }

  return { assetName, assetIcon };
}
