/**
 * One command, one folder: auto-picks a real product per slot for a
 * general living room in the given style, downloads every photo, prints
 * each pick's real dimensions, and opens the folder — so the whole
 * "search a category, eyeball results, download, open" loop that used to
 * take several round trips (see scripts/list-products.ts and
 * scripts/download-product-photos.ts) happens in one shot instead.
 *
 * This is the unattended sibling of those two: it trusts searchProducts's
 * scoring (lib/productSearch.ts) plus the same hard-won exclude-term lists
 * scripts/generate-showroom-rooms.ts uses (a children's sofa, a ceiling
 * lamp, a bed duvet, a doormat — all real false positives that keyword
 * scoring alone let through before those lists existed), rather than
 * asking you to read raw search output slot by slot. It does NOT
 * composite or generate anything — same manual ChatGPT/AI Studio workflow
 * as before, just faster to the "photos in a folder" starting line.
 *
 * A slot the catalog has nothing good for is skipped and reported, not
 * silently left out — a 5-6 item room still beats no room, and a specific
 * "reason" beats a mysteriously missing product.
 *
 * dimensionsCm is printed for every pick because it's real (VidaXL states
 * actual item size, not package size — see lib/suppliers/cjdropshipping.ts's
 * module doc for why that distinction matters), and feeding real heights
 * into the furnish prompt is what keeps ChatGPT/AI Studio from guessing
 * scale wrong.
 *
 * Usage:
 *   npx tsx scripts/quick-room-set.ts scandinavian
 *   npx tsx scripts/quick-room-set.ts japandi ./japandi-photos
 *
 * Reads DATABASE_URL from .env.
 */
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { execSync } from "child_process";
import { dbEnabled } from "../lib/db";
import { loadProductCatalog } from "../lib/productSearchDb";
import { searchProducts } from "../lib/productSearch";
import { STYLE_MAP, STYLES } from "../lib/styles";
import type { Product, ProductCategory } from "../lib/types";

try {
  process.loadEnvFile?.();
} catch {
  // No .env file yet — the check below gives a clearer error.
}

/** Never belongs in an adult living-room showroom scene, whatever else matches. Same list as scripts/generate-showroom-rooms.ts. */
const EXCLUDE_TERMS = [
  "kinder", "baby", "welpen", "hunde", "katzen", "haustier", "grill", "pizzaofen",
  "pool", "aufblasbar", "garten", "camping", "bodenanker", "zelt", "sonnenschirm",
  "trampolin", "planschbecken", "gewächshaus", "gewachshaus",
  "weihnacht", "christbaum", "lichternetz", "adventskranz", "halloween",
  "toilette", "wc-", "badregal", "waschbecken", "duschregal",
  "draußen", "draussen", "outdoor", "lounger", "feuerschale", "feuerstelle",
  "balkon", "terrasse", "sonnenliege", "hollywoodschaukel",
];
const NOT_A_SINGLE_PIECE = ["set", "2 stk", "3 stk", "4 stk", "2 pcs", "3 pcs", "4 pcs"];
const NOT_A_MAIN_SOFA = ["sofa-sessel", "pallet", "palette", "hundesofa", "puppensofa", "kindersofa", "eckmodul", "mittelmodul", "armlehnmodul", ...NOT_A_SINGLE_PIECE];
const NOT_A_LOUNGE_CHAIR = ["massage", "büro", "buro", "gaming", "schreibtischstuhl", "hocker"];
const NOT_A_COFFEE_TABLE = ["schreibtisch", "computertisch", "esstisch", "nachttisch", "konsolentisch", "schminktisch"];
const NOT_A_ROOM_RUG = ["fußmatte", "fussmatte", "badematte", "türmatte", "turmatte", "läufer", "laufer", "teppichunterlage", "stufenmatte"];
const NOT_A_FLOOR_LAMP = [
  "strahler", "spotlight", "einbau", "leuchtmittel", "glühbirne", "gluhbirne",
  "lichtleiste", "led-streifen", "lichterkette",
  "deckenleuchte", "deckenlampe", "pendelleuchte", "hängeleuchte", "hangeleuchte",
  "wandleuchte", "kronleuchter", "deckenventilator",
];

const SOFA_MIN_WIDTH_CM = 150;
const CHAIR_MIN_WIDTH_CM = 55;
const COFFEE_TABLE_MIN_WIDTH_CM = 70;
const STORAGE_MIN_WIDTH_CM = 80;
const RUG_MIN_LONGEST_SIDE_CM = 170;
const FLOOR_LAMP_MIN_SIDE_CM = 100;
const PLANT_MIN_SIDE_CM = 60;

interface Slot {
  label: string;
  category: ProductCategory;
  keywords: string[];
  excludeTerms: string[];
  minWidthCm?: number;
  minLongestSideCm?: number;
}

