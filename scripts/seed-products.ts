/**
 * Seeds (or refreshes) the Postgres `products` table so search and the
 * finished-rooms matcher run against a real DB table (lib/productSearchDb.ts)
 * instead of scanning the bundled JSON. Safe to re-run — every row is
 * upserted by id.
 *
 * Source, in priority order:
 *   1. scripts/data/vidaxl-full.json — the FULL catalog written by
 *      scripts/ingest-vidaxl-feed.py (tens of thousands of products). This is
 *      the real catalog; use it whenever it exists.
 *   2. fetchVidaxlCatalog() — the live API (if VIDAXL_* env is set) or the
 *      small bundled sample otherwise. The fallback when the full file isn't
 *      present.
 *
 * Usage: npx tsx scripts/seed-products.ts
 * Reads DATABASE_URL from .env in the current directory.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { ensureSchema, sql } from "../lib/db";
import { fetchVidaxlCatalog, mapVidaxlSampleFeed } from "../lib/suppliers";
import type { Product } from "../lib/types";

try {
  process.loadEnvFile?.();
} catch {
  // No .env file yet — fall through to the clearer "DATABASE_URL not configured" error below.
}

// Run from the repo root (like the .env load above): scripts/ingest-vidaxl-feed.py
// writes the full catalog here.
const FULL_CATALOG_PATH = join(process.cwd(), "scripts", "data", "vidaxl-full.json");

async function loadSeedProducts(): Promise<Product[]> {
  if (existsSync(FULL_CATALOG_PATH)) {
    console.log(`Loading full catalog from ${FULL_CATALOG_PATH}...`);
    const items = JSON.parse(readFileSync(FULL_CATALOG_PATH, "utf8")) as unknown[];
    const products = mapVidaxlSampleFeed(items);
    console.log(`Mapped ${products.length} products from the full catalog.`);
    return products;
  }
  console.log("No full catalog file found — falling back to fetchVidaxlCatalog() (live API or bundled sample).");
  console.log("Run scripts/ingest-vidaxl-feed.py against the VidaXL CSVs first to seed the full catalog.");
  const { products } = await fetchVidaxlCatalog();
  return products;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set. Add it to .env first.");
    process.exit(1);
  }

  const products = await loadSeedProducts();
  console.log(`Seeding ${products.length} products. Ensuring schema...`);
  await ensureSchema();

  const db = sql();
  let upserted = 0;
  for (const p of products) {
    await db`
      INSERT INTO products (
        id, supplier_id, supplier_label, sku, name, brand, category, price, rating, reviews,
        styles, color, blurb, image_url, product_url, cost_price, dimensions_cm, updated_at
      ) VALUES (
        ${p.id}, ${p.supplier?.id ?? ""}, ${p.supplier?.label ?? ""}, ${p.supplier?.sku ?? ""},
        ${p.name}, ${p.brand}, ${p.category}, ${p.price}, ${p.rating}, ${p.reviews},
        ${p.styles}, ${p.color}, ${p.blurb}, ${p.imageUrl ?? null}, ${p.productUrl ?? null},
        ${p.supplier?.costPrice ?? null}, ${p.dimensionsCm ? JSON.stringify(p.dimensionsCm) : null}, now()
      )
      ON CONFLICT (id) DO UPDATE SET
        supplier_id = EXCLUDED.supplier_id,
        supplier_label = EXCLUDED.supplier_label,
        sku = EXCLUDED.sku,
        name = EXCLUDED.name,
        brand = EXCLUDED.brand,
        category = EXCLUDED.category,
        price = EXCLUDED.price,
        rating = EXCLUDED.rating,
        reviews = EXCLUDED.reviews,
        styles = EXCLUDED.styles,
        color = EXCLUDED.color,
        blurb = EXCLUDED.blurb,
        image_url = EXCLUDED.image_url,
        product_url = EXCLUDED.product_url,
        cost_price = EXCLUDED.cost_price,
        dimensions_cm = EXCLUDED.dimensions_cm,
        updated_at = now()
    `;
    upserted++;
    if (upserted % 25 === 0) console.log(`  ${upserted}/${products.length}...`);
  }

  console.log(`Done. Upserted ${upserted} products into Postgres.`);
}

main().catch((err) => {
  console.error("Seed failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
