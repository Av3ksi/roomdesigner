/**
 * Generates N more "finished room" looks fully autonomously: an AI-
 * generated base room photo (lib/ai/generateRoom.ts, since there's no real
 * customer photo to start from) plus a style-matched set of real catalog
 * products picked at random from whatever actually has a photo in stock,
 * run through the exact same compositing pipeline
 * scripts/compose-finished-room.ts uses for hand-curated looks
 * (lib/finishedRoomPipeline.ts). Saved with source: "agent" so they're
 * distinguishable from hand-curated ones in the data, and published
 * immediately like every other curated look — no draft step, by design.
 *
 * On-demand only, deliberately — this is a script you run when you want
 * more looks, not a background job. Real money per look: one OpenAI
 * text-to-image call for the base room (~$0.02-0.07 depending on quality)
 * plus the same per-look cost as the curated script (one image-edit call
 * plus a few cheap Claude vision calls). One failed iteration (a bad room,
 * too few matching products for that style) is logged and skipped rather
 * than aborting the whole batch — earlier iterations in the same run
 * already spent real money and their results shouldn't be lost over one
 * bad draw.
 *
 * Usage:
 *   npx tsx scripts/generate-looks.ts <count> [styleId]
 *
 * styleId restricts every look in the batch to one style (see
 * lib/styles.ts for ids); omitted picks a random style per look instead,
 * for variety across a batch.
 *
 * Reads ANTHROPIC_API_KEY, OPENAI_API_KEY, DATABASE_URL from .env.
 */
import { compositingEnabled } from "../lib/ai/composite";
import { generateBaseRoomPhoto } from "../lib/ai/generateRoom";
import { composeAndSaveFinishedRoom } from "../lib/finishedRoomPipeline";
import { dbEnabled } from "../lib/db";
import { loadProductCatalog } from "../lib/productSearchDb";
import { STYLES, STYLE_MAP } from "../lib/styles";
import type { DesignStyle, Product, ProductCategory } from "../lib/types";

try {
  process.loadEnvFile?.();
} catch {
  // No .env file yet — fall through to the clearer "not configured" checks below.
}

// Rough priority order for a believable living room — tried in this order
// until enough categories have a style match. Not every style/category
// combination has stock, so this is a wishlist, capped at MAX_ITEMS; below
// MIN_ITEMS the look isn't varied enough to feel like a real "room."
const CATEGORY_PRIORITY: ProductCategory[] = ["sofa", "chair", "table", "rug", "lighting", "art", "decor", "plant", "storage", "textile"];
const MAX_ITEMS = 6;
const MIN_ITEMS = 3;

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickProductsForStyle(catalog: Product[], style: DesignStyle): Product[] {
  const matches = catalog.filter((p) => p.imageUrl && p.styles.includes(style.id));
  const byCategory = new Map<ProductCategory, Product[]>();
  for (const p of matches) {
    if (!byCategory.has(p.category)) byCategory.set(p.category, []);
    byCategory.get(p.category)!.push(p);
  }

  const selected: Product[] = [];
  for (const category of CATEGORY_PRIORITY) {
    if (selected.length >= MAX_ITEMS) break;
    const options = byCategory.get(category);
    if (options && options.length > 0) selected.push(pickRandom(options));
  }
  return selected;
}

async function generateOne(style: DesignStyle, catalog: Product[], quality: "low" | "medium" | "high"): Promise<boolean> {
  const products = pickProductsForStyle(catalog, style);
  if (products.length < MIN_ITEMS) {
    console.warn(`  Skipped: only ${products.length} ${style.name} product(s) with a photo in stock (need ${MIN_ITEMS}+).`);
    return false;
  }

  console.log(`  Generating a base ${style.name} room photo (${quality} quality)...`);
  const roomPhoto = await generateBaseRoomPhoto(style, quality);

  const heroName = products[0].name.split(" — ")[0];
  const title = `${style.name} Living Room — ${heroName}`;
  const description = `${style.tagline}. Featuring ${products.map((p) => p.name.split(" — ")[0]).join(", ")}.`;

  console.log(`  Compositing ${products.length} product(s) (${quality} quality)...`);
  const result = await composeAndSaveFinishedRoom({
    roomPhoto,
    title,
    description,
    products,
    quality,
    source: "agent",
  });

  for (const name of result.unpinned) console.warn(`    ⚠ "${name}" wasn't found in the render — no clickable pin.`);
  console.log(`  Done: ${title} — CHF ${result.totalPrice}. View at /looks/${result.id}.`);
  return true;
}

async function main() {
  const [countArg, styleIdArg, qualityArg] = process.argv.slice(2);
  const count = Math.max(1, Math.min(20, Number(countArg) || 0));
  if (!count) {
    console.error("Usage: npx tsx scripts/generate-looks.ts <count> [styleId] [quality]");
    process.exit(1);
  }
  // Defaults to "high" — unlike compose-finished-room.ts's one-off curated
  // looks (medium), this content is meant as permanent showroom material on
  // /looks, closer to the compositing pipeline's "high" tier already used
  // for adding a single product (see lib/ai/composite.ts's module comment:
  // "high" measurably out-renders "medium" on product/material detail).
  // Costs more per look — pass "medium" explicitly to trade quality for cost.
  const quality = (qualityArg === "low" || qualityArg === "medium" ? qualityArg : "high") as "low" | "medium" | "high";
  if (styleIdArg && !STYLE_MAP[styleIdArg]) {
    console.error(`Unknown style id "${styleIdArg}". Valid ids: ${STYLES.map((s) => s.id).join(", ")}`);
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

  console.log("Loading catalog...");
  const catalog = await loadProductCatalog();

  let succeeded = 0;
  for (let i = 1; i <= count; i++) {
    const style = styleIdArg ? STYLE_MAP[styleIdArg] : pickRandom(STYLES);
    console.log(`\n[${i}/${count}] ${style.name}...`);
    try {
      if (await generateOne(style, catalog, quality)) succeeded++;
    } catch (err) {
      console.error(`  Failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log(`\nDone. ${succeeded}/${count} look(s) generated and published.`);
}

main().catch((err) => {
  console.error("Failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
