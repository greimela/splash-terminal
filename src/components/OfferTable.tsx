import { Offer, Asset, NFTMetadata } from '../types';
import { formatAmount, getAssetIconAndName } from '../utils';

type OfferTableProps = {
  offers: Offer[];
  assets: Record<string, Asset | NFTMetadata>;
};

function OfferTable({ offers, assets }: OfferTableProps) {
  return (
    <table className="table-auto w-full border-collapse border border-neutral-300">
      <thead>
        <tr>
          <th className="border border-neutral-300 px-4 py-2">Offer #</th>
          <th className="border border-neutral-300 px-4 py-2">Trading</th>
          <th className="border border-neutral-300 px-4 py-2">For</th>
        </tr>
      </thead>
      <tbody>
        {offers.map((offer, index) => (
          <tr key={index} className="hover:bg-neutral-100">
            <td className="border border-neutral-300 px-4 py-2 text-center">{index + 1}</td>
            <td className="border border-neutral-300 px-4 py-2">
              {Object.entries(offer.offered_assets).map(([asset, amount]) => {
                const { assetName, assetIcon } = getAssetIconAndName(asset, assets);
                return (
                  <div key={asset} className="flex items-center">
                    <span className="mr-2">{formatAmount(amount, asset)}</span>
                    <div className="flex items-center">
                      <img src={assetIcon} alt={assetName} className="w-6 h-6 mr-2" />
                      {assetName}
                    </div>
                  </div>
                );
              })}
            </td>
            <td className="border border-neutral-300 px-4 py-2">
              {Object.entries(offer.requested_assets).map(([asset, amount]) => {
                const { assetName, assetIcon } = getAssetIconAndName(asset, assets);
                return (
                  <div key={asset} className="flex items-center">
                    <span className="mr-2">{formatAmount(amount, asset)}</span>
                    <div className="flex items-center">
                      <img src={assetIcon} alt={assetName} className="w-6 h-6 mr-2" />
                      {assetName}
                    </div>
                  </div>
                );
              })}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default OfferTable;