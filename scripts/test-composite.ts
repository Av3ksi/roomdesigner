/**
 * Manual, one-off test of the GPT-Image compositing step. Deliberately not
 * wired into any page — this costs real money per run, so it only ever
 * fires when you explicitly run it.
 *
 * Usage:
 *   npx tsx scripts/test-composite.ts <room.jpg> <product.jpg> <category> [quality]
 *
 * category: sofa | chair | table | lighting | rug | art | plant | storage | decor | textile
 * quality:  low (default, cheapest) | medium | high
 *
 * Reads OPENAI_API_KEY from .env in the current directory. Writes
 * composited-<timestamp>.png next to wherever you run this from.
 */
import { readFileSync, writeFileSync } from "fs";
import { compositeProductIntoRoom, compositingEnabled } from "../lib/ai/composite";
import type { ProductCategory } from "../lib/types";

try {
  process.loadEnvFile?.();
} catch {
  // No .env file yet — fall through to the clearer "OPENAI_API_KEY is not set" check below.
}

const VALID_CATEGORIES: ProductCategory[] = [
  "sofa", "chair", "table", "lighting", "rug", "art", "plant", "storage", "decor", "textile",
];

async function main() {
  const [roomPath, productPath, category, quality] = process.argv.slice(2);

  if (!roomPath || !productPath || !category) {
    console.error("Usage: npx tsx scripts/test-composite.ts <room.jpg> <product.jpg> <category> [quality]");
    console.error(`category must be one of: ${VALID_CATEGORIES.join(", ")}`);
    process.exit(1);
  }
  if (!VALID_CATEGORIES.includes(category as ProductCategory)) {
    console.error(`Unknown category "${category}". Must be one of: ${VALID_CATEGORIES.join(", ")}`);
    process.exit(1);
  }
  if (!compositingEnabled()) {
    console.error("OPENAI_API_KEY is not set. Add it to .env first.");
    process.exit(1);
  }

  const roomPhoto = readFileSync(roomPath);
  const productPhoto = readFileSync(productPath);
  const q = (quality === "medium" || quality === "high" ? quality : "low") as "low" | "medium" | "high";

  console.log(`Compositing "${category}" into ${roomPath} at "${q}" quality — this makes one real, billed API call...`);
  const result = await compositeProductIntoRoom(roomPhoto, productPhoto, category as ProductCategory, [], q);

  const outPath = `composited-${Date.now()}.png`;
  writeFileSync(outPath, Buffer.from(result.imageBase64, "base64"));
  console.log(`Wrote ${outPath}`);
  console.log(`Used a real detection box: ${result.usedRealDetection} (false = generic default position)`);
}

main().catch((err) => {
  console.error("Failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
