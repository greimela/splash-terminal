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

type OfferTableProps = {
  offers: Offer[];
  assets: Record<string, Asset | NFTMetadata>;
};

function OfferTable({ offers, assets }: OfferTableProps) {
  const calculatePrice = (
    offered: Record<string, number>,
    requested: Record<string, number>
  ) => {
    const xchOffered = offered["xch"];
    const xchRequested =
      requested[
        "0000000000000000000000000000000000000000000000000000000000000000"
      ];

    if (xchOffered) {
      const [otherAsset, otherAmount] = Object.entries(requested)[0];
      if (otherAsset.startsWith("nft")) {
        return `${formatAmount(xchOffered, "xch")} XCH`;
      }

      return `${formatAmount(
        xchOffered / 1e9 / (otherAmount / 1000),
        otherAsset
      )} XCH`;
    } else if (xchRequested) {
      const [otherAsset, otherAmount] = Object.entries(offered)[0];
      if (otherAsset.startsWith("nft")) {
        return `${formatAmount(xchRequested, "xch")} XCH`;
      }
      return ` ${formatAmount(
        (xchRequested / 1e12 / (otherAmount / 1000)) * 1000,
        otherAsset
      )} XCH`;
    }

    return "N/A";
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Requested</TableHead>
          <TableHead>Offered</TableHead>
          <TableHead>Price</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {offers.map((offer, index) => (
          <TableRow key={index}>
            <TableCell>
              {Object.entries(offer.requested_assets).map(([asset, amount]) => {
                const { assetName, assetIcon } = getAssetIconAndName(
                  asset,
                  assets
                );
                return (
                  <div key={asset} className="flex items-center">
                    <img
                      src={assetIcon}
                      alt={assetName}
                      className="w-6 h-6 mr-2"
                    />
                    <span className="mr-2">{formatAmount(amount, asset)}</span>
                    {assetName}
                  </div>
                );
              })}
            </TableCell>
            <TableCell>
              {Object.entries(offer.offered_assets).map(([asset, amount]) => {
                const { assetName, assetIcon } = getAssetIconAndName(
                  asset,
                  assets
                );
                return (
                  <div key={asset} className="flex items-center">
                    <img
                      src={assetIcon}
                      alt={assetName}
                      className="w-6 h-6 mr-2"
                    />
                    <span className="mr-2">{formatAmount(amount, asset)}</span>
                    {assetName}
                  </div>
                );
              })}
            </TableCell>
            <TableCell>
              {calculatePrice(offer.offered_assets, offer.requested_assets)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default OfferTable;
