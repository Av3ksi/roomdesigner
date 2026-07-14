import type { Product } from "../types";

/**
 * Generic shape every supplier adapter normalizes its own feed into before
 * mapping to a Maison Product. Modeled on the fields common to wholesale
 * dropship feeds (VidaXL, BigBuy, Artisan Furniture all expose roughly
 * this) — SKU/EAN identity, a vendor-specific category taxonomy, cost vs.
 * recommended retail price, stock, and physical dimensions for shipping.
 * Adjust field names once a real feed/API response is in hand — this is a
 * best-effort shape, not a confirmed spec from any one supplier's docs.
 */
export interface RawSupplierProduct {
  sku: string;
  ean?: string;
  title: string;
  /** Vendor's own category path, e.g. "Home & Living > Lighting > Floor Lamps". */
  vendorCategory: string;
  description: string;
  costPrice: number;
  recommendedRetailPrice?: number;
  stockQty: number;
  images: string[];
  weightKg: number;
  dimensionsCm: { l: number; w: number; h: number };
  brand: string;
  /** Flags bulky/fragile items that need special shipping handling (e.g. sofas). */
  bulky?: boolean;
}

export interface SupplierCatalogResult {
  supplierId: string;
  supplierLabel: string;
  /** "mock" until real credentials are configured — never silently pretend otherwise. */
  source: "live" | "mock";
  fetchedAt: number;
  products: Product[];
}

export interface SupplierAdapter {
  id: string;
  label: string;
  /** True once the real API credentials are present in the environment. */
  isLive(): boolean;
  fetchCatalog(): Promise<SupplierCatalogResult>;
}
