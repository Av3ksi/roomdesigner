/**
 * Composes ONE curated "finished room" bundle — a real room photo with a
 * hand-picked set of real catalog products composited into it in a single
 * scene, saved as a fixed sellable look (lib/finishedRooms.ts). This is the
 * IKEA-showroom model: you supply the room photo and choose the products;
 * this script does the compositing and saves the result. Not automated
 * curation — you're the designer here, same as a real IKEA room-set stylist.
 *
 * All products are composited in ONE OpenAI call (composeSceneWithProducts)
 * rather than one call per product — chaining separate single-object edits
 * produced a scattered, disconnected-looking room in real testing, since
 * each call only knew its own category's generic box with no awareness of
 * the others. One call lets the model arrange the whole scene cohesively.
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
import { checkRenderedProductIdentity } from "../lib/ai/identityCheck";
import { compositingEnabled, composeSceneWithProducts, type SceneItem } from "../lib/ai/composite";
import { suggestPlacements } from "../lib/ai/placement";
import { createFinishedRoom } from "../lib/finishedRooms";
import { dbEnabled } from "../lib/db";
import { loadProductCatalog } from "../lib/productSearchDb";
import { clampBox } from "../lib/placementBoxes";
import type { DetectionBox, Product } from "../lib/types";

try {
  process.loadEnvFile?.();
} catch {
  // No .env file yet — fall through to the clearer "not configured" checks below.
}

/** Server-side equivalent of lib/clientImage.ts's reshapeBoxToAspectRatio (that one needs a browser canvas). */
async function reshapeBoxForProduct(box: DetectionBox, productBuffer: Buffer): Promise<DetectionBox> {
  const sharp = (await import("sharp")).default;
  const { width, height } = await sharp(productBuffer).metadata();
  if (!width || !height) return box;
  const aspectRatio = width / height;
  const bottom = box.y + box.h;
  const h = box.w / aspectRatio;
  return clampBox({ x: box.x, y: bottom - h, w: box.w, h });
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

  console.log("Analyzing room placement (one Claude vision call)...");
  const roomPhoto = readFileSync(roomPath);
  const placement = await suggestPlacements(roomPhoto);
  if (!placement) {
    console.error("Room placement analysis failed (check ANTHROPIC_API_KEY) — aborting rather than guessing blindly.");
    process.exit(1);
  }

  console.log(`Fetching ${products.length} product photo(s)...`);
  const items: SceneItem[] = [];
  for (const product of products) {
    const productRes = await fetch(product.imageUrl!);
    if (!productRes.ok) {
      console.error(`Failed to fetch product photo for "${product.name}": ${productRes.status}`);
      process.exit(1);
    }
    const productBuffer = Buffer.from(await productRes.arrayBuffer());
    const suggestion = placement.placements[product.category];
    const box = await reshapeBoxForProduct(suggestion.box, productBuffer);
    items.push({ productPhoto: productBuffer, category: product.category, box, wallAngleDeg: suggestion.wallAngleDeg });
  }

  console.log(`Compositing the whole scene in one call (${quality} quality)...`);
  const result = await composeSceneWithProducts(roomPhoto, items, quality);
  const finalImage = Buffer.from(result.imageBase64, "base64");

  console.log("Reviewing the result against each product photo...");
  for (const [i, product] of products.entries()) {
    const check = await checkRenderedProductIdentity(items[i].productPhoto, finalImage, items[i].box);
    if (check && !check.pass) {
      console.warn(`  ⚠ "${product.name}": ${check.note}`);
    } else if (check) {
      console.log(`  ✓ "${product.name}" looks right.`);
    }
  }

  const totalPrice = products.reduce((sum, p) => sum + p.price, 0);
  const styleTags = Array.from(new Set(products.flatMap((p) => p.styles)));

  console.log("Saving finished room...");
  const id = await createFinishedRoom({
    title,
    description: description ?? "",
    styleTags,
    heroImageBase64: finalImage.toString("base64"),
    productIds: products.map((p) => p.id),
    totalPrice,
  });

  console.log(`Done. Finished room id: ${id} — CHF ${totalPrice} across ${products.length} product(s). View at /looks/${id}.`);
}

main().catch((err) => {
  console.error("Failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
