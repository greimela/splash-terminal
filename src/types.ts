export type Offer = {
  id: string;
  offered_assets: Record<string, number>;
  requested_assets: Record<string, number>;
  offer_string: string;
};

export type Asset = {
  id: string;
  code: string;
  name: string;
};

export type NFTMetadata = {
  id: string;
  name: string;
  collection: { name: string };
  description: string;
  thumbnail_uri: string;
};
