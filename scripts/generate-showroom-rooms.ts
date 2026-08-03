/**
 * Generates the 3 curated showroom "finished rooms" end-to-end from one
 * command instead of clicking through Looks Studio 3 times: for each
 * concept below, auto-picks the best real catalog product per category
 * (lib/productSearch.ts's searchProducts — German-keyword matching against
 * the real VidaXL feed text, the same technique the Designer Agent's own
 * catalog search already relies on since the feed itself is German),
 * composites the whole scene in ONE call with no style direction
 * (composeSceneWithProducts's masked, explicit-item-list path — every
 * object in the result is guaranteed to be one of the picked real
 * products, never a freeform staging addition), and saves it via
 * createFinishedRoom. Same underlying pipeline as
 * scripts/compose-finished-room.ts and the Looks Studio route — this just
 * automates the product-picking step too instead of manual dropdowns.
 *
 * A category with no real photographed match in your catalog is skipped
 * for that room rather than aborting the whole thing — a 5-item room still
 * beats no room. Check the console output per room to see what actually
 * got picked and swap scripts/compose-finished-room.ts in for a specific
 * category if a pick looks off.
 *
 * Usage — zero-argument mode (the easy one):
 *   Drop your room photo at "room.jpg" in the project root (already
 *   gitignored — same file every other test-composite/test-generate
 *   script in this folder already uses) and just run:
 *     npx tsx scripts/generate-showroom-rooms.ts
 *   That one photo is reused for all 3 concepts, which is normal for a
 *   showroom demo.
 *
 * Usage — explicit paths, one photo per concept:
 *   npx tsx scripts/generate-showroom-rooms.ts <room1.jpg> [room2.jpg] [room3.jpg]
 *   In order: Scandinavian, Dark Luxury, Japandi/Organic Modern. Fewer
 *   than 3 paths given reuses the last one for the rest.
 *
 * Reads ANTHROPIC_API_KEY, OPENAI_API_KEY, DATABASE_URL from .env.
 */
import { existsSync, readFileSync } from "fs";
import { checkRenderedProductIdentity } from "../lib/ai/identityCheck";
import { compositingEnabled, composeSceneWithProducts, reshapeBoxForProduct, type SceneItem } from "../lib/ai/composite";
import { suggestPlacements } from "../lib/ai/placement";
import { createFinishedRoom } from "../lib/finishedRooms";
import { dbEnabled } from "../lib/db";
import { loadProductCatalog } from "../lib/productSearchDb";
import { searchProducts } from "../lib/productSearch";
import type { Product, ProductCategory } from "../lib/types";

try {
  process.loadEnvFile?.();
} catch {
  // No .env file yet — fall through to the clearer "not configured" checks below.
}

interface ConceptItem {
  category: ProductCategory;
  /** German-first — the real VidaXL feed's titles/blurbs are German (CH-DE); English terms are a harmless secondary net. */
  keywords: string[];
  styleIds: string[];
}

interface Concept {
  title: string;
  description: string;
  items: ConceptItem[];
}

