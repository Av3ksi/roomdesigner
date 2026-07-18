/**
 * Seeds (or refreshes) the Postgres `products` table from the live VidaXL
 * catalog fetch, so the Designer Agent's search can run against a real DB
 * table (lib/productSearchDb.ts) instead of scanning the in-memory JSON on
 * every request. Safe to re-run — every row is upserted by id.
 *
 * Usage: npx tsx scripts/seed-products.ts
 * Reads DATABASE_URL from .env in the current directory.
 */
import { ensureSchema, sql } from "../lib/db";
import { fetchVidaxlCatalog } from "../lib/suppliers";

try {
  process.loadEnvFile?.();
} catch {
  // No .env file yet — fall through to the clearer "DATABASE_URL not configured" error below.
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set. Add it to .env first.");
    process.exit(1);
  }

  console.log("Fetching VidaXL catalog...");
  const { products } = await fetchVidaxlCatalog();
  console.log(`Fetched ${products.length} products. Ensuring schema...`);
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
