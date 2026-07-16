import type { Product } from "../types";

/**
 * Generic shape every supplier adapter normalizes its own feed into before
 * mapping to a Maison Product. Only sku/title/vendorCategory/costPrice/
 * stockQty are guaranteed — that's the full field set VidaXL's real
 * `GET /api_customer/products` endpoint returns (id, name, code,
 * category_path, quantity, price — no description, images, or a separate
 * cost/RRP split). Everything else is optional because it's mock-feed-only
 * or specific to richer suppliers (e.g. BigBuy) that may be added later.
 */
export interface RawSupplierProduct {
  sku: string;
  ean?: string;
  title: string;
  /** Vendor's own category path, e.g. "Home & Living > Lighting > Floor Lamps". */
  vendorCategory: string;
  /** Not provided by VidaXL's real feed — populated in the mock feed only. */
  description?: string;
  /** VidaXL's single `price` field is the wholesale cost, not a retail price. */
  costPrice: number;
  recommendedRetailPrice?: number;
  stockQty: number;
  images?: string[];
  weightKg?: number;
  dimensionsCm?: { l: number; w: number; h: number };
  brand?: string;
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
