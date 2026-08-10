/**
 * Generates the 5 curated showroom "finished rooms" end-to-end from one
 * command instead of clicking through Looks Studio 5 times: for each
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
 * The "art" slot is never picked from the catalog — it's always a custom
 * AI-generated print (lib/ai/posterArt.ts), sized to a real Gelato paper
 * format and persisted as a real product (lib/productSearchDb.ts's
 * upsertProduct) so it's clickable/priced like every other item, not just
 * a scene decoration.
 *
 * Each concept also gets ONE small accent item searched live from CJ
 * Dropshipping (lib/suppliers/cjdropshipping.ts), when CJ_API_KEY is set —
 * always a small decor/textile piece, never furniture. CJ's dimension
 * fields are confirmed (against two real products) to be packaging size,
 * not real item size, so anything whose on-image scale matters a lot
 * stays sourced from VidaXL, which has real confirmed dimensions.
 *
 * A category with no real photographed match in your catalog is skipped
 * for that room rather than aborting the whole thing — a 5-item room still
 * beats no room. Check the console output per room to see what actually
 * got picked and swap scripts/compose-finished-room.ts in for a specific
 * category if a pick looks off.
 *
 * Usage — zero-argument mode (the easy one, and now the default):
 *   npx tsx scripts/generate-showroom-rooms.ts
 *   No room photo needed — each concept generates its own empty base room
 *   via lib/ai/generateRoom.ts (same AI-generated-base-room technique
 *   scripts/generate-looks.ts uses), matched to that concept's own style,
 *   then furnishes it with the curated real product picks below. This is
 *   the more deliberate, hand-tuned sibling of generate-looks.ts's random
 *   per-style picking — use this one when you want control over exactly
 *   which materials/keywords define "Scandinavian" vs. "Dark Luxury", not
 *   just "any 3-6 products tagged with that style."
 *
 * Usage — explicit paths, one REAL photo per concept (optional):
 *   npx tsx scripts/generate-showroom-rooms.ts <room1.jpg> [room2.jpg] ...
 *   In order, matching CONCEPTS below. Fewer paths than concepts reuses
 *   the last one for the rest. Only useful if you specifically want a
 *   real (not AI-generated) base room for some or all of these.
 *
 * Reads ANTHROPIC_API_KEY, OPENAI_API_KEY, DATABASE_URL from .env.
 */
import { existsSync, readFileSync } from "fs";
import { checkRenderedProductIdentity } from "../lib/ai/identityCheck";
import { compositingEnabled, composeSceneWithProducts, reshapeBoxForProduct, type SceneItem } from "../lib/ai/composite";
import { suggestPlacements } from "../lib/ai/placement";
import { detectSceneItems } from "../lib/ai/locate";
import { generateBaseRoomPhoto } from "../lib/ai/generateRoom";
import { generatePosterArtwork, buildPosterProduct, toCatalogImageUrl } from "../lib/ai/posterArt";
import { cjEnabled, searchCjProducts } from "../lib/suppliers/cjdropshipping";
import { createFinishedRoom } from "../lib/finishedRooms";
import { dbEnabled } from "../lib/db";
import { loadProductCatalog, upsertProduct } from "../lib/productSearchDb";
import { searchProducts } from "../lib/productSearch";
import { STYLE_MAP } from "../lib/styles";
import type { DetectionBox, Product, ProductCategory } from "../lib/types";

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
  /** Which lib/styles.ts style id to generate the empty base room photo in, when no real photo is supplied. */
  primaryStyleId: string;
  items: ConceptItem[];
  /**
   * One small accent item sourced live from CJ Dropshipping, English
   * keyword (material + object, e.g. "rattan basket" — CJ has no concept
   * of style names). Deliberately a small decor/textile piece, never
   * furniture: CJ's dimension fields are confirmed to be packaging size,
   * not real item size (lib/suppliers/cjdropshipping.ts's module doc),
   * so anything whose on-image scale matters a lot (a sofa, a table)
   * stays sourced from VidaXL, which has real confirmed dimensions.
   * Skipped silently if CJ_API_KEY isn't set or nothing matches.
   */
  cjAccent: { category: ProductCategory; keyword: string };
}

