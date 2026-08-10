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
 * Usage — zero-argument mode (the easy one, and the default):
 *   npx tsx scripts/generate-showroom-rooms.ts
 *   Generates ONE room (see DEFAULT_COUNT). No room photo needed — the
 *   concept generates its own empty base room via lib/ai/generateRoom.ts
 *   (same AI-generated-base-room technique scripts/generate-looks.ts
 *   uses), matched to that concept's own style, then furnishes it with the
 *   curated real product picks below. This is the more deliberate,
 *   hand-tuned sibling of generate-looks.ts's random per-style picking —
 *   use this one when you want control over exactly which materials/
 *   keywords define "Scandinavian" vs. "Dark Luxury", not just "any 3-6
 *   products tagged with that style."
 *
 * Usage — see what a run WOULD pick, for free:
 *   npx tsx scripts/generate-showroom-rooms.ts 4 --dry-run
 *   Does every catalog lookup and prints the exact product each slot would
 *   get, then stops before the first image generation. Costs nothing. Run
 *   this first whenever the concepts or their keywords have been edited:
 *   an empty slot or an absurd pick is far cheaper to find here than in
 *   the finished render.
 *
 * Usage — more rooms, once one has come out well:
 *   npx tsx scripts/generate-showroom-rooms.ts 4
 *   Takes the first N concepts below. Each room costs real money (two
 *   image generations plus a composite, all at "high" quality), which is
 *   why one is the default rather than the whole set.
 *
 * Usage — explicit paths, one REAL photo per concept (optional):
 *   npx tsx scripts/generate-showroom-rooms.ts <room1.jpg> [room2.jpg] ...
 *   npx tsx scripts/generate-showroom-rooms.ts 3 <room1.jpg>
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
import { searchProducts, findBestCatalogMatch } from "../lib/productSearch";
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
  /**
   * Smallest real width (cm) this slot will accept. Search tie-breaks on
   * ascending price and the cheapest row in a category is usually the
   * smallest, so without a floor the "rug" slot picks a 90 x 90 doormat and
   * "sofa" picks a 74 cm sofa bed — both confirmed on the real feed.
   * Only enforced on products whose size the feed actually stated.
   */
  minWidthCm?: number;
  /** As above but on the longest side, for things defined by height rather than width (a floor lamp). */
  minLongestSideCm?: number;
  /**
   * Slot-specific bans, on top of the global EXCLUDE_TERMS. For the times a
   * word is legitimate in one category and disqualifying in another: a
   * "Sofa-Sessel" is a fine armchair but not a living room's main sofa,
   * and "Decke" means blanket, duvet AND ceiling in German, so the textile
   * slot has to say which it does not want.
   */
  excludeTerms?: string[];
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

/**
 * Size floors, in real centimetres, for the slots where "cheapest match"
 * and "right for a living room" pull hardest in opposite directions.
 *
 * searchProducts tie-breaks on ascending price, and in a general
 * wholesaler's feed the cheapest row in a category is almost always the
 * smallest one. Confirmed on the real catalog, all four rooms at once: the
 * rug slot picked a 90 x 90 cm anti-slip mat, the sofa slot a 74 cm sofa
 * bed, the lighting slot six 9 cm ceiling spotlights. Each was a legitimate
 * keyword match and each would have been composited at full price.
 *
 * These are "unmistakably the real thing" floors, not averages — set low
 * enough that a small-but-genuine piece still qualifies.
 */
const SOFA_MIN_WIDTH_CM = 150;
const CHAIR_MIN_WIDTH_CM = 55;
const COFFEE_TABLE_MIN_WIDTH_CM = 70;
const RUG_MIN_WIDTH_CM = 150;
const STORAGE_MIN_WIDTH_CM = 80;
/** Longest side, not width: a floor lamp is defined by being tall. */
const FLOOR_LAMP_MIN_SIDE_CM = 100;
/** Same reasoning — a 20 cm desk succulent reads as nothing in a wide room shot. */
const PLANT_MIN_SIDE_CM = 60;

/**
 * Slot-specific exclusions. Each of these is a real wrong pick the dry run
 * caught, not a hypothetical.
 */