const CONCEPTS: Concept[] = [
  {
    title: "Scandinavian Living Room",
    description: "Light oak tones, undyed wool, and soft daylight — a calm, airy Scandinavian living room.",
    items: [
      { category: "sofa", keywords: ["eiche", "boucle", "leinen", "beige", "linen", "3-sitzer", "sitzer sofa"], styleIds: ["scandinavian"] },
      { category: "table", keywords: ["eiche", "couchtisch", "rund", "oval", "oak"], styleIds: ["scandinavian"] },
      { category: "rug", keywords: ["teppich", "wolle", "beige", "creme", "wool"], styleIds: ["scandinavian"] },
      { category: "lighting", keywords: ["stehlampe", "papier", "floor lamp"], styleIds: ["scandinavian"] },
      { category: "art", keywords: ["wandbild", "poster", "print", "leinwand"], styleIds: ["scandinavian", "minimalist"] },
      { category: "plant", keywords: ["olivenbaum", "kunstpflanze", "pflanze", "plant"], styleIds: ["scandinavian", "mediterranean"] },
      { category: "textile", keywords: ["decke", "plaid", "kissen", "throw"], styleIds: ["scandinavian", "cozy"] },
    ],
  },
  {
    title: "Dark Luxury Living Room",
    description: "Emerald velvet, marble, and brass — a moody, statement living room.",
    items: [
      { category: "sofa", keywords: ["samt", "velvet", "grun", "smaragd", "blau", "navy"], styleIds: ["darkluxury"] },
      { category: "table", keywords: ["marmor", "marble", "couchtisch", "schwarz"], styleIds: ["darkluxury", "modernluxury"] },
      { category: "rug", keywords: ["teppich", "dunkel", "muster", "orient"], styleIds: ["darkluxury"] },
      { category: "lighting", keywords: ["stehlampe", "messing", "brass", "gold"], styleIds: ["darkluxury", "modernluxury"] },
      { category: "art", keywords: ["wandbild", "gold", "gerahmt", "gerahmtes"], styleIds: ["darkluxury", "modernluxury"] },
      { category: "storage", keywords: ["sideboard", "kommode", "schwarz", "walnuss", "walnut"], styleIds: ["darkluxury", "modernluxury"] },
      { category: "textile", keywords: ["kissen", "samt", "velvet", "cushion"], styleIds: ["darkluxury"] },
    ],
  },
  {
    title: "Japandi Living Room",
    description: "Low furniture, natural linen and ash, and quiet negative space — a warm Japandi / organic-modern living room.",
    items: [
      { category: "sofa", keywords: ["leinen", "linen", "niedrig", "eiche", "esche", "ash"], styleIds: ["japandi", "organicmodern"] },
      { category: "table", keywords: ["niedrig", "couchtisch", "eiche", "low table"], styleIds: ["japandi"] },
      { category: "rug", keywords: ["teppich", "jute", "natur", "natural"], styleIds: ["japandi", "organicmodern"] },
      { category: "lighting", keywords: ["laterne", "papier", "stehlampe", "lantern"], styleIds: ["japandi"] },
      { category: "decor", keywords: ["vase", "dekovase", "steingutvase"], styleIds: ["japandi", "minimalist"] },
      { category: "plant", keywords: ["bonsai", "ficus", "pflanze", "plant"], styleIds: ["japandi"] },
    ],
  },
];

/**
 * Hard-excluded regardless of category or keyword score, checked BEFORE
 * scoring — not a soft penalty. A real, confirmed failure: this app's
 * category taxonomy is coarse enough that a children's sofa is still
 * category "sofa" and a pizza oven's ceramic stone still substring-matched
 * a "keramik" (ceramic) decor keyword, so either could win a slot purely
 * on an incidental keyword collision. These terms should never belong in
 * an adult living-room showroom scene no matter what else matches.
 */
const EXCLUDE_TERMS = ["kinder", "baby", "welpen", "hunde", "katzen", "haustier", "grill", "pizzaofen"];

function isExcluded(product: Product): boolean {
  const text = product.name.toLowerCase();
  return EXCLUDE_TERMS.some((t) => text.includes(t));
}

/** Best real, photographed catalog match for one recipe slot — null if the catalog has nothing usable (or nothing NOT excluded) in that category. */
function pickBest(catalog: Product[], item: ConceptItem): Product | null {
  const withPhotos = catalog.filter((p) => p.category === item.category && p.imageUrl && !isExcluded(p));
  if (withPhotos.length === 0) return null;
  const [best] = searchProducts(withPhotos, { category: item.category, keywords: item.keywords, styleIds: item.styleIds, limit: 1 });
  return best ?? null;
}

