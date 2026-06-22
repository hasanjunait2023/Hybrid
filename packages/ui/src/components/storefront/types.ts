// View-layer shapes the storefront sections render. The data layer
// (apps/web/lib/storefront/data.ts) maps DB rows into these; the UI package
// stays free of any DB/Next coupling so it can be tested and reused in isolation.

export interface StorefrontProduct {
  id: string;
  title: string;
  slug: string;
  /** Lowest active variant price, in taka (Latin number from the DB). */
  price: number;
  /** Optional struck-through original price for a discount. */
  compareAtPrice?: number | null;
  /** false → render the out-of-stock treatment. */
  inStock?: boolean;
  /** Whether COD is offered for this product (drives the trust chip). */
  codEnabled?: boolean;
  imageUrl?: string | null;
}

export interface StoreIdentity {
  /** Display name in the header/footer (Bangla or Latin as stored). */
  name: string;
  /** Customer hotline, already normalised to Latin digits in the DB. */
  phone?: string | null;
  facebookUrl?: string | null;
}