/** Sofa-shaped things that are not a living room's main sofa. */
const NOT_A_MAIN_SOFA = ["sofa-sessel", "pallet", "palette", "hundesofa", "puppensofa", "aufblasbar"];
/** "Massagesessel" (massage chair) and office seating won a lounge-chair slot on the word "Sessel" alone. */
const NOT_A_LOUNGE_CHAIR = ["massage", "büro", "buro", "gaming", "schreibtischstuhl"];
/** Anti-slip mats, bath mats and doormats are all "Teppich" in this feed. */
const NOT_A_ROOM_RUG = ["anti-rutsch", "antirutsch", "fußmatte", "fussmatte", "badematte", "türmatte", "turmatte", "läufer", "laufer"];
/**
 * German "Decke" is blanket, duvet AND ceiling, so a textile slot asking
 * for a throw gets bed duvets — the confirmed cause of the "Sommerdecke"
 * that landed in an earlier room and had to be un-pinned by hand.
 */
const NOT_A_LIVING_ROOM_TEXTILE = ["bettdecke", "sommerdecke", "winterbettdecke", "winterdecke", "steppdecke", "bettwäsche", "bettwasche", "bettbezug", "spannbettlaken", "matratze", "kopfkissen", "bank"];
/** Recessed/ceiling fixtures and bulbs, which are "Leuchte" too but are not a lamp you can see in a room shot. */
const NOT_A_FLOOR_LAMP = ["strahler", "spotlight", "einbau", "leuchtmittel", "glühbirne", "gluhbirne", "lichtleiste", "led-streifen", "lichterkette"];

/**
 * WHY THESE FOUR, AND WHY NOT THE OBVIOUS ONES.
 *
 * Scandinavian and Japandi are deliberately absent — the showroom already
 * has a Scandinavian room, and the two read as near-neighbours on screen
 * (pale wood, undyed textile, high-key light), so a visitor scrolling the
 * looks grid would see the same room three times.
 *
 * The four below were picked from a coverage count over the real catalog
 * rather than by taste, because a concept the feed cannot fill produces a
 * thin room at full price. Two styles that were previously in this list —
 * Modern Luxury and Mediterranean — were dropped for exactly that reason:
 * they were the two thinnest style tags in the whole catalog. Organic
 * Modern is the best-supported style we have after Scandinavian, and Dark
 * Luxury the best-supported dark one, which is also why they lead.
 *
 * Style ids are only a SOFT relevance boost in searchProducts (weight 1,
 * against 2 per keyword hit), so a slot is really won or lost on the
 * German keyword list, not the tag. Keywords are therefore written against
 * the words the VidaXL CH-DE feed actually uses in its titles.
 *
 * Umlauts are matched literally (`text.includes(k)` over lowercased feed
 * text), so "grun" does NOT match "grün". Where a term has one, both
 * spellings are listed — a keyword that hits nothing costs nothing, and
 * feeds are inconsistent about transliterating.
 *
 * One further constraint that is easy to miss: a concept's `cjAccent`
 * category must NOT also appear in its `items`. Placement returns one box
 * per category, so two products sharing a category would be composited
 * into the same region of the room, on top of each other.
 */
