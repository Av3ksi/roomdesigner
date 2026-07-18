import { dbEnabled, ensureSchema, sql } from "./db";
import { fetchVidaxlCatalog } from "./suppliers";
import type { Product, ProductCategory } from "./types";

function rowToProduct(row: Record<string, unknown>): Product {
  const dimensionsCm = row.dimensions_cm as Product["dimensionsCm"] | null;
  return {
    id: row.id as string,
    name: row.name as string,
    brand: row.brand as string,
    category: row.category as ProductCategory,
    price: Number(row.price),
    rating: Number(row.rating),
    reviews: Number(row.reviews),
    styles: (row.styles as string[] | null) ?? [],
    color: row.color as string,
    blurb: row.blurb as string,
    supplier: {
      id: row.supplier_id as string,
      label: row.supplier_label as string,
      sku: row.sku as string,
      costPrice: row.cost_price != null ? Number(row.cost_price) : 0,
    },
    imageUrl: (row.image_url as string | null) ?? undefined,
    productUrl: (row.product_url as string | null) ?? undefined,
    dimensionsCm: dimensionsCm ?? undefined,
  };
}

/**
 * Prefers the Postgres catalog (seeded via scripts/seed-products.ts) so
 * search scales past an in-memory JSON scan against the live supplier
 * fetch on every request. Falls back to fetchVidaxlCatalog() whenever the
 * DB isn't configured, hasn't been seeded yet, or errors — the scoring
 * logic in lib/productSearch.ts stays exactly as tested either way; only
 * where the Product[] array comes from changes.
 */
export async function loadProductCatalog(): Promise<Product[]> {
  if (dbEnabled()) {
    try {
      await ensureSchema();
      const db = sql();
      const rows = await db`SELECT * FROM products`;
      if (rows.length > 0) return rows.map(rowToProduct);
    } catch {
      // DB reachable but query failed (unseeded schema drift, etc.) — fall through.
    }
  }
  const catalog = await fetchVidaxlCatalog();
  return catalog.products;
}
