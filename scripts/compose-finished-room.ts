/**
 * Composes ONE curated "finished room" bundle — a real room photo with a
 * hand-picked set of real catalog products composited into it in a single
 * scene, saved as a fixed sellable look (lib/finishedRooms.ts). This is the
 * IKEA-showroom model: you supply the room photo and choose the products;
 * lib/finishedRoomPipeline.ts does the compositing and saves the result.
 * Not automated curation — you're the designer here, same as a real IKEA
 * room-set stylist. (scripts/generate-looks.ts is the automated sibling —
 * same pipeline, AI-picked room photo and products instead.)
 *
 * Real money: one OpenAI image-edit call (~$0.02-0.06 depending on quality
 * and how many products are in the scene) plus a few cheap Claude vision
 * calls (room placement + one product description per item + one identity
 * check per item afterward). Runs once per finished room, not per customer.
 *
 * Usage:
 *   npx tsx scripts/compose-finished-room.ts <room.jpg> <title> <productId1,productId2,...> [quality] [description]
 *
 * productIds are catalog ids (e.g. "vidaxl-247598") — use
 * scripts/list-products.ts to find real ones. quality: low|medium|high,
 * defaults to medium (this is public storefront content, worth the extra
 * cost over the "low" default used for one-off customer previews).
 *
 * Reads ANTHROPIC_API_KEY, OPENAI_API_KEY, DATABASE_URL from .env.
 */
import { readFileSync } from "fs";
import { compositingEnabled } from "../lib/ai/composite";
import { composeAndSaveFinishedRoom } from "../lib/finishedRoomPipeline";
import { dbEnabled } from "../lib/db";
import { loadProductCatalog } from "../lib/productSearchDb";
import type { Product } from "../lib/types";

try {
  process.loadEnvFile?.();
} catch {
  // No .env file yet — fall through to the clearer "not configured" checks below.
}

async function main() {
  const [roomPath, title, productIdsRaw, qualityArg, description] = process.argv.slice(2);

  if (!roomPath || !title || !productIdsRaw) {
    console.error(
      "Usage: npx tsx scripts/compose-finished-room.ts <room.jpg> <title> <productId1,productId2,...> [quality] [description]",
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

  const quality = (qualityArg === "low" || qualityArg === "high" ? qualityArg : "medium") as "low" | "medium" | "high";
  const productIds = productIdsRaw.split(",").map((s) => s.trim()).filter(Boolean);

  console.log(`Loading catalog and matching ${productIds.length} product id(s)...`);
  const catalog = await loadProductCatalog();
  const byId = new Map(catalog.map((p) => [p.id, p]));
  const products: Product[] = [];
  for (const id of productIds) {
    const p = byId.get(id);
    if (!p) {
      console.error(`Unknown product id "${id}" — check it against the current catalog.`);
      process.exit(1);
    }
    if (!p.imageUrl) {
      console.error(`Product "${id}" (${p.name}) has no photo — can't be composited.`);
      process.exit(1);
    }
    products.push(p);
  }

  // One placement box exists per CATEGORY (suggestPlacements), not per product —
  // two products of the same category would land in the same spot in the scene.
  // A real "complete room" wants variety across categories anyway, so this is a
  // hard stop, not a smart-offset hack.
  const seenCategories = new Set<string>();
  for (const p of products) {
    if (seenCategories.has(p.category)) {
      console.error(
        `Two products in the same category ("${p.category}"): "${p.name}". ` +
          "Each category gets one placement spot in the scene. " +
          "Pick one item per category instead (sofa + table + rug + lighting + art...).",
      );
      process.exit(1);
    }
    seenCategories.add(p.category);
  }

  console.log(`Compositing ${products.length} product(s) into the room (${quality} quality)...`);
  const roomPhoto = readFileSync(roomPath);
  const result = await composeAndSaveFinishedRoom({
    roomPhoto,
    title,
    description: description ?? "",
    products,
    quality,
    source: "curated",
  });

  for (const name of result.unpinned) console.warn(`  ⚠ "${name}" wasn't found in the render — it won't have a clickable pin.`);
  console.log(`Done. Finished room id: ${result.id} — CHF ${result.totalPrice} across ${products.length} product(s). View at /looks/${result.id}.`);
}

main().catch((err) => {
  console.error("Failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