const CONCEPTS: Concept[] = [
  {
    title: "Organic Modern Living Room",
    description: "Curved forms, oat and sage, raw timber and clay — a warm, softly modern living room.",
    primaryStyleId: "organicmodern",
    cjAccent: { category: "decor", keyword: "ceramic vase" },
    items: [
      { category: "sofa", keywords: ["boucle", "bouclé", "beige", "creme", "leinen", "geschwungen", "sitzer sofa"], styleIds: ["organicmodern"], minWidthCm: SOFA_MIN_WIDTH_CM, excludeTerms: NOT_A_MAIN_SOFA },
      { category: "chair", keywords: ["sessel", "boucle", "bouclé", "rattan", "beige", "geschwungen"], styleIds: ["organicmodern"], minWidthCm: CHAIR_MIN_WIDTH_CM, excludeTerms: NOT_A_LOUNGE_CHAIR },
      { category: "table", keywords: ["couchtisch", "massivholz", "mango", "akazie", "rund", "oval"], styleIds: ["organicmodern"], minWidthCm: COFFEE_TABLE_MIN_WIDTH_CM },
      { category: "rug", keywords: ["teppich", "jute", "sisal", "natur", "beige", "creme"], styleIds: ["organicmodern"], minWidthCm: RUG_MIN_WIDTH_CM, excludeTerms: NOT_A_ROOM_RUG },
      { category: "lighting", keywords: ["stehlampe", "bogenlampe", "rattan", "leinen", "stehleuchte"], styleIds: ["organicmodern"], minLongestSideCm: FLOOR_LAMP_MIN_SIDE_CM, excludeTerms: NOT_A_FLOOR_LAMP },
      { category: "plant", keywords: ["kunstpflanze", "olivenbaum", "pflanze", "kunstbaum"], styleIds: ["organicmodern"], minLongestSideCm: PLANT_MIN_SIDE_CM },
      { category: "storage", keywords: ["sideboard", "kommode", "massivholz", "mango", "rattan"], styleIds: ["organicmodern"], minWidthCm: STORAGE_MIN_WIDTH_CM },
      { category: "textile", keywords: ["kissen", "plaid", "wohndecke", "kuscheldecke", "leinen"], styleIds: ["organicmodern", "cozy"], excludeTerms: NOT_A_LIVING_ROOM_TEXTILE },
    ],
  },
  {
    title: "Dark Luxury Living Room",
    description: "Emerald velvet, marble, and brass — a moody, statement living room.",
    primaryStyleId: "darkluxury",
    cjAccent: { category: "decor", keyword: "brass candle holder" },
    items: [
      { category: "sofa", keywords: ["samt", "velvet", "grün", "gruen", "smaragd", "dunkelgrün", "blau", "navy"], styleIds: ["darkluxury"], minWidthCm: SOFA_MIN_WIDTH_CM, excludeTerms: NOT_A_MAIN_SOFA },
      { category: "chair", keywords: ["samt", "velvet", "sessel", "cocktailsessel", "ohrensessel", "dunkel", "schwarz", "grün"], styleIds: ["darkluxury", "modernluxury"], minWidthCm: CHAIR_MIN_WIDTH_CM, excludeTerms: NOT_A_LOUNGE_CHAIR },
      { category: "table", keywords: ["marmor", "marble", "couchtisch", "schwarz", "gold"], styleIds: ["darkluxury", "modernluxury"], minWidthCm: COFFEE_TABLE_MIN_WIDTH_CM },
      { category: "rug", keywords: ["teppich", "dunkel", "muster", "orient", "schwarz"], styleIds: ["darkluxury"], minWidthCm: RUG_MIN_WIDTH_CM, excludeTerms: NOT_A_ROOM_RUG },
      { category: "lighting", keywords: ["stehlampe", "messing", "gold", "stehleuchte"], styleIds: ["darkluxury", "modernluxury"], minLongestSideCm: FLOOR_LAMP_MIN_SIDE_CM, excludeTerms: NOT_A_FLOOR_LAMP },
      { category: "storage", keywords: ["sideboard", "kommode", "schwarz", "walnuss", "walnut"], styleIds: ["darkluxury", "modernluxury"], minWidthCm: STORAGE_MIN_WIDTH_CM },
      { category: "textile", keywords: ["kissen", "samt", "velvet"], styleIds: ["darkluxury"], excludeTerms: NOT_A_LIVING_ROOM_TEXTILE },
    ],
  },
  {
    title: "Industrial Loft Living Room",
    description: "Blackened steel, cognac leather and raw brick — a warm loft with a hard-edged shell.",
    primaryStyleId: "industrial",
    cjAccent: { category: "textile", keyword: "wool throw blanket" },
    items: [
      { category: "sofa", keywords: ["leder", "kunstleder", "braun", "cognac", "sitzer sofa"], styleIds: ["industrial"], minWidthCm: SOFA_MIN_WIDTH_CM, excludeTerms: NOT_A_MAIN_SOFA },
      { category: "chair", keywords: ["sessel", "leder", "kunstleder", "braun", "metall"], styleIds: ["industrial"], minWidthCm: CHAIR_MIN_WIDTH_CM, excludeTerms: NOT_A_LOUNGE_CHAIR },
      { category: "table", keywords: ["couchtisch", "metall", "schwarz", "massivholz", "industrial"], styleIds: ["industrial"], minWidthCm: COFFEE_TABLE_MIN_WIDTH_CM },
      { category: "rug", keywords: ["teppich", "vintage", "grau", "muster", "used-look"], styleIds: ["industrial"], minWidthCm: RUG_MIN_WIDTH_CM, excludeTerms: NOT_A_ROOM_RUG },
      { category: "lighting", keywords: ["stehlampe", "metall", "schwarz", "stehleuchte", "industrial"], styleIds: ["industrial"], minLongestSideCm: FLOOR_LAMP_MIN_SIDE_CM, excludeTerms: NOT_A_FLOOR_LAMP },
      { category: "storage", keywords: ["regal", "metall", "schwarz", "sideboard", "industrial"], styleIds: ["industrial"], minWidthCm: STORAGE_MIN_WIDTH_CM },
      { category: "plant", keywords: ["kunstpflanze", "pflanze", "kunstbaum", "monstera"], styleIds: ["industrial"], minLongestSideCm: PLANT_MIN_SIDE_CM },
      { category: "decor", keywords: ["vase", "schale", "deko", "metall"], styleIds: ["industrial"], excludeTerms: NOT_A_FLOOR_LAMP },
    ],
  },
  {
    title: "Cozy Layered Living Room",
    description: "Rust and oat wool, amber light and more texture than strictly necessary — a room built for evenings.",
    primaryStyleId: "cozy",
    cjAccent: { category: "decor", keyword: "scented candle jar" },
    items: [
      { category: "sofa", keywords: ["stoff", "beige", "braun", "cord", "sitzer sofa", "gemütlich", "gemutlich"], styleIds: ["cozy"], minWidthCm: SOFA_MIN_WIDTH_CM, excludeTerms: NOT_A_MAIN_SOFA },
      { category: "chair", keywords: ["sessel", "ohrensessel", "cord", "stoff", "braun"], styleIds: ["cozy"], minWidthCm: CHAIR_MIN_WIDTH_CM, excludeTerms: NOT_A_LOUNGE_CHAIR },
      { category: "table", keywords: ["couchtisch", "holz", "massivholz", "rund"], styleIds: ["cozy"], minWidthCm: COFFEE_TABLE_MIN_WIDTH_CM },
      { category: "rug", keywords: ["teppich", "hochflor", "shaggy", "wolle", "braun", "beige"], styleIds: ["cozy"], minWidthCm: RUG_MIN_WIDTH_CM, excludeTerms: NOT_A_ROOM_RUG },
      { category: "lighting", keywords: ["stehlampe", "tischlampe", "stehleuchte", "warm"], styleIds: ["cozy"], minLongestSideCm: FLOOR_LAMP_MIN_SIDE_CM, excludeTerms: NOT_A_FLOOR_LAMP },
      { category: "storage", keywords: ["sideboard", "kommode", "holz", "regal"], styleIds: ["cozy"], minWidthCm: STORAGE_MIN_WIDTH_CM },
      { category: "plant", keywords: ["kunstpflanze", "pflanze", "kunstbaum"], styleIds: ["cozy"], minLongestSideCm: PLANT_MIN_SIDE_CM },
      { category: "textile", keywords: ["plaid", "wohndecke", "kuscheldecke", "kissen", "wolle", "fell"], styleIds: ["cozy"], excludeTerms: NOT_A_LIVING_ROOM_TEXTILE },
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

function isExcluded(product: Product, extraTerms: string[] = []): boolean {
  const text = product.name.toLowerCase();
  return EXCLUDE_TERMS.some((t) => text.includes(t)) || extraTerms.some((t) => text.includes(t));
}

/**
 * Best real, photographed catalog match for one recipe slot — null if the
 * catalog has nothing usable (or nothing NOT excluded) in that category.
 *
 * `alreadyUsed` holds every product id taken by an earlier slot in this
 * run, across ALL concepts, so four showroom rooms don't end up sharing one
 * artificial monstera and one white floor lamp. Without it they did: the
 * same plant won its slot in three of four rooms, because it is simply the
 * cheapest plant that matches anything.
 */
function pickBest(catalog: Product[], item: ConceptItem, alreadyUsed: Set<string>): Product | null {
  const eligible = catalog.filter(
    (p) => p.category === item.category && p.imageUrl && !alreadyUsed.has(p.id) && !isExcluded(p, item.excludeTerms),
  );
  if (eligible.length === 0) return null;
  const [best] = searchProducts(eligible, {
    category: item.category,
    keywords: item.keywords,
    styleIds: item.styleIds,
    minWidthCm: item.minWidthCm,
    minLongestSideCm: item.minLongestSideCm,
    limit: 1,
  });
  return best ?? null;
}

function formatDims(product: Product): string {
  const d = product.dimensionsCm;
  return d ? `${d.l} x ${d.w} x ${d.h} cm` : "size not stated";
}

/**
 * True only if a CJ result is plausibly the thing that was searched for.
 *
 * CJ's search is a general-marketplace text search with no notion of home
 * decor, and it answers confidently rather than empty-handed: "ceramic
 * vase" came back a ceramic coffee cup, "wool throw blanket" a wool knit
 * sweater, "linen cushion cover" an axe cover. Every one shares an
 * adjective with the query and none is the object asked for.
 *
 * So the last query word — the head noun, "vase", "blanket", "holder" —
 * has to appear in the product's own name. A sweater is not a blanket, and
 * a room is better off with an empty accent slot than with a jumper
 * composited onto the sofa and priced as decor.
 */
function isRelevantCjMatch(product: Product, keyword: string): boolean {
  const words = keyword.toLowerCase().split(/\s+/).filter(Boolean);
  const headNoun = words[words.length - 1];
  if (!headNoun) return false;
  return product.name.toLowerCase().includes(headNoun);
}

/**
 * Every catalog pick a concept resolves to, in placement order — the whole
 * free part of building a room.
 *
 * Deliberately separate from buildConcept so --dry-run exercises the exact
 * same code path the paid run does. A dry run that re-implemented the
 * picking would eventually drift from it and start blessing runs that then
 * pick something else, which is worse than having no dry run at all.
 */
async function pickConceptProducts(concept: Concept, catalog: Product[], alreadyUsed: Set<string>): Promise<Product[]> {
  const matched: Product[] = [];
  for (const item of concept.items) {
    const match = pickBest(catalog, item, alreadyUsed);
    if (!match) {
      console.warn(`  no real "${item.category}" product with a photo found — skipping that slot.`);
      continue;
    }
    // Dimensions are printed because they are the fastest way to eyeball a
    // wrong pick: "90 x 90 cm" next to the word "Teppich" is instantly a
    // doormat, where the product name alone reads as a perfectly good rug.
    console.log(`  ${item.category}: ${match.name} (${match.id}, CHF ${match.price}, ${formatDims(match)})`);
    matched.push(match);
    alreadyUsed.add(match.id);
  }

  if (cjEnabled()) {
    console.log(`  Searching CJ Dropshipping for "${concept.cjAccent.keyword}"...`);
    try {
      const results = await searchCjProducts(concept.cjAccent.keyword, 5);
      const cjMatch = results.find((p) => isRelevantCjMatch(p, concept.cjAccent.keyword));
      if (cjMatch) {
        console.log(`  ${concept.cjAccent.category} (CJ): ${cjMatch.name} (${cjMatch.id}, CHF ${cjMatch.price})`);
        matched.push({ ...cjMatch, category: concept.cjAccent.category });
        alreadyUsed.add(cjMatch.id);
      } else if (results.length > 0) {
        console.warn(`  CJ returned ${results.length} result(s) for "${concept.cjAccent.keyword}" but none are actually that thing (top hit: "${results[0].name}") — skipping that accent.`);
      } else {
        console.warn(`  no CJ match for "${concept.cjAccent.keyword}" — skipping that accent.`);
      }
    } catch (err) {
      console.warn(`  CJ search failed (${err instanceof Error ? err.message : err}) — skipping that accent.`);
    }
  }

  return matched;
}

/**
 * Prints what a concept would be built from without generating anything.
 * Free: no image model is called, so nothing here is billable.
 */
async function dryRunConcept(concept: Concept, catalog: Product[], alreadyUsed: Set<string>): Promise<void> {
  console.log(`\n=== ${concept.title} (dry run — ${concept.primaryStyleId} style) ===`);
  const matched = await pickConceptProducts(concept, catalog, alreadyUsed);
  const filled = matched.length;
  // +1 for the poster: the "art" slot is never a catalog pick, it's always
  // generated, so it is guaranteed to be filled in a real run.
  console.log(
    `  -> ${filled + 1} item(s): ${filled} from the catalog + 1 generated poster. ` +
      `Catalog subtotal CHF ${matched.reduce((sum, p) => sum + p.price, 0)}.`,
  );
  if (filled < 4) {
    console.warn("  ⚠ thin room — under 4 real products. Widen this concept's keywords before spending money on it.");
  }
}

/** Returns whether a room was actually saved — several early returns below skip a room without throwing, so callers must check this rather than just "did it throw." */
async function buildConcept(
  concept: Concept,
  catalog: Product[],
  roomPath: string | null,
  quality: "low" | "medium" | "high",
  alreadyUsed: Set<string>,
): Promise<boolean> {
  console.log(`\n=== ${concept.title} (room photo: ${roomPath ?? `AI-generated, ${concept.primaryStyleId} style`}) ===`);

  const matched = await pickConceptProducts(concept, catalog, alreadyUsed);
  if (matched.length === 0) {
    console.error(`  no products matched at all for "${concept.title}" — skipping this room entirely.`);
    return false;
  }

  const style = STYLE_MAP[concept.primaryStyleId];

  // ORDER MATTERS — money. Every step below that calls an image model costs
  // real money whether or not the room ultimately gets saved, so the cheap
  // failure-prone step (placement, a single Claude vision call) runs as
  // early as it possibly can: right after the base room exists, since it
  // needs that photo, and before the poster is generated.
  //
  // A real, expensive failure drove this: placement was broken by a schema
  // bug, and because the poster AND base room were both generated first,
  // every concept burned two high-quality image generations before
  // discovering the room could never be built — repeated for all five
  // concepts, on every run.
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
  const usedProductIds = new Set<string>();
  // Objects the render invented — a throw over the sofa arm, cushions, a
  // stack of books. The image model adds these because it is trained on
  // styled interior photography, and they are a large part of why a render
  // reads as a real home rather than a showroom. The problem is only that
  // they are unpurchasable: a customer buying "the look" would not receive
  // them. Rather than fight the model, match each one against our own
  // catalogue — the same treatment the Looks Studio route
  // (app/api/finished-rooms/generate) already gives them, which this script
  // was silently skipping.
  const autoMatched: Product[] = [];

  for (const d of detected) {
    if (d.pickedIndex >= 1 && d.pickedIndex <= renderedProducts.length) {
      const p = renderedProducts[d.pickedIndex - 1];
      if (!usedProductIds.has(p.id)) {
        itemBoxes[p.id] = d.box;
        usedProductIds.add(p.id);
      }
      continue;
    }
    // Not something we placed. findBestCatalogMatch requires real keyword
    // overlap and returns null rather than guessing — a wrong match would
    // put a buy-pin on the wrong product, which is worse than no pin.
    // d.description comes back in German to match the German supplier feed.
    const match = findBestCatalogMatch(catalog, d.description);
    if (match && !usedProductIds.has(match.id)) {
      autoMatched.push(match);
      itemBoxes[match.id] = d.box;
      usedProductIds.add(match.id);
      console.log(`    + auto-matched staged "${d.description}" -> ${match.name} (CHF ${match.price})`);
    } else {
      console.warn(`    ⚠ staged "${d.description}" has no catalogue match — it stays visible but unpurchasable.`);
    }
  }

  for (const product of renderedProducts) {
    if (!itemBoxes[product.id]) console.warn(`    ⚠ "${product.name}" wasn't found in the render — it won't have a clickable pin.`);
  }

  // Auto-matched pieces are real catalogue products with real prices, so
  // they belong in the room's total and its product list exactly like the
  // ones we placed deliberately.
  const allProducts = [...renderedProducts, ...autoMatched];
  // Claim the auto-matched ones too, so a later room in the same batch
  // doesn't deliberately place a product this room already staged.
  for (const p of autoMatched) alreadyUsed.add(p.id);
  const totalPrice = allProducts.reduce((sum, p) => sum + p.price, 0);
  const styleTags = Array.from(new Set(allProducts.flatMap((p) => p.styles)));

  console.log("  Saving finished room...");
  const id = await createFinishedRoom({
    title: concept.title,
    description: concept.description,
    styleTags,
    heroImageBase64: finalImage.toString("base64"),
    productIds: allProducts.map((p) => p.id),
    itemBoxes,
    autoMatchedIds: autoMatched.map((p) => p.id),
    totalPrice,
  });

  const matchNote = autoMatched.length > 0 ? ` (${autoMatched.length} auto-matched from staging)` : "";
  console.log(`  ✓ Saved — CHF ${totalPrice} across ${allProducts.length} item(s)${matchNote}. View at /looks/${id}.`);
  return true;
}

/**
 * Defaults to ONE room, not the full set. Every room costs real money
 * (two image generations plus a composite at "high" quality), so the safe
 * default is a single cheap proof that the pipeline works end to end;
 * scaling up is an explicit choice you make after seeing one good result.
 */
const DEFAULT_COUNT = 1;

async function main() {
  const rawArgs = process.argv.slice(2);
  const dryRun = rawArgs.includes("--dry-run");
  const args = rawArgs.filter((a) => a !== "--dry-run");
  // First arg is the room count when it's a bare number; anything else is
  // treated as a room-photo path, so the old photo-path usage still works.
  const countArg = args[0] !== undefined && /^\d+$/.test(args[0]) ? Number(args[0]) : null;
  const argPaths = countArg === null ? args : args.slice(1);
  const count = Math.max(1, Math.min(countArg ?? DEFAULT_COUNT, CONCEPTS.length));
  const concepts = CONCEPTS.slice(0, count);

  for (const p of argPaths) {
    if (!existsSync(p)) {
      console.error(`Room photo not found: ${p}`);
      process.exit(1);
    }
  }
  // A dry run never reaches an image model, so it deliberately does NOT
  // require an OpenAI key — the whole point is to be runnable before, and
  // independently of, anything billable.
  if (!dryRun && !compositingEnabled()) {
    console.error("OPENAI_API_KEY is not set. Add it to .env first.");
    process.exit(1);
  }
  if (!dbEnabled()) {
    console.error("DATABASE_URL is not set — the product catalog lives in Postgres. Add it to .env first.");
    process.exit(1);
  }

  // Public storefront content, not a one-off customer preview — worth the
  // extra cost over the low/medium tiers used elsewhere in this app (see
  // lib/ai/composite.ts's compositeProductIntoRoom for the same reasoning).
  const quality: "low" | "medium" | "high" = "high";

  console.log("Loading product catalog...");
  const catalog = await loadProductCatalog();
  console.log(`${catalog.length} product(s) in the catalog.`);

  // Shared across every concept in the run: a product claimed by one room
  // is off the table for the rest, so four showroom rooms don't quietly
  // become four photos of the same monstera.
  const alreadyUsed = new Set<string>();

  if (dryRun) {
    console.log(`\nDry run — showing what ${concepts.length} concept(s) would be built from. Nothing is generated and nothing is billed.`);
    for (const concept of concepts) await dryRunConcept(concept, catalog, alreadyUsed);
    console.log(`\nDry run complete. Re-run without --dry-run to actually generate ${concepts.length} room(s).`);
    return;
  }

  // Each concept gets its own try/catch — a transient failure partway
  // through (OpenAI's own API returning a 5xx, a Cloudflare edge hiccup,
  // etc.) shouldn't throw away the concepts before AND after it in the
  // same run. Real, confirmed failure mode: api.openai.com briefly
  // returning a Cloudflare 520 mid-run took down the entire batch before
  // this fix, on the very first concept, wasting nothing yet but risking
  // a lot on a longer run.
  console.log(`Generating ${concepts.length} of ${CONCEPTS.length} concept(s) at ${quality} quality.`);

  let succeeded = 0;
  for (const [i, concept] of concepts.entries()) {
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
      if (await buildConcept(concept, catalog, roomPath, quality, alreadyUsed)) succeeded++;
    } catch (err) {
      console.error(`  Failed: ${err instanceof Error ? err.message : err}`);
    }

    // Stop the batch if the FIRST room produced nothing. A failure with no
    // prior success almost always means something systematically broken
    // (a bad schema, an expired key, an exhausted balance) that every
    // remaining concept would hit identically — and each attempt spends
    // real money on images before finding out. Confirmed the expensive
    // way: a schema bug made all five concepts fail the same placement
    // call, one wasted base-room generation each, on every run. Once one
    // room has succeeded the pipeline is proven, so later failures are
    // treated as transient and the batch continues.
    if (succeeded === 0 && i === 0 && concepts.length > 1) {
      console.error(
        `\nStopping: the first room failed, so the remaining ${concepts.length - 1} would likely fail the same way ` +
          "and each one costs real money. Fix the error above, then re-run.",
      );
      break;
    }
  }

  console.log(`\nDone. ${succeeded}/${concepts.length} room(s) generated and published.`);
  if (succeeded > 0 && concepts.length < CONCEPTS.length) {
    console.log(`Happy with it? Generate the rest with: npx tsx scripts/generate-showroom-rooms.ts ${CONCEPTS.length}`);
  }
}

main().catch((err) => {
  console.error("Failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