async function buildConcept(concept: Concept, catalog: Product[], roomPath: string, quality: "low" | "medium" | "high") {
  console.log(`\n=== ${concept.title} (room photo: ${roomPath}) ===`);

  const matched: Product[] = [];
  for (const item of concept.items) {
    const match = pickBest(catalog, item);
    if (!match) {
      console.warn(`  no real "${item.category}" product with a photo found — skipping that slot.`);
      continue;
    }
    console.log(`  ${item.category}: ${match.name} (${match.id}, CHF ${match.price})`);
    matched.push(match);
  }
  if (matched.length === 0) {
    console.error(`  no products matched at all for "${concept.title}" — skipping this room entirely.`);
    return;
  }

  console.log("  Analyzing room placement...");
  const roomPhoto = readFileSync(roomPath);
  const placement = await suggestPlacements(roomPhoto);
  if (!placement) {
    console.error("  room placement analysis failed — skipping this room.");
    return;
  }

  console.log(`  Fetching ${matched.length} product photo(s)...`);
  const items: SceneItem[] = [];
  const renderedProducts: Product[] = [];
  for (const product of matched) {
    const productRes = await fetch(product.imageUrl!);
    if (!productRes.ok) {
      console.warn(`  failed to fetch photo for "${product.name}" (${productRes.status}) — skipping it.`);
      continue;
    }
    const productBuffer = Buffer.from(await productRes.arrayBuffer());
    const suggestion = placement.placements[product.category];
    const box = await reshapeBoxForProduct(suggestion.box, productBuffer);
    items.push({ productPhoto: productBuffer, category: product.category, box, wallAngleDeg: suggestion.wallAngleDeg });
    renderedProducts.push(product);
  }
  if (items.length === 0) {
    console.error("  no product photos could be fetched — skipping this room.");
    return;
  }

  console.log(`  Compositing the whole scene in one call (${quality} quality, ${items.length} item(s))...`);
  const result = await composeSceneWithProducts(roomPhoto, items, quality);
  const finalImage = Buffer.from(result.imageBase64, "base64");

  console.log("  Reviewing the result against each product photo...");
  for (const [i, product] of renderedProducts.entries()) {
    const check = await checkRenderedProductIdentity(items[i].productPhoto, finalImage, items[i].box);
    if (check && !check.pass) console.warn(`    ⚠ "${product.name}": ${check.note}`);
    else if (check) console.log(`    ✓ "${product.name}" looks right.`);
  }

  const totalPrice = renderedProducts.reduce((sum, p) => sum + p.price, 0);
  const styleTags = Array.from(new Set(renderedProducts.flatMap((p) => p.styles)));

  console.log("  Saving finished room...");
  const id = await createFinishedRoom({
    title: concept.title,
    description: concept.description,
    styleTags,
    heroImageBase64: finalImage.toString("base64"),
    productIds: renderedProducts.map((p) => p.id),
    totalPrice,
  });

  console.log(`  ✓ Saved — CHF ${totalPrice} across ${items.length} item(s). View at /looks/${id}.`);
}

const DEFAULT_ROOM_PATH = "room.jpg";

async function main() {
  const argPaths = process.argv.slice(2);
  const roomPaths = argPaths.length > 0 ? argPaths : [DEFAULT_ROOM_PATH];

  if (!existsSync(roomPaths[0])) {
    console.error(
      argPaths.length > 0
        ? `Room photo not found: ${roomPaths[0]}`
        : `No room photo given and "${DEFAULT_ROOM_PATH}" doesn't exist in the project root. Drop your photo there ` +
          `(it's gitignored already) and re-run with no arguments, or pass a path directly: ` +
          "npx tsx scripts/generate-showroom-rooms.ts <room1.jpg> [room2.jpg] [room3.jpg]",
    );
    process.exit(1);
  }
  if (!compositingEnabled()) {
    console.error("OPENAI_API_KEY is not set. Add it to .env first.");
    process.exit(1);
  }
  if (!dbEnabled()) {
    console.error("DATABASE_URL is not set — finished rooms need persistence. Add it to .env first.");
    process.exit(1);
  }

  // Public storefront content, not a one-off customer preview — worth the
  // extra cost over the low/medium tiers used elsewhere in this app (see
  // lib/ai/composite.ts's compositeProductIntoRoom for the same reasoning).
  const quality: "low" | "medium" | "high" = "high";

  console.log("Loading product catalog...");
  const catalog = await loadProductCatalog();
  console.log(`${catalog.length} product(s) in the catalog.`);

  for (const [i, concept] of CONCEPTS.entries()) {
    const roomPath = roomPaths[i] ?? roomPaths[roomPaths.length - 1];
    await buildConcept(concept, catalog, roomPath, quality);
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