const SLOTS: Slot[] = [
  { label: "sofa", category: "sofa", keywords: ["sofa"], excludeTerms: NOT_A_MAIN_SOFA, minWidthCm: SOFA_MIN_WIDTH_CM },
  { label: "chair", category: "chair", keywords: ["sessel"], excludeTerms: NOT_A_LOUNGE_CHAIR, minWidthCm: CHAIR_MIN_WIDTH_CM },
  { label: "table", category: "table", keywords: ["couchtisch"], excludeTerms: NOT_A_COFFEE_TABLE, minWidthCm: COFFEE_TABLE_MIN_WIDTH_CM },
  { label: "storage", category: "storage", keywords: ["sideboard", "kommode"], excludeTerms: NOT_A_SINGLE_PIECE, minWidthCm: STORAGE_MIN_WIDTH_CM },
  { label: "lighting", category: "lighting", keywords: ["stehlampe", "stehleuchte"], excludeTerms: NOT_A_FLOOR_LAMP, minLongestSideCm: FLOOR_LAMP_MIN_SIDE_CM },
  { label: "rug", category: "rug", keywords: ["teppich"], excludeTerms: NOT_A_ROOM_RUG, minLongestSideCm: RUG_MIN_LONGEST_SIDE_CM },
  { label: "plant", category: "plant", keywords: ["kunstpflanze", "pflanze"], excludeTerms: [], minLongestSideCm: PLANT_MIN_SIDE_CM },
];

function isExcluded(p: Product, extra: string[]): boolean {
  const text = p.name.toLowerCase();
  return EXCLUDE_TERMS.some((t) => text.includes(t)) || extra.some((t) => text.includes(t));
}

function extensionFor(url: string, contentType: string | null): string {
  const fromUrl = url.split("?")[0].split(".").pop();
  if (fromUrl && fromUrl.length <= 4 && /^[a-z0-9]+$/i.test(fromUrl)) return fromUrl.toLowerCase();
  if (contentType?.includes("png")) return "png";
  if (contentType?.includes("webp")) return "webp";
  return "jpg";
}

function formatDims(p: Product): string {
  return p.dimensionsCm ? `${p.dimensionsCm.l} x ${p.dimensionsCm.w} x ${p.dimensionsCm.h} cm` : "size not stated";
}

async function main() {
  const [styleId, outDirArg] = process.argv.slice(2);
  if (!styleId || !STYLE_MAP[styleId]) {
    console.error(`Usage: npx tsx scripts/quick-room-set.ts <styleId> [outputDir]`);
    console.error(`Valid style ids: ${STYLES.map((s) => s.id).join(", ")}`);
    process.exit(1);
  }
  if (!dbEnabled()) {
    console.error("DATABASE_URL is not set. Add it to .env first.");
    process.exit(1);
  }

  const outDir = outDirArg ?? `./${styleId}-photos`;
  console.log(`Loading product catalog...`);
  const catalog = await loadProductCatalog();

  const alreadyUsed = new Set<string>();
  const picks: { slot: Slot; product: Product }[] = [];
  const missed: string[] = [];

  for (const slot of SLOTS) {
    const candidates = searchProducts(catalog, {
      category: slot.category,
      keywords: slot.keywords,
      styleIds: [styleId],
      minWidthCm: slot.minWidthCm,
      minLongestSideCm: slot.minLongestSideCm,
      limit: 30,
    }).filter((p) => p.imageUrl && !alreadyUsed.has(p.id) && !isExcluded(p, slot.excludeTerms));

    if (candidates.length === 0) {
      missed.push(slot.label);
      continue;
    }
    const pick = candidates[0];
    alreadyUsed.add(pick.id);
    picks.push({ slot, product: pick });
  }

  if (picks.length === 0) {
    console.error("No usable products found for any slot — nothing to download.");
    process.exit(1);
  }

  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  console.log(`\n${picks.length} of ${SLOTS.length} slots filled for "${STYLE_MAP[styleId].name}":\n`);
  let n = 0;
  for (const { slot, product } of picks) {
    n += 1;
    const label = `${String(n).padStart(2, "0")}-${slot.label}-${product.id}`;
    try {
      const imageUrl = product.imageUrl;
      if (!imageUrl) throw new Error("no photo on file");
      const res = await fetch(imageUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const ext = extensionFor(imageUrl, res.headers.get("content-type"));
      const path = `${outDir}/${label}.${ext}`;
      if (!existsSync(path)) {
        writeFileSync(path, Buffer.from(await res.arrayBuffer()));
      }
      console.log(`  ${n}. [${slot.label}] ${product.name}`);
      console.log(`     ${product.id}  CHF ${product.price}  ${formatDims(product)}`);
    } catch (err) {
      console.log(`  ${n}. [${slot.label}] ${product.name} — download failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  if (missed.length > 0) {
    console.log(`\nSkipped (no real catalog match past exclusions): ${missed.join(", ")}`);
  }

  console.log(`\nSaved to ${outDir}/`);
  if (process.platform === "darwin") {
    try {
      execSync(`open ${JSON.stringify(outDir)}`);
      console.log("Opened in Finder.");
    } catch {
      console.log("Could not auto-open — open the folder manually.");
    }
  } else {
    console.log("Open that folder manually and drag everything into ChatGPT / AI Studio.");
  }
}

main().catch((err) => {
  console.error("Failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
