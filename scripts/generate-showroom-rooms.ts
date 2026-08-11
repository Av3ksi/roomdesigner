/**
 * Generates the curated showroom "finished rooms" end-to-end from one
 * command instead of clicking through Looks Studio once per room: for each
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
 *   keywords define an "RGB Battlestation" vs. a "Console Lounge", not
 *   just "any 3-6 products tagged with that style."
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
  /** Where the pick is PLACED — placement returns one box per category, and this selects it. */
  category: ProductCategory;
  /**
   * Which categories the pick is SEARCHED in. Defaults to `category` alone.
   *
   * Needed because the feed's own categorisation is coarser than the slots
   * are. `lib/suppliers/mapping.ts` matches German compounds on their head
   * noun (the last word), which is right for German but means "Kissenbezug"
   * (cushion cover) files under its head "-bezug" rather than as a textile.
   * The measured result: 446 of 447 products in the textile category are bed
   * duvets, and the living-room cushions are all somewhere else. Widening
   * the search is the cheap fix; recategorising the feed is the real one.
   */
  searchCategories?: ProductCategory[];
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

/**
 * One CJ attempt: what to ASK for, and what the answer must actually BE.
 *
 * They are separate because a query that gets CJ to answer at all is not
 * the same string as the object itself. "gold candle holder" is a good
 * query; "candle holder" is what the result has to contain — matching only
 * the last word accepted a coin purse, via "Card Holder".
 */
interface CjAttempt {
  query: string;
  /** Matched as a whole phrase against the result's name, lowercased. */
  object: string;
}

