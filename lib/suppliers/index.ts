import { vidaxlAdapter } from "./vidaxl";
import type { SupplierAdapter } from "./types";

/**
 * Registry of dropship supplier adapters. Add BigBuy / Artisan Furniture /
 * Orderchamp here the same way once you're pursuing them — each adapter is
 * self-contained (its own mock feed + mapper), so the rest of the app never
 * needs to know which supplier a product came from.
 */
export const SUPPLIERS: SupplierAdapter[] = [vidaxlAdapter];

export { vidaxlAdapter, fetchVidaxlCatalog, vidaxlEnabled } from "./vidaxl";
export type { SupplierAdapter, SupplierCatalogResult, RawSupplierProduct } from "./types";
