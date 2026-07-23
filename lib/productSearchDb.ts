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

// The finished-rooms matcher and the designer search both need the WHOLE
// catalog in memory to score against (they rank every product by relevance),
// so we can't push that work into SQL — but re-fetching every row from Neon
// on each request is wasteful once the catalog is tens of thousands of rows.
// Cache the loaded catalog per warm serverless instance for a short window;
// the catalog only changes when the seed script re-runs, so a few minutes of
// staleness is harmless and turns N row-fetches per request into ~zero.
let catalogCache: { products: Product[]; loadedAt: number } | null = null;
const CATALOG_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Prefers the Postgres catalog (seeded via scripts/seed-products.ts) so
 * search scales past an in-memory JSON scan against the live supplier
 * fetch on every request. Falls back to fetchVidaxlCatalog() whenever the
 * DB isn't configured, hasn't been seeded yet, or errors — the scoring
 * logic in lib/productSearch.ts stays exactly as tested either way; only
 * where the Product[] array comes from changes. Result is cached in-process
 * for CATALOG_CACHE_TTL_MS (see above).
 */
export async function loadProductCatalog(): Promise<Product[]> {
  if (catalogCache && Date.now() - catalogCache.loadedAt < CATALOG_CACHE_TTL_MS) {
    return catalogCache.products;
  }
  const products = await loadProductCatalogUncached();
  catalogCache = { products, loadedAt: Date.now() };
  return products;
}

async function loadProductCatalogUncached(): Promise<Product[]> {
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

export interface MarketplacePage {
  products: Product[];
  totalCount: number;
}

/**
 * Paginated, filtered catalog page for the public Marketplace — unlike
 * loadProductCatalog() above (which loads everything for the search/
 * matching scorers to rank), a shop grid must never ship tens of thousands
 * of products to the browser. Filters in SQL against the indexed category
 * column and the styles array; falls back to slicing the in-memory catalog
 * when the DB isn't configured or the query fails.
 */
export async function loadMarketplacePage(opts: {
  category?: ProductCategory;
  styleId?: string;
  page: number;
  pageSize: number;
}): Promise<MarketplacePage> {
  const { category, styleId, page, pageSize } = opts;
  const offset = Math.max(0, page - 1) * pageSize;

  if (dbEnabled()) {
    try {
      await ensureSchema();
      const db = sql();
      const rows = await db`
        SELECT * FROM products
        WHERE (${category ?? null}::text IS NULL OR category = ${category ?? null})
          AND (${styleId ?? null}::text IS NULL OR ${styleId ?? null} = ANY(styles))
        ORDER BY updated_at DESC, id
        LIMIT ${pageSize} OFFSET ${offset}
      `;
      const countRows = await db`
        SELECT COUNT(*)::int AS count FROM products
        WHERE (${category ?? null}::text IS NULL OR category = ${category ?? null})
          AND (${styleId ?? null}::text IS NULL OR ${styleId ?? null} = ANY(styles))
      `;
      const totalCount = Number(countRows[0]?.count ?? 0);
      if (totalCount > 0) return { products: rows.map(rowToProduct), totalCount };
    } catch {
      // DB reachable but query failed — fall through to the in-memory fallback.
    }
  }

  const all = await loadProductCatalog();
  const filtered = all.filter(
    (p) => (!category || p.category === category) && (!styleId || p.styles.includes(styleId)),
  );
  return { products: filtered.slice(offset, offset + pageSize), totalCount: filtered.length };
}
