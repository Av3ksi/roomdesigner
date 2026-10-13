/**
 * Publishes a finished room from an image you made ELSEWHERE — ChatGPT in
 * the browser, Midjourney, Photoshop, a real photograph — without spending
 * anything on image generation.
 *
 * WHY THIS EXISTS. Generating a showroom room through the API costs three
 * paid images (base room, poster, composite). If you already pay for a
 * ChatGPT subscription, you can make that picture by hand in the browser
 * for no extra cost. What the browser cannot give you is the rest of the
 * product: a room is only worth publishing if every object in it has a
 * clickable buy-pin tied to a real catalogue product, and that means
 * knowing where each item landed in the image.
 *
 * So this script does exactly the part the browser can't: one Claude vision
 * call to locate each product you name, then persistence. Cost is a single
 * vision call — cents, not dollars — and no OpenAI image credits at all.
 *
 * WHAT IT CANNOT DO, and you should know before relying on it: it cannot
 * verify that the image actually contains the products you claim. The
 * generate pipeline composites from real product photos, so the sofa in
 * the render IS the sofa in the catalogue. Here you are asserting that
 * yourself. Anything it fails to locate is reported rather than silently
 * pinned to nothing, but a room whose "oak table" is a table you told
 * ChatGPT to invent is a room that misrepresents what a customer receives.
 * Prompt with the real product photos in front of you.
 *
 * Usage:
 *   npx tsx scripts/import-room-image.ts room.png \
 *     --title "RGB Battlestation" \
 *     --products vidaxl-869317,vidaxl-42007350,vidaxl-845421
 *
 *   --description "..."   optional, shown under the title
 *   --dry-run             locate and report, save nothing (still one vision call)
 *
 * Find product ids with the showroom dry run, which prints them:
 *   npx tsx scripts/generate-showroom-rooms.ts 4 --dry-run
 *
 * Reads ANTHROPIC_API_KEY and DATABASE_URL from .env.
 */
import { existsSync, readFileSync } from "fs";
import { detectSceneItems } from "../lib/ai/locate";
import { dbEnabled } from "../lib/db";
import { createFinishedRoom } from "../lib/finishedRooms";
import { loadProductCatalog } from "../lib/productSearchDb";
import type { DetectionBox } from "../lib/types";

try {
  process.loadEnvFile?.();
} catch {
  // No .env file yet — the checks below give a clearer error.
}

function flag(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

async function main() {
  const imagePath = process.argv[2];
  const title = flag("title");
  const productList = flag("products");
  const description = flag("description") ?? "";
  const dryRun = process.argv.includes("--dry-run");

  if (!imagePath || !title || !productList) {
    console.error("Usage: npx tsx scripts/import-room-image.ts <image> --title \"...\" --products id1,id2,...");
    console.error("Find ids with: npx tsx scripts/generate-showroom-rooms.ts 4 --dry-run");
    process.exit(1);
  }
  if (!existsSync(imagePath)) {
    console.error(`Image not found: ${imagePath}`);
    process.exit(1);
  }
  if (!dbEnabled()) {
    console.error("DATABASE_URL is not set. Add it to .env first.");
    process.exit(1);
  }

  const wantedIds = productList.split(",").map((s) => s.trim()).filter(Boolean);
  console.log("Loading product catalog...");
  const catalog = await loadProductCatalog();
  const byId = new Map(catalog.map((p) => [p.id, p]));

  const products = wantedIds.map((id) => byId.get(id)).filter((p): p is NonNullable<typeof p> => Boolean(p));
  const missing = wantedIds.filter((id) => !byId.has(id));
  if (missing.length > 0) {
    console.error(`Not in the catalogue: ${missing.join(", ")}`);
    console.error("Every product must exist, or its pin would point at nothing.");
    process.exit(1);
  }
  if (products.length === 0) {
    console.error("No products given — a room with no buy-pins is just a picture.");
    process.exit(1);
  }

  const image = readFileSync(imagePath);
  console.log(`\n${title}`);
  console.log(`  image:    ${imagePath} (${(image.length / 1024 / 1024).toFixed(2)}MB)`);
  console.log(`  products: ${products.length}`);
  for (const p of products) console.log(`    ${p.category.padEnd(9)} ${p.name} — CHF ${p.price}`);

  console.log("\nLocating each product in the image (one Claude vision call)...");
  const detected = await detectSceneItems(
    image,
    products.map((p, i) => ({ index: i + 1, name: p.name, category: p.category })),
  );

  const itemBoxes: Record<string, DetectionBox> = {};
  for (const d of detected) {
    if (d.pickedIndex >= 1 && d.pickedIndex <= products.length) {
      const p = products[d.pickedIndex - 1];
      if (!itemBoxes[p.id]) itemBoxes[p.id] = d.box;
    }
  }

  const located = products.filter((p) => itemBoxes[p.id]);
  const unlocated = products.filter((p) => !itemBoxes[p.id]);
  console.log(`  located ${located.length}/${products.length}`);
  for (const p of unlocated) {
    console.warn(`  ⚠ "${p.name}" wasn't found in the image — it will have no clickable pin.`);
  }
  // Objects in the picture that aren't any of the named products. Reported,
  // never auto-matched: this script has no evidence about what they are, and
  // a wrong buy-pin is worse than none — see scripts/generate-showroom-rooms.ts.
  const unaccounted = detected.filter((d) => d.pickedIndex < 1 || d.pickedIndex > products.length);
  for (const d of unaccounted) {
    console.warn(`  ⚠ staged "${d.description}" is in the image but isn't one of your products — unpurchasable.`);
  }

  if (located.length === 0) {
    console.error("\nNothing could be located. Not saving — the room would have no pins at all.");
    process.exit(1);
  }

  const totalPrice = products.reduce((sum, p) => sum + p.price, 0);
  const styleTags = Array.from(new Set(products.flatMap((p) => p.styles)));

  if (dryRun) {
    console.log(`\nDry run — nothing saved. Would publish CHF ${totalPrice} across ${products.length} item(s).`);
    return;
  }

  console.log("\nSaving finished room...");
  const id = await createFinishedRoom({
    title,
    description,
    styleTags,
    heroImageBase64: image.toString("base64"),
    productIds: products.map((p) => p.id),
    itemBoxes,
    totalPrice,
  });
  console.log(`✓ Saved — CHF ${totalPrice} across ${products.length} item(s). View at /looks/${id}.`);
  if (unlocated.length > 0) {
    console.log(`  ${unlocated.length} item(s) have no pin. Fix one with: npx tsx scripts/fix-room-pin.ts ${id}`);
  }
}

main().catch((err) => {
  console.error("Failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
