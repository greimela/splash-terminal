import { Asset, NFTMetadata } from "./types";

const XCH_ASSET_IDS = [
  "xch",
  "cfbfdeed5c4ca2de3d0bf520b9cb4bb7743a359bd2e6a188d19ce7dffc21d3e7",
];
const XCH_ASSET: Asset = {
  id: "xch",
  code: "XCH",
  name: "Chia",
};

export function formatAmount(amount: number, assetId: string) {
  if (XCH_ASSET_IDS.includes(assetId)) {
    return (amount / 1e12).toFixed(2);
  } else if (assetId.startsWith("nft1")) {
    return amount.toString();
  } else {
    return (amount / 1000).toFixed(2);
  }
}

export function getAssetIconAndName(
  assetId: string,
  assets: Record<string, Asset | NFTMetadata>
): { assetName: string; assetIcon: string } {
  const asset = assets[assetId];
  const assetName = XCH_ASSET_IDS.includes(assetId)
    ? XCH_ASSET.code
    : asset?.code || assetId;
  let assetIcon;

  if (XCH_ASSET_IDS.includes(assetId)) {
    assetIcon = "https://icons.dexie.space/xch.webp";
  } else if (assetId.startsWith("nft1")) {
    assetIcon = `https://assets.mainnet.mintgarden.io/thumbnails/${assetId}.webp`;
  } else {
    assetIcon = `https://icons.dexie.space/${assetId}.webp`;
  }

  return { assetName, assetIcon };
}
