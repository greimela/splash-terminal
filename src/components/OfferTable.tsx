import { useState } from "react";
import { Offer, Asset, NFTMetadata } from "../types";
import { formatAmount, getAssetIconAndName } from "../utils";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type OfferTableProps = {
  offers: Offer[];
  assets: Record<string, Asset | NFTMetadata>;
};

function OfferTable({ offers, assets }: OfferTableProps) {
  const [inspectedOffer, setInspectedOffer] = useState<Offer | null>(null);

  const calculatePrice = (
    offered: Record<string, number>,
    requested: Record<string, number>
  ) => {
    const xchOffered = offered["xch"];
    const xchRequested =
      requested[
        "0000000000000000000000000000000000000000000000000000000000000000"
      ];

    if (xchRequested) {
      const nonXchAssets = Object.entries(offered).filter(
        ([asset]) => asset !== "xch"
      );
      if (nonXchAssets.length === 0) return "N/A";
      const [otherAsset, otherAmount] = nonXchAssets[0];
      if (otherAsset.startsWith("nft")) {
        return `${formatAmount(xchRequested, "xch")} XCH`;
      }
      return ` ${formatAmount(
        (xchRequested / 1e12 / (otherAmount / 1000)) * 1000,
        otherAsset
      )} XCH`;
    } else if (xchOffered) {
      const nonXchAssets = Object.entries(requested).filter(
        ([asset]) =>
          asset !==
          "0000000000000000000000000000000000000000000000000000000000000000"
      );
      if (nonXchAssets.length === 0) return "N/A";
      const [otherAsset, otherAmount] = nonXchAssets[0];
      if (otherAsset.startsWith("nft")) {
        return `${formatAmount(xchOffered, "xch")} XCH`;
      }
      return `${formatAmount(
        xchOffered / 1e9 / (otherAmount / 1000),
        otherAsset
      )} XCH`;
    }

    return "N/A";
  };

  const sortAssets = (assetEntries: [string, number][]) => {
    return assetEntries.sort(([assetA], [assetB]) => {
      if (assetA === "xch") return 1;
      if (assetB === "xch") return -1;
      return assetA.localeCompare(assetB);
    });
  };

  const renderAssetRow = (assetEntries: [string, number][]) => {
    return sortAssets(assetEntries).map(([asset, amount]) => {
      const { assetName, assetIcon } = getAssetIconAndName(asset, assets);
      return (
        <div key={asset} className="flex items-center">
          <img
            src={assetIcon}
            alt={assetName}
            className={`${
              asset.startsWith("nft") ? "w-8 h-8" : "w-6 h-6"
            } mr-2 rounded-md`}
          />
          <span className="mr-2">{formatAmount(amount, asset)}</span>
          <span
            className="truncate max-w-[120px] inline-block"
            title={assetName}
          >
            {assetName}
          </span>
        </div>
      );
    });
  };

  const renderPrice = (price: string) => {
    if (price === "N/A") return price;
    return (
      <div className="flex items-center">
        <img
          src="https://icons.dexie.space/xch.webp"
          alt="Chia"
          className="w-5 h-5 mr-2"
        />
        {price}
      </div>
    );
  };

  const renderOfferContent = (offer: Offer) => {
    return (
      <div className="mb-8 gap-4 flex flex-col">
        <div className="flex flex-col space-y-1.5">
          <span className="text-sm font-medium leading-none">Requested</span>
          <div className="flex flex-col gap-2 w-full rounded-md border bg-neutral-100 border-neutral-200 dark:bg-neutral-900 dark:border-neutral-700 px-3 py-2 text-sm">
            {renderAssetRow(Object.entries(offer.requested_assets))}
          </div>
        </div>
        <div className="flex flex-col space-y-1.5">
          <span className="text-sm font-medium leading-none">Offered</span>
          <div className="flex flex-col gap-2  w-full rounded-md border bg-neutral-100 border-neutral-200 dark:bg-neutral-900 dark:border-neutral-700 px-3 py-2 text-sm">
            {renderAssetRow(Object.entries(offer.offered_assets))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Requested</TableHead>
            <TableHead>Offered</TableHead>
            <TableHead>Price</TableHead>
            <TableHead className="text-end">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="font-mono">
          {offers.map((offer, index) => (
            <TableRow key={index}>
              <TableCell>
                <div className="flex flex-col gap-1">
                  {renderAssetRow(Object.entries(offer.requested_assets))}
                </div>
              </TableCell>
              <TableCell>
                <div className="flex flex-col gap-1">
                  {renderAssetRow(Object.entries(offer.offered_assets))}
                </div>
              </TableCell>
              <TableCell>
                {renderPrice(
                  calculatePrice(offer.offered_assets, offer.requested_assets)
                )}
              </TableCell>
              <TableCell className="text-end">
                <Button onClick={() => setInspectedOffer(offer)}>
                  Inspect
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog
        open={!!inspectedOffer}
        onOpenChange={() => setInspectedOffer(null)}
      >
        <DialogContent className="max-w-3xl dark:text-white">
          <DialogHeader>
            <DialogTitle>Offer Details</DialogTitle>
          </DialogHeader>
          <div className="mt-4">
            {inspectedOffer && renderOfferContent(inspectedOffer)}
            <span className="text-sm font-medium leading-none">
              Raw Offer File
            </span>
            <pre className="border border-neutral-200 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-900 p-2 rounded overflow-x-auto whitespace-pre-wrap break-all text-xs">
              {inspectedOffer?.offer_string}
            </pre>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default OfferTable;
