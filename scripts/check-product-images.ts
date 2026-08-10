/**
 * Reports how many catalogue rows actually carry a multi-photo gallery.
 *
 * The product page shows a gallery only when `imageUrls` has more than one
 * entry (components/ProductDetailPanel.tsx) — it never invents images. So
 * "this product only has one picture" has three possible causes, and this
 * tells you which:
 *
 *   1. image_urls is NULL on most rows -> the catalogue was seeded before
 *      that column was populated. Re-run scripts/seed-products.ts.
 *   2. image_urls is set but has one entry -> that product genuinely
 *      shipped one photo in the feed.
 *   3. The row came from the live VidaXL REST API rather than the bulk
 *      CSV feed. The REST API returns no images at all; only the CSV
 *      ingest (scripts/ingest-vidaxl-feed.py) has them.
 *
 * Read-only. Reads DATABASE_URL from .env.
 *
 * Usage:
 *   npx tsx scripts/check-product-images.ts [name substring]
 */
import { dbEnabled, ensureSchema, sql } from "../lib/db";

try {
  process.loadEnvFile?.();
} catch {
  // No .env file yet — the check below gives a clearer error.
}

async function main() {
  if (!dbEnabled()) {
    console.error("DATABASE_URL is not set. Add it to .env first.");
    process.exit(1);
  }
  await ensureSchema();
  const db = sql();

  const [totals] = await db`
    SELECT
      COUNT(*)::int                                            AS total,
      COUNT(image_url)::int                                    AS with_hero,
      COUNT(image_urls)::int                                   AS with_gallery_column,
      COUNT(*) FILTER (WHERE COALESCE(array_length(image_urls, 1), 0) > 1)::int AS with_real_gallery
    FROM products
  `;
  console.log("Catalogue image coverage");
  console.log(`  products:                    ${totals.total}`);
  console.log(`  with a hero image:           ${totals.with_hero}`);
  console.log(`  with image_urls set at all:  ${totals.with_gallery_column}`);
  console.log(`  with MORE THAN ONE photo:    ${totals.with_real_gallery}   <- these show a gallery`);

  if (totals.with_real_gallery === 0) {
    console.log("\nNo product has a gallery. The catalogue was almost certainly seeded before");
    console.log("image_urls was populated, or from the REST API (which returns no images).");
    console.log("Fix: npx tsx scripts/seed-products.ts   (needs scripts/data/vidaxl-full.json)");
  }

  const needle = process.argv[2];
  if (needle) {
    const rows = await db`
      SELECT name, COALESCE(array_length(image_urls, 1), 0) AS photos
      FROM products
      WHERE name ILIKE ${"%" + needle + "%"}
      ORDER BY photos DESC
      LIMIT 10
    `;
    console.log(`\nMatching "${needle}":`);
    if (rows.length === 0) console.log("  (nothing found)");
    for (const r of rows) console.log(`  ${r.photos} photo(s)  ${r.name}`);
  }
}

main().catch((err) => {
  console.error("Failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