const CONCEPTS: Concept[] = [
  {
    title: "Scandinavian Living Room",
    description: "Light oak tones, undyed wool, and soft daylight — a calm, airy Scandinavian living room.",
    primaryStyleId: "scandinavian",
    cjAccent: { category: "decor", keyword: "ceramic vase" },
    items: [
      { category: "sofa", keywords: ["eiche", "boucle", "leinen", "beige", "linen", "3-sitzer", "sitzer sofa"], styleIds: ["scandinavian"] },
      { category: "chair", keywords: ["eiche", "sessel", "boucle", "leinen"], styleIds: ["scandinavian"] },
      { category: "table", keywords: ["eiche", "couchtisch", "rund", "oval", "oak"], styleIds: ["scandinavian"] },
      { category: "rug", keywords: ["teppich", "wolle", "beige", "creme", "wool"], styleIds: ["scandinavian"] },
      { category: "lighting", keywords: ["stehlampe", "papier", "floor lamp"], styleIds: ["scandinavian"] },
      { category: "plant", keywords: ["olivenbaum", "kunstpflanze", "pflanze", "plant"], styleIds: ["scandinavian", "mediterranean"] },
      { category: "storage", keywords: ["sideboard", "kommode", "eiche", "oak"], styleIds: ["scandinavian"] },
      { category: "textile", keywords: ["decke", "plaid", "kissen", "throw"], styleIds: ["scandinavian", "cozy"] },
    ],
  },
  {
    title: "Dark Luxury Living Room",
    description: "Emerald velvet, marble, and brass — a moody, statement living room.",
    primaryStyleId: "darkluxury",
    cjAccent: { category: "decor", keyword: "brass candle holder" },
    items: [
      { category: "sofa", keywords: ["samt", "velvet", "grun", "smaragd", "blau", "navy"], styleIds: ["darkluxury"] },
      { category: "chair", keywords: ["samt", "velvet", "sessel", "cocktailsessel"], styleIds: ["darkluxury", "modernluxury"] },
      { category: "table", keywords: ["marmor", "marble", "couchtisch", "schwarz"], styleIds: ["darkluxury", "modernluxury"] },
      { category: "rug", keywords: ["teppich", "dunkel", "muster", "orient"], styleIds: ["darkluxury"] },
      { category: "lighting", keywords: ["stehlampe", "messing", "brass", "gold"], styleIds: ["darkluxury", "modernluxury"] },
      { category: "storage", keywords: ["sideboard", "kommode", "schwarz", "walnuss", "walnut"], styleIds: ["darkluxury", "modernluxury"] },
      { category: "textile", keywords: ["kissen", "samt", "velvet", "cushion"], styleIds: ["darkluxury"] },
    ],
  },
  {
    title: "Japandi Living Room",
    description: "Low furniture, natural linen and ash, and quiet negative space — a warm Japandi / organic-modern living room.",
    primaryStyleId: "japandi",
    cjAccent: { category: "textile", keyword: "linen cushion cover" },
    items: [
      { category: "sofa", keywords: ["leinen", "linen", "niedrig", "eiche", "esche", "ash"], styleIds: ["japandi", "organicmodern"] },
      { category: "chair", keywords: ["rattan", "eiche", "sessel", "esche"], styleIds: ["japandi", "organicmodern"] },
      { category: "table", keywords: ["niedrig", "couchtisch", "eiche", "low table"], styleIds: ["japandi"] },
      { category: "rug", keywords: ["teppich", "jute", "natur", "natural"], styleIds: ["japandi", "organicmodern"] },
      { category: "lighting", keywords: ["laterne", "papier", "stehlampe", "lantern"], styleIds: ["japandi"] },
      { category: "decor", keywords: ["vase", "dekovase", "steingutvase"], styleIds: ["japandi", "minimalist"] },
      { category: "plant", keywords: ["bonsai", "ficus", "pflanze", "plant"], styleIds: ["japandi"] },
      { category: "storage", keywords: ["sideboard", "kommode", "eiche", "esche"], styleIds: ["japandi"] },
      { category: "textile", keywords: ["kissen", "leinen", "cushion"], styleIds: ["japandi", "organicmodern"] },
    ],
  },
  {
    title: "Modern Luxury Living Room",
    description: "Cream boucle, marble, and brushed brass — a bright, editorial modern-luxury living room.",
    primaryStyleId: "modernluxury",
    cjAccent: { category: "decor", keyword: "marble tray" },
    items: [
      { category: "sofa", keywords: ["boucle", "creme", "beige", "samt", "sitzer"], styleIds: ["modernluxury"] },
      { category: "chair", keywords: ["sessel", "boucle", "samt", "creme", "cocktailsessel"], styleIds: ["modernluxury"] },
      { category: "table", keywords: ["marmor", "marble", "couchtisch", "messing", "brass"], styleIds: ["modernluxury", "darkluxury"] },
      { category: "rug", keywords: ["teppich", "creme", "beige", "wolle"], styleIds: ["modernluxury"] },
      { category: "lighting", keywords: ["stehlampe", "messing", "brass", "gold"], styleIds: ["modernluxury", "darkluxury"] },
      { category: "decor", keywords: ["vase", "skulptur", "dekoobjekt"], styleIds: ["modernluxury", "minimalist"] },
      { category: "storage", keywords: ["sideboard", "kommode", "hochglanz", "marmor"], styleIds: ["modernluxury"] },
      { category: "textile", keywords: ["kissen", "samt", "velvet", "seide"], styleIds: ["modernluxury"] },
    ],
  },
  {
    title: "Mediterranean Living Room",
    description: "Warm terracotta, rattan, and sun-washed linen — a relaxed Mediterranean-coastal living room.",
    primaryStyleId: "mediterranean",
    cjAccent: { category: "decor", keyword: "rattan basket" },
    items: [
      { category: "sofa", keywords: ["leinen", "linen", "terrakotta", "beige", "sitzer"], styleIds: ["mediterranean", "cozy"] },
      { category: "chair", keywords: ["rattan", "korbsessel", "sessel"], styleIds: ["mediterranean"] },
      { category: "table", keywords: ["rattan", "holz", "couchtisch", "terrakotta"], styleIds: ["mediterranean"] },
      { category: "rug", keywords: ["teppich", "jute", "natur", "terrakotta"], styleIds: ["mediterranean", "cozy"] },
      { category: "lighting", keywords: ["stehlampe", "rattan", "korb", "laterne"], styleIds: ["mediterranean"] },
      { category: "plant", keywords: ["olivenbaum", "palme", "kunstpflanze", "plant"], styleIds: ["mediterranean"] },
      { category: "decor", keywords: ["vase", "keramik", "terrakotta"], styleIds: ["mediterranean", "cozy"] },
      { category: "textile", keywords: ["kissen", "leinen", "plaid", "decke"], styleIds: ["mediterranean", "cozy"] },
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

/** Returns whether a room was actually saved — several early returns below skip a room without throwing, so callers must check this rather than just "did it throw." */
async function buildConcept(concept: Concept, catalog: Product[], roomPath: string | null, quality: "low" | "medium" | "high"): Promise<boolean> {
  console.log(`\n=== ${concept.title} (room photo: ${roomPath ?? `AI-generated, ${concept.primaryStyleId} style`}) ===`);

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
    return false;
  }

  if (cjEnabled()) {
    console.log(`  Searching CJ Dropshipping for "${concept.cjAccent.keyword}"...`);
    try {
      const [cjMatch] = await searchCjProducts(concept.cjAccent.keyword, 3);
      if (cjMatch) {
        console.log(`  ${concept.cjAccent.category} (CJ): ${cjMatch.name} (${cjMatch.id}, CHF ${cjMatch.price})`);
        matched.push({ ...cjMatch, category: concept.cjAccent.category });
      } else {
        console.warn(`  no CJ match for "${concept.cjAccent.keyword}" — skipping that accent.`);
      }
    } catch (err) {
      console.warn(`  CJ search failed (${err instanceof Error ? err.message : err}) — skipping that accent.`);
    }
  }

  const style = STYLE_MAP[concept.primaryStyleId];

  console.log(`  Generating custom poster art (${quality} quality)...`);
  const posterBuffer = await generatePosterArtwork(style, concept.title, quality);
  // The catalog row stores a compressed thumbnail; posterBuffer (full
  // resolution) is what actually gets composited, via preloadedBuffers below.
  const posterProduct: Product = {
    ...buildPosterProduct(style, concept.title),
    imageUrl: await toCatalogImageUrl(posterBuffer),
  };
  await upsertProduct(posterProduct);
  console.log(`  art: ${posterProduct.name} (${posterProduct.id}, CHF ${posterProduct.price}, provisional Gelato pricing)`);
  // Pre-loaded so the fetch loop below doesn't re-fetch this one over
  // HTTP — we already have its bytes from generation.
  const preloadedBuffers = new Map<string, Buffer>([[posterProduct.id, posterBuffer]]);
  matched.push(posterProduct);

  let roomPhoto: Buffer;
  if (roomPath) {
    roomPhoto = readFileSync(roomPath);
  } else {
    console.log(`  Generating an empty ${concept.primaryStyleId} base room photo (${quality} quality)...`);
    roomPhoto = await generateBaseRoomPhoto(style, quality);
  }

  console.log("  Analyzing room placement...");
  const placement = await suggestPlacements(roomPhoto);
  if (!placement) {
    console.error("  room placement analysis failed — skipping this room.");
    return false;
  }

  console.log(`  Fetching ${matched.length} product photo(s)...`);
  const items: SceneItem[] = [];
  const renderedProducts: Product[] = [];
  for (const product of matched) {
    let productBuffer = preloadedBuffers.get(product.id);
    if (!productBuffer) {
      const productRes = await fetch(product.imageUrl!);
      if (!productRes.ok) {
        console.warn(`  failed to fetch photo for "${product.name}" (${productRes.status}) — skipping it.`);
        continue;
      }
      productBuffer = Buffer.from(await productRes.arrayBuffer());
    }
    const suggestion = placement.placements[product.category];
    const box = await reshapeBoxForProduct(suggestion.box, productBuffer);
    items.push({ productPhoto: productBuffer, category: product.category, box, wallAngleDeg: suggestion.wallAngleDeg });
    renderedProducts.push(product);
  }
  if (items.length === 0) {
    console.error("  no product photos could be fetched — skipping this room.");
    return false;
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

  // A single vision pass over the FINISHED render locates each item's real
  // on-image position — same technique the Looks Studio route
  // (app/api/finished-rooms/generate) uses, and for the same reason: the
  // box we told the model to place something at is only a suggestion
  // inside the masked region, not guaranteed to be exactly where it landed.
  // Without this, LookDetail's clickable hotspots (RoomHotspots) have
  // nothing to pin against — createFinishedRoom's itemBoxes defaults to
  // empty, and a product with no box gets no pin at all.
  console.log("  Detecting each item's on-image position for the clickable hotspots...");
  const detected = await detectSceneItems(
    finalImage,
    renderedProducts.map((p, i) => ({ index: i + 1, name: p.name, category: p.category })),
  );
  const itemBoxes: Record<string, DetectionBox> = {};
  for (const d of detected) {
    if (d.pickedIndex >= 1 && d.pickedIndex <= renderedProducts.length) {
      itemBoxes[renderedProducts[d.pickedIndex - 1].id] = d.box;
    }
  }
  for (const product of renderedProducts) {
    if (!itemBoxes[product.id]) console.warn(`    ⚠ "${product.name}" wasn't found in the render — it won't have a clickable pin.`);
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
    itemBoxes,
    totalPrice,
  });

  console.log(`  ✓ Saved — CHF ${totalPrice} across ${items.length} item(s). View at /looks/${id}.`);
  return true;
}

async function main() {
  const argPaths = process.argv.slice(2);
  for (const p of argPaths) {
    if (!existsSync(p)) {
      console.error(`Room photo not found: ${p}`);
      process.exit(1);
    }
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

  // Each concept gets its own try/catch — a transient failure partway
  // through (OpenAI's own API returning a 5xx, a Cloudflare edge hiccup,
  // etc.) shouldn't throw away the concepts before AND after it in the
  // same run. Real, confirmed failure mode: api.openai.com briefly
  // returning a Cloudflare 520 mid-run took down the entire batch before
  // this fix, on the very first concept, wasting nothing yet but risking
  // a lot on a longer run.
  let succeeded = 0;
  for (const [i, concept] of CONCEPTS.entries()) {
    // No paths given at all -> every concept generates its own AI base
    // room. Paths given -> use them in order, reusing the last one for
    // any concept beyond the count supplied.
    const roomPath = argPaths.length === 0 ? null : (argPaths[i] ?? argPaths[argPaths.length - 1]);
    try {
      // buildConcept returns false (not a throw) for its own internal
      // skip cases (no products matched, placement failed, no photos
      // fetched) — a real, confirmed bug had this loop count ANY
      // non-throwing call as success, so a run where every room hit an
      // internal skip still printed "N/N generated" with zero rooms
      // actually saved. Only a true return value counts now.
      if (await buildConcept(concept, catalog, roomPath, quality)) succeeded++;
    } catch (err) {
      console.error(`  Failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log(`\nDone. ${succeeded}/${CONCEPTS.length} room(s) generated and published.`);
}

main().catch((err) => {
  console.error("Failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
