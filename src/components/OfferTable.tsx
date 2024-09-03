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
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Offered</TableHead>
          <TableHead>Requested</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {offers.map((offer, index) => (
          <TableRow key={index}>
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
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default OfferTable;