interface Concept {
  title: string;
  description: string;
  /** Which lib/styles.ts style id to generate the empty base room photo in, when no real photo is supplied. */
  primaryStyleId: string;
  items: ConceptItem[];
  /**
   * One small accent item sourced live from CJ Dropshipping. English
   * keywords, material + object ("rattan basket") — CJ has no concept of
   * style names. Deliberately a small decor piece, never furniture: CJ's
   * dimension fields are confirmed to be packaging size, not real item
   * size (lib/suppliers/cjdropshipping.ts's module doc), so anything whose
   * on-image scale matters a lot stays sourced from VidaXL.
   *
   * SEVERAL keywords, tried in order until one returns something that
   * really is the object. CJ's search is a plain marketplace text match, so
   * the wording decides whether it answers usefully at all — "ceramic vase"
   * found a real vase where "brass candle holder" and "scented candle jar"
   * found nothing. A rejected phrasing says nothing about the next one.
   *
   * `fallback` fills the same slot from our own catalog when CJ_API_KEY
   * isn't set or every keyword misses. Its category must match `category`
   * above, and neither may collide with a slot in `items`.
   *
   * A note on why decor is CJ-first and not catalog-first: measured on the
   * real feed, 0 of 3,245 eligible products in the decor category contain
   * "vase", "schale", "laterne" or "kerzenhalter" in name or blurb. This
   * VidaXL export is furniture; it has no decorative objects. The catalog
   * fallback is kept for when that changes, but today it reports empty.
   */
  cjAccent: { category: ProductCategory; keywords: CjAttempt[]; fallback: ConceptItem };
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
const STORAGE_MIN_WIDTH_CM = 80;
/**
 * Rugs are floored on their LONGEST side, not width, because the feed's
 * Size column lists them short-side-first as often as not ("80 x 150 cm"),
 * so a width floor rejected genuine area rugs along with the doormats and
 * emptied the slot in all four rooms. 170 still rejects a 90 x 90 mat and
 * an 80 x 150 runner while admitting a small-but-real 120 x 170.
 */
const RUG_MIN_LONGEST_SIDE_CM = 170;
/** Longest side, not width: a floor lamp is defined by being tall. */
const FLOOR_LAMP_MIN_SIDE_CM = 100;
/** Same reasoning — a 20 cm desk succulent reads as nothing in a wide room shot. */
const PLANT_MIN_SIDE_CM = 60;
/** A flag-pole holder 11.5 cm across won two decor slots. Decor has to be big enough to see. */
const DECOR_MIN_SIDE_CM = 15;
/** Gap between consecutive CJ searches — see the accent loop for why. */
const CJ_SEARCH_GAP_MS = 1500;
/** A 15 x 21 cm guest towel took a throw-cushion slot; a real cushion or throw is bigger. */
const TEXTILE_MIN_SIDE_CM = 40;

/**
 * Slot-specific exclusions. Each of these is a real wrong pick the dry run
 * caught, not a hypothetical.
 */
/**
 * Multi-piece sets. A set's product photo shows two sofas or two
 * sideboards, and that photo is the reference the compositor is told to
 * reproduce inside one placement box — so the room gets a duplicated
 * object, or the identity check fails, or both.
 */
const NOT_A_SINGLE_PIECE = ["set", "2 stk", "3 stk", "4 stk", "2 pcs", "3 pcs", "4 pcs"];
/** Sofa-shaped things that are not a living room's main sofa. */
const NOT_A_MAIN_SOFA = ["sofa-sessel", "pallet", "palette", "hundesofa", "puppensofa", ...NOT_A_SINGLE_PIECE];
/** "Massagesessel" (massage chair), office seating and footstools all won a lounge-chair slot on the word "Sessel"/"Hocker" alone. */
const NOT_A_LOUNGE_CHAIR = ["massage", "büro", "buro", "gaming", "schreibtischstuhl", "hocker"];
/**
 * The gaming rooms need the OPPOSITE of NOT_A_LOUNGE_CHAIR: a gaming chair
 * is an office chair by construction, so the very words that disqualify a
 * lounge chair ("gaming", "büro", "schreibtischstuhl") are the ones that
 * identify the right product here. Only genuinely wrong seating is banned.
 */
const NOT_A_GAMING_CHAIR = ["massage", "hocker", "sitzsack", "klappstuhl", "barhocker"];
/** A desk, not a dining or side table. */
const NOT_A_DESK = ["esstisch", "beistelltisch", "couchtisch", "nachttisch", "konsolentisch"];
/**
 * Colours that fight a warm-neutral room. Only used where the palette is
 * the whole point of the concept: the Cozy room is rust and oat, and its
 * chair slot resolved to a PINK armchair, which matched on "Stoff" and
 * nothing else. Keyword scoring can prefer a colour but cannot rule one
 * out, so the ruling-out is spelled out here.
 */
const NOT_A_WARM_NEUTRAL = ["rosa", "pink", "lila", "violett", "türkis", "turkis", "neon"];
/** Anti-slip mats, bath mats and doormats are all "Teppich" in this feed. */
/**
 * Deliberately does NOT ban "Anti-Rutsch". That was a real over-exclusion:
 * it killed all 32 rugs in the catalog and emptied the slot in every room.
 * "Anti-Rutsch" describes a rug's non-slip backing, which a 160 x 230 cm
 * living-room rug is as likely to have as a doormat — the doormats are
 * excluded by the size floor, which is the honest discriminator here.
 * What stays banned is a different KIND of floor covering, whatever its size.
 */
const NOT_A_ROOM_RUG = ["fußmatte", "fussmatte", "badematte", "türmatte", "turmatte", "läufer", "laufer", "teppichunterlage", "stufenmatte"];
/**
 * German "Decke" is blanket, duvet AND ceiling, so a textile slot asking
 * for a throw gets bed duvets — the confirmed cause of the "Sommerdecke"
 * that landed in an earlier room and had to be un-pinned by hand.
 */
const NOT_A_LIVING_ROOM_TEXTILE = [
  "bettdecke", "sommerdecke", "winterbettdecke", "winterdecke", "steppdecke",
  "bettwäsche", "bettwasche", "bettbezug", "spannbettlaken", "matratze", "kopfkissen", "bank",
  // Garden/pool soft goods, which are "Kissen" too. Inflatable pool
  // cushions won the textile slot in two rooms; high-back garden chair
  // pads won it in a third.
  "poolkissen", "hochlehner", "stuhlkissen", "gartenstuhl", "auflage", "palettenkissen",
  // Soft goods that are not a throw or a cushion. Curtains and window
  // film would be composited into the sofa-throw position; towels and
  // chair pads simply are not the object.
  "stuhlpolster", "polster", "vorhang", "gardine", "folie", "tuch", "oxford", "sitzsack",
  "stützkissen", "stutzkissen", "rückenstütz", "ruckenstutz",
];
/** Recessed/ceiling fixtures and bulbs, which are "Leuchte" too but are not a lamp you can see in a room shot. */
const NOT_A_FLOOR_LAMP = [
  "strahler", "spotlight", "einbau", "leuchtmittel", "glühbirne", "gluhbirne",
  "lichtleiste", "led-streifen", "lichterkette",
  // Ceiling- and wall-mounted fixtures. A pair of black-and-gold
  // "Deckenleuchten" won the Dark Luxury decor slot, which would have
  // composited a ceiling lamp into the room at floor level.
  "deckenleuchte", "deckenlampe", "pendelleuchte", "hängeleuchte", "hangeleuchte",
  "wandleuchte", "kronleuchter", "deckenventilator",
];

/**
 * THE GAMING NICHE.
 *
 * All four concepts are gaming rooms — a deliberate narrowing from the
 * general living-room set that came before. Two are desk-first
 * battlestations, one is the couch-and-console half of the same audience,
 * and one is the pale "clean setup" look rather than blackout, so the grid
 * covers the niche instead of showing one room four times.
 *
 * WHAT CHANGES IN A GAMING ROOM, mechanically:
 *
 *   - The chair slot inverts. A gaming chair IS an office chair by
 *     construction, so "gaming", "büro" and "schreibtischstuhl" — the exact
 *     words NOT_A_LOUNGE_CHAIR bans — are the ones that identify the right
 *     product. Hence NOT_A_GAMING_CHAIR.
 *   - The table slot is a desk, not a coffee table, so it needs a wider
 *     floor and a ban on dining/side tables.
 *   - The CJ accent finally plays to CJ's strengths. It is a consumer
 *     electronics marketplace, which is why it kept failing on vases and
 *     candle holders; LED strips, mouse pads and headphone stands are what
 *     it actually stocks.
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
    title: "RGB Battlestation",
    description: "Blackout walls, a wide desk and one cool RGB wash — a setup built for long sessions after dark.",
    primaryStyleId: "gaming",
    cjAccent: {
      category: "decor",
      // CJ is a consumer-electronics marketplace, which is a poor fit for
      // vases and an excellent one for this. The accent slot should finally
      // land first try here rather than after four rephrasings.
      keywords: [
        { query: "rgb led strip lights", object: "led strip" },
        { query: "gaming mouse pad large", object: "mouse pad" },
        { query: "rgb light bar", object: "light bar" },
        { query: "headphone stand", object: "headphone stand" },
      ],
      fallback: { category: "decor", keywords: ["led", "rgb", "leuchtstreifen", "lichtleiste"], styleIds: ["gaming"], excludeTerms: NOT_A_SINGLE_PIECE },
    },
    items: [
      { category: "table", keywords: ["schreibtisch", "computertisch", "gaming", "eckschreibtisch"], styleIds: ["gaming", "industrial"], minWidthCm: 100, excludeTerms: NOT_A_DESK },
      { category: "chair", keywords: ["gaming", "gamingstuhl", "racing", "bürostuhl", "chefsessel", "drehstuhl"], styleIds: ["gaming", "industrial"], minWidthCm: CHAIR_MIN_WIDTH_CM, excludeTerms: NOT_A_GAMING_CHAIR },
      { category: "storage", keywords: ["regal", "schwarz", "lowboard", "sideboard", "metall"], styleIds: ["gaming", "industrial"], minWidthCm: STORAGE_MIN_WIDTH_CM, excludeTerms: NOT_A_SINGLE_PIECE },
      { category: "lighting", keywords: ["stehlampe", "stehleuchte", "schwarz", "metall"], styleIds: ["gaming", "industrial"], minLongestSideCm: FLOOR_LAMP_MIN_SIDE_CM, excludeTerms: NOT_A_FLOOR_LAMP },
      { category: "rug", keywords: ["teppich", "schwarz", "dunkelgrau", "grau"], styleIds: ["gaming", "industrial"], minLongestSideCm: RUG_MIN_LONGEST_SIDE_CM, excludeTerms: NOT_A_ROOM_RUG },
      { category: "plant", keywords: ["kunstpflanze", "pflanze", "kunstbaum", "monstera"], styleIds: ["gaming", "industrial"], minLongestSideCm: PLANT_MIN_SIDE_CM },
      { category: "textile", searchCategories: ["textile", "decor"], keywords: ["kissen", "kissenbezug", "zierkissen", "plaid", "wohndecke", "kuscheldecke", "überwurf", "fell"], minLongestSideCm: TEXTILE_MIN_SIDE_CM, styleIds: ["gaming", "industrial"], excludeTerms: NOT_A_LIVING_ROOM_TEXTILE },
    ],
  },
  {
    title: "Console Lounge",
    description: "A sofa, a big screen and low ambient light — the couch-first half of gaming, not the desk half.",
    primaryStyleId: "gaming",
    cjAccent: {
      category: "decor",
      keywords: [
        { query: "rgb light bar tv", object: "light bar" },
        { query: "controller stand", object: "controller stand" },
        { query: "rgb led strip lights", object: "led strip" },
        { query: "game controller holder", object: "holder" },
      ],
      fallback: { category: "decor", keywords: ["led", "rgb", "lichtleiste", "leuchtstreifen"], styleIds: ["gaming"], excludeTerms: NOT_A_SINGLE_PIECE },
    },
    items: [
      { category: "sofa", keywords: ["sofa", "stoff", "grau", "schwarz", "sitzer sofa", "ecksofa"], styleIds: ["gaming", "industrial"], minWidthCm: SOFA_MIN_WIDTH_CM, excludeTerms: NOT_A_MAIN_SOFA },
      { category: "storage", keywords: ["tv-schrank", "lowboard", "sideboard", "schwarz", "hochglanz"], styleIds: ["gaming", "industrial"], minWidthCm: STORAGE_MIN_WIDTH_CM, excludeTerms: NOT_A_SINGLE_PIECE },
      { category: "table", keywords: ["couchtisch", "schwarz", "metall", "glas"], styleIds: ["gaming", "industrial"], minWidthCm: COFFEE_TABLE_MIN_WIDTH_CM },
      { category: "chair", keywords: ["gaming", "gamingstuhl", "racing", "sessel", "drehstuhl"], styleIds: ["gaming", "industrial"], minWidthCm: CHAIR_MIN_WIDTH_CM, excludeTerms: NOT_A_GAMING_CHAIR },
      { category: "rug", keywords: ["teppich", "dunkelgrau", "schwarz", "hochflor"], styleIds: ["gaming", "industrial"], minLongestSideCm: RUG_MIN_LONGEST_SIDE_CM, excludeTerms: NOT_A_ROOM_RUG },
      { category: "lighting", keywords: ["stehlampe", "stehleuchte", "schwarz"], styleIds: ["gaming", "industrial"], minLongestSideCm: FLOOR_LAMP_MIN_SIDE_CM, excludeTerms: NOT_A_FLOOR_LAMP },
      { category: "textile", searchCategories: ["textile", "decor"], keywords: ["kissen", "kissenbezug", "zierkissen", "plaid", "wohndecke", "kuscheldecke", "überwurf", "fell"], minLongestSideCm: TEXTILE_MIN_SIDE_CM, styleIds: ["gaming", "cozy"], excludeTerms: NOT_A_LIVING_ROOM_TEXTILE },
      { category: "plant", keywords: ["kunstpflanze", "pflanze", "kunstbaum"], styleIds: ["gaming", "industrial"], minLongestSideCm: PLANT_MIN_SIDE_CM },
    ],
  },
  {
    title: "Streamer Loft",
    description: "Brick, black steel and a camera-facing desk — a setup that has to look good on stream, not just to sit at.",
    primaryStyleId: "industrial",
    cjAccent: {
      category: "decor",
      keywords: [
        { query: "microphone arm stand", object: "microphone" },
        { query: "ring light", object: "ring light" },
        { query: "rgb led strip lights", object: "led strip" },
        { query: "headphone stand", object: "headphone stand" },
      ],
      fallback: { category: "decor", keywords: ["led", "rgb", "lichtleiste"], styleIds: ["industrial"], excludeTerms: NOT_A_SINGLE_PIECE },
    },
    items: [
      { category: "table", keywords: ["schreibtisch", "computertisch", "metall", "eckschreibtisch"], styleIds: ["industrial", "gaming"], minWidthCm: 100, excludeTerms: NOT_A_DESK },
      { category: "chair", keywords: ["gaming", "bürostuhl", "drehstuhl", "chefsessel", "racing"], styleIds: ["industrial", "gaming"], minWidthCm: CHAIR_MIN_WIDTH_CM, excludeTerms: NOT_A_GAMING_CHAIR },
      { category: "storage", keywords: ["regal", "metall", "schwarz", "industrial", "sideboard"], styleIds: ["industrial"], minWidthCm: STORAGE_MIN_WIDTH_CM, excludeTerms: NOT_A_SINGLE_PIECE },
      { category: "lighting", keywords: ["stehlampe", "stehleuchte", "metall", "schwarz"], styleIds: ["industrial"], minLongestSideCm: FLOOR_LAMP_MIN_SIDE_CM, excludeTerms: NOT_A_FLOOR_LAMP },
      { category: "rug", keywords: ["teppich", "grau", "vintage", "muster"], styleIds: ["industrial"], minLongestSideCm: RUG_MIN_LONGEST_SIDE_CM, excludeTerms: NOT_A_ROOM_RUG },
      { category: "plant", keywords: ["kunstpflanze", "pflanze", "kunstbaum", "monstera"], styleIds: ["industrial"], minLongestSideCm: PLANT_MIN_SIDE_CM },
      { category: "textile", searchCategories: ["textile", "decor"], keywords: ["kissen", "kissenbezug", "zierkissen", "plaid", "wohndecke", "kuscheldecke", "überwurf", "fell"], minLongestSideCm: TEXTILE_MIN_SIDE_CM, styleIds: ["industrial"], excludeTerms: NOT_A_LIVING_ROOM_TEXTILE },
    ],
  },
  {
    title: "White Minimal Setup",
    description: "The other half of the niche: an all-white desk, pale wood and one accent colour. Clean-setup rather than blackout.",
    primaryStyleId: "minimalist",
    cjAccent: {
      category: "decor",
      keywords: [
        { query: "white desk mat", object: "desk mat" },
        { query: "monitor stand riser", object: "monitor stand" },
        { query: "gaming mouse pad large", object: "mouse pad" },
        { query: "headphone stand", object: "headphone stand" },
      ],
      fallback: { category: "decor", keywords: ["led", "rgb", "lichtleiste"], styleIds: ["minimalist"], excludeTerms: NOT_A_SINGLE_PIECE },
    },
    items: [
      { category: "table", keywords: ["schreibtisch", "computertisch", "weiß", "weiss"], styleIds: ["minimalist", "scandinavian"], minWidthCm: 100, excludeTerms: NOT_A_DESK },
      { category: "chair", keywords: ["bürostuhl", "drehstuhl", "gaming", "weiß", "weiss"], styleIds: ["minimalist", "scandinavian"], minWidthCm: CHAIR_MIN_WIDTH_CM, excludeTerms: NOT_A_GAMING_CHAIR },
      { category: "storage", keywords: ["regal", "sideboard", "weiß", "weiss", "kommode"], styleIds: ["minimalist", "scandinavian"], minWidthCm: STORAGE_MIN_WIDTH_CM, excludeTerms: NOT_A_SINGLE_PIECE },
      { category: "lighting", keywords: ["stehlampe", "stehleuchte", "weiß", "weiss"], styleIds: ["minimalist", "scandinavian"], minLongestSideCm: FLOOR_LAMP_MIN_SIDE_CM, excludeTerms: NOT_A_FLOOR_LAMP },
      { category: "rug", keywords: ["teppich", "creme", "beige", "hellgrau"], styleIds: ["minimalist", "scandinavian"], minLongestSideCm: RUG_MIN_LONGEST_SIDE_CM, excludeTerms: NOT_A_ROOM_RUG },
      { category: "plant", keywords: ["kunstpflanze", "pflanze", "kunstbaum", "monstera"], styleIds: ["minimalist", "scandinavian"], minLongestSideCm: PLANT_MIN_SIDE_CM },
      { category: "textile", searchCategories: ["textile", "decor"], keywords: ["kissen", "kissenbezug", "zierkissen", "plaid", "wohndecke", "kuscheldecke", "überwurf", "fell"], minLongestSideCm: TEXTILE_MIN_SIDE_CM, styleIds: ["minimalist", "scandinavian"], excludeTerms: [...NOT_A_LIVING_ROOM_TEXTILE, "schwarz"] },
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
const EXCLUDE_TERMS = [
  "kinder", "baby", "welpen", "hunde", "katzen", "haustier", "grill", "pizzaofen",
  // Outdoor and garden. VidaXL is a general wholesaler, so its "textile"
  // and "decor" categories are full of pool cushions, tarpaulins and
  // ground anchors — a set of four anthracite ground anchors won a decor
  // slot outright, on the word "Metall".
  "pool", "aufblasbar", "garten", "camping", "bodenanker", "zelt", "sonnenschirm",
  "trampolin", "planschbecken", "gewächshaus", "gewachshaus",
  // "Kissen für draußen" (outdoor cushions) took the textile slot in all
  // four rooms at once, and a steel fire bowl took a decor slot — none of
  // them say "Garten" anywhere in the name.
  "draußen", "draussen", "outdoor", "lounger", "feuerschale", "feuerstelle",
  "balkon", "terrasse", "sonnenliege", "hollywoodschaukel",
];

function isExcluded(product: Product, extraTerms: string[] = []): boolean {
  const text = product.name.toLowerCase();
  return EXCLUDE_TERMS.some((t) => text.includes(t)) || extraTerms.some((t) => text.includes(t));
}

/**
 * A resolved slot, or an explanation of why it stayed empty.
 *
 * The reason string is a funnel — category count, then how many survived
 * each filter — because "no rug found" on its own is unactionable. Every
 * room silently lost its rug once, and the cause (a width floor applied to
 * a feed that lists rugs short-side-first) was invisible until the counts
 * were printed.
 */
interface SlotOutcome {
  product: Product | null;
  reason?: string;
}

/**
 * Best real, photographed catalog match for one recipe slot — a null
 * product if the catalog has nothing usable in that category.
 *
 * `alreadyUsed` holds every product id taken by an earlier slot in this
 * run, across ALL concepts, so four showroom rooms don't end up sharing one
 * artificial monstera and one white floor lamp. Without it they did: the
 * same plant won its slot in three of four rooms, because it is simply the
 * cheapest plant that matches anything.
 */
function pickBest(catalog: Product[], item: ConceptItem, alreadyUsed: Set<string>): SlotOutcome {
  const searchIn = item.searchCategories ?? [item.category];
  const inCategory = catalog.filter((p) => searchIn.includes(p.category));
  const photographed = inCategory.filter((p) => p.imageUrl);
  const unused = photographed.filter((p) => !alreadyUsed.has(p.id));
  const allowed = unused.filter((p) => !isExcluded(p, item.excludeTerms));

  const scope = searchIn.length > 1 ? `${searchIn.join("+")}` : "category";
  const funnel = `${inCategory.length} in ${scope} -> ${photographed.length} photographed -> ${unused.length} not already used -> ${allowed.length} past exclusions`;
  if (allowed.length === 0) {
    // Naming the guilty term matters more than the count. "0 past
    // exclusions" told us the exclusions were at fault but not which one,
    // and the answer turned out to be a term that was over-broad rather
    // than one that was missing — a distinction worth not guessing at.
    const blame = [...EXCLUDE_TERMS, ...(item.excludeTerms ?? [])]
      .map((t) => ({ t, n: unused.filter((p) => p.name.toLowerCase().includes(t)).length }))
      .filter((c) => c.n > 0)
      .sort((a, b) => b.n - a.n)
      .slice(0, 4)
      .map((c) => `"${c.t}" x${c.n}`)
      .join(", ");
    return { product: null, reason: `${funnel}. Excluded by: ${blame || "(none matched — check the category filter)"}` };
  }

  const [best] = searchProducts(allowed, {
    // No `category` filter here: the pool above is already scoped to
    // searchIn, and passing item.category would undo a widened search.
    keywords: item.keywords,
    styleIds: item.styleIds,
    minWidthCm: item.minWidthCm,
    minLongestSideCm: item.minLongestSideCm,
    // A curated showroom slot would rather stay empty than take an
    // irrelevant product. Without this, a decor slot whose keywords all
    // missed fell through to searchProducts' best-effort tail and returned
    // the cheapest thing in the category — which is how a guest towel was
    // about to be composited into the Cozy room as its decor accent.
    requireRelevance: true,
    limit: 1,
  });
  if (!best) {
    // Two different things can empty this search — the size floors, or the
    // keyword-relevance gate — so the report has to separate them. Blaming
    // the floor for both was a real misdiagnosis: the decor slot reported
    // "0 met the size floor" when the floor was innocent, which is exactly
    // the kind of confident-but-wrong output this funnel exists to prevent.
    const floors = [
      item.minWidthCm !== undefined ? `min width ${item.minWidthCm}cm` : null,
      item.minLongestSideCm !== undefined ? `min longest side ${item.minLongestSideCm}cm` : null,
    ].filter(Boolean).join(", ");
    // Mirrors searchProducts: floors apply only where the feed stated a size.
    const sized = allowed.filter((p) => {
      if (!p.dimensionsCm) return true;
      if (item.minWidthCm !== undefined && p.dimensionsCm.l < item.minWidthCm) return false;
      if (item.minLongestSideCm !== undefined) {
        const longest = Math.max(p.dimensionsCm.l, p.dimensionsCm.w, p.dimensionsCm.h);
        if (longest < item.minLongestSideCm) return false;
      }
      return true;
    });
    if (sized.length === 0) {
      return { product: null, reason: `${funnel} -> 0 met the size floor (${floors || "none set"})` };
    }
    return {
      product: null,
      reason: `${funnel} -> ${sized.length} met the size floor (${floors || "none set"}) -> 0 matched any keyword: ${item.keywords.join(", ")}`,
    };
  }
  // Re-tag to the SLOT's category when the search was widened. Placement
  // returns one box per category and buildConcept looks it up by the
  // product's own category, so a cushion filed under "decor" would
  // otherwise be composited into the decor box — on top of whatever the
  // decor accent put there.
  return { product: best.category === item.category ? best : { ...best, category: item.category } };
}

function formatDims(product: Product): string {
  const d = product.dimensionsCm;
  return d ? `${d.l} x ${d.w} x ${d.h} cm` : "size not stated";
}

/**
 * Things CJ sells that are unmistakably not homeware, whatever they match.
 * A cheap backstop for the accent slot, which is the one place a
 * marketplace search reaches straight into a room render.
 */
const CJ_NOT_HOMEWARE = [
  "purse", "wallet", "sweater", "coat", "shoe", "sock", "underwear", "dress",
  "phone", "charger", "cable", "earring", "necklace", "bracelet", "keychain", "lanyard",
];

/**
 * True only if a CJ result really is the object that was asked for.
 *
 * CJ's search is a general-marketplace text search with no notion of home
 * decor, and it answers confidently rather than empty-handed: "ceramic
 * vase" came back a ceramic coffee cup, "wool throw blanket" a wool knit
 * sweater, "linen cushion cover" an axe cover.
 *
 * Matching on the query's LAST WORD alone was not enough, and the failure
 * is instructive: "gold candle holder" returned a coin purse, because
 * "Card Holder" contains "holder". Multi-word objects have to be matched
 * as a PHRASE, which is why the object name is declared separately from
 * the search query — "candle holder" is what must appear, while "gold
 * candle holder" is merely what gets CJ to answer.
 */
function isRelevantCjMatch(product: Product, object: string): boolean {
  const name = product.name.toLowerCase();
  if (CJ_NOT_HOMEWARE.some((t) => name.includes(t))) return false;
  return name.includes(object.toLowerCase());
}

/** CJ's search answers inconsistently when called in a tight loop — the same query succeeded and failed minutes apart. A short gap between calls costs nothing here and reduces that. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * German nouns that identify what a staged object IS, so an auto-match can
 * be confined to that kind of product.
 *
 * Ordered by where the word appears in the description, not by this list's
 * order, because German puts the subject first: "Kleine Tischlampe auf dem
 * Sideboard" is a lamp, not a sideboard, and the earliest match says so.
 */
const DESCRIPTION_CATEGORY_TERMS: [ProductCategory, string[]][] = [
  ["textile", ["decke", "plaid", "kissen", "überwurf", "uberwurf", "throw"]],
  ["plant", ["pflanze", "blume", "baum", "kaktus", "farn"]],
  ["art", ["bild", "poster", "print", "rahmen", "kunstdruck", "spiegel", "gemälde", "gemalde"]],
  ["lighting", ["lampe", "leuchte", "stehlampe", "tischlampe"]],
  ["rug", ["teppich", "läufer", "laufer"]],
  ["decor", ["vase", "kerze", "schale", "laterne", "windlicht", "skulptur", "figur", "tablett", "buch", "bücher", "bucher", "korb"]],
  ["sofa", ["sofa", "couch"]],
  ["chair", ["sessel", "stuhl", "hocker"]],
  ["storage", ["sideboard", "regal", "kommode", "schrank", "vitrine"]],
  ["table", ["couchtisch", "beistelltisch", "tisch"]],
];

/**
 * What kind of thing a staged object is, or null when it can't be told.
 *
 * Null deliberately means "leave it unpurchasable" rather than "match it to
 * anything". A wrong buy-pin is worse than a missing one: the customer is
 * shown a price and a product that is not the object they clicked.
 */
function categoryFromDescription(description: string): ProductCategory | null {
  const text = description.toLowerCase();
  let earliest: { category: ProductCategory; at: number } | null = null;
  for (const [category, terms] of DESCRIPTION_CATEGORY_TERMS) {
    for (const term of terms) {
      const at = text.indexOf(term);
      if (at !== -1 && (!earliest || at < earliest.at)) earliest = { category, at };
    }
  }
  return earliest?.category ?? null;
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
  const take = (product: Product, label: string) => {
    // Dimensions are printed because they are the fastest way to eyeball a
    // wrong pick: "90 x 90 cm" next to the word "Teppich" is instantly a
    // doormat, where the product name alone reads as a perfectly good rug.
    console.log(`  ${label}: ${product.name} (${product.id}, CHF ${product.price}, ${formatDims(product)})`);
    matched.push(product);
    alreadyUsed.add(product.id);
  };

  for (const item of concept.items) {
    const { product, reason } = pickBest(catalog, item, alreadyUsed);
    if (!product) {
      console.warn(`  no usable "${item.category}" product — skipping that slot. [${reason}]`);
      continue;
    }
    take(product, item.category);
  }

  // The CJ accent is best-effort by design, so when it comes up empty the
  // slot is filled from our own catalog instead of left as a hole. CJ has
  // now failed or returned something irrelevant on most attempts ("ceramic
  // vase" -> a coffee cup, "scented candle jar" -> a mermaid night light),
  // and a room missing its only decor piece is a visibly emptier room.
  const accent = concept.cjAccent;
  let accentFilled = false;
  if (cjEnabled()) {
    // Several phrasings, tried in order until one returns something that is
    // actually the object asked for. CJ's search is a general-marketplace
    // text match, so how a query is worded decides whether it answers at
    // all: "ceramic vase" returned a real vase, while "brass candle holder"
    // and "scented candle jar" returned nothing usable. One rejected
    // phrasing is not evidence the catalogue lacks the object.
    for (const [i, attempt] of accent.keywords.entries()) {
      // CJ answered the very same query differently minutes apart, so treat
      // a miss as possibly the API rather than proof of absence, and give
      // it room to breathe between calls.
      if (i > 0) await sleep(CJ_SEARCH_GAP_MS);
      try {
        console.log(`  Searching CJ Dropshipping for "${attempt.query}"...`);
        const results = await searchCjProducts(attempt.query, 10);
        // `alreadyUsed` has to be honoured HERE as well as in pickBest. It
        // wasn't, and the result was the same CJ vase composited into three
        // of the four rooms — each concept asked CJ independently, got the
        // same top hit, and took it. Scanning past the used ones also
        // rescues the case where CJ's best result is one we've spent.
        const cjMatch = results.find((p) => isRelevantCjMatch(p, attempt.object) && !alreadyUsed.has(p.id));
        if (cjMatch) {
          take({ ...cjMatch, category: accent.category }, `${accent.category} (CJ)`);
          accentFilled = true;
          break;
        }
        if (results.length > 0) {
          console.warn(`  CJ returned ${results.length} result(s) for "${attempt.query}" but none are a "${attempt.object}" (top hit: "${results[0].name}").`);
        } else {
          console.warn(`  no CJ match for "${attempt.query}".`);
        }
      } catch (err) {
        console.warn(`  CJ search failed for "${attempt.query}" (${err instanceof Error ? err.message : err}).`);
      }
    }
  }
  if (!accentFilled) {
    const { product, reason } = pickBest(catalog, accent.fallback, alreadyUsed);
    if (product) take(product, `${accent.category} (catalog fallback)`);
    else console.warn(`  no usable "${accent.category}" fallback either — skipping that accent. [${reason}]`);
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
    // Not something we placed. Word overlap alone is not enough to match
    // safely: "Decke, beige, über Sofalehne drapiert" — a beige throw over
    // the sofa arm — matched a beige Sherpa ARMCHAIR and put a CHF 176
    // buy-pin for a chair on a blanket, in a room that shipped. So the
    // kind of object is decided first, from the description's own subject
    // noun, and the match is confined to that category.
    //
    // An object we can't classify stays unpurchasable on purpose. A wrong
    // buy-pin is worse than a missing one — the customer is shown a price
    // and a product that is not the thing they clicked.
    // d.description comes back in German to match the German supplier feed.
    const wantCategory = categoryFromDescription(d.description);
    if (!wantCategory) {
      console.warn(`    ⚠ staged "${d.description}" — can't tell what kind of object it is, leaving it unpurchasable.`);
      continue;
    }
    const matchable = catalog.filter((p) => p.imageUrl && !isExcluded(p));
    const match = findBestCatalogMatch(matchable, d.description, wantCategory);
    if (match && !usedProductIds.has(match.id)) {
      autoMatched.push(match);
      itemBoxes[match.id] = d.box;
      usedProductIds.add(match.id);
      console.log(`    + auto-matched staged "${d.description}" [${wantCategory}] -> ${match.name} (CHF ${match.price})`);
    } else {
      console.warn(`    ⚠ staged "${d.description}" has no ${wantCategory} match — it stays visible but unpurchasable.`);
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
 * Errors that no amount of retrying or waiting will clear — the account
 * itself is the problem. Matched on the API's own wording, which is stable
 * enough for this and far more specific than the bare status code (429 is
 * also plain rate limiting, which IS worth retrying).
 */
function isFatalApiError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("insufficient_quota") ||
    m.includes("credit_balance_exhausted") ||
    m.includes("no credits remaining") ||
    m.includes("invalid_api_key") ||
    m.includes("incorrect api key") ||
    m.includes("account_deactivated")
  );
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
      const message = err instanceof Error ? err.message : String(err);
      console.error(`  Failed: ${message}`);
      // An exhausted balance or a rejected key is not transient, and the
      // per-concept try/catch would otherwise march through every
      // remaining concept re-discovering it. Worse, each concept spends
      // its base room and placement BEFORE the step that fails, so a
      // mid-batch top-up failure quietly burns the cheap-but-real calls
      // for every room left. Stop on the first one and say so plainly.
      if (isFatalApiError(message)) {
        console.error(
          "\nStopping the batch: this is an account/billing error, not a transient one, " +
            "so every remaining room would fail the same way. Top up and re-run — rooms already " +
            "saved above are safe, and re-running regenerates only the ones that are missing.",
        );
        break;
      }
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
