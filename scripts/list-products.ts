/**
 * Quick lookup for real product ids to feed into
 * scripts/compose-finished-room.ts — that script needs exact catalog ids
 * (e.g. "vidaxl-247598"), which aren't shown anywhere in the UI today.
 *
 * Usage:
 *   npx tsx scripts/list-products.ts [category] [search term]
 *
 * Examples:
 *   npx tsx scripts/list-products.ts sofa
 *   npx tsx scripts/list-products.ts sofa grau
 *   npx tsx scripts/list-products.ts "" tisch
 */
import { loadProductCatalog } from "../lib/productSearchDb";

try {
  process.loadEnvFile?.();
} catch {
  // No .env file yet — the catalog still loads from the live/sample feed either way.
}

async function main() {
  const [category, search] = process.argv.slice(2);
  const catalog = await loadProductCatalog();

  const filtered = catalog.filter((p) => {
    if (category && p.category !== category) return false;
    if (search && !`${p.name} ${p.color}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  console.log(`${filtered.length} of ${catalog.length} product(s):\n`);
  for (const p of filtered.slice(0, 60)) {
    console.log(`${p.id}\t${p.category}\tCHF ${p.price}\t${p.name}`);
  }
  if (filtered.length > 60) console.log(`\n...and ${filtered.length - 60} more — narrow with a category/search term.`);
}

main().catch((err) => {
  console.error("Failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
