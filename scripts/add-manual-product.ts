/**
 * Registers a manually-sourced product — an AliExpress listing you found
 * yourself, before the AliExpress search API is approved — as a real
 * catalog row, so it can be used exactly like a VidaXL product: given a
 * price, a buy-pin, and included in scripts/import-room-image.ts's
 * --products list.
 *
 * WHY THIS EXISTS. import-room-image.ts only accepts product ids that
 * already exist in the catalog. A photo you saved from an AliExpress
 * listing has no id at all until something creates that row. This is that
 * something — the same pattern lib/ai/posterArt.ts already uses for
 * AI-generated posters (buildPosterProduct + upsertProduct), applied to a
 * real photographed product instead of a generated one.
 *
 * WHAT IT DOES NOT DO: place a real order, verify the listing is still in
 * stock, or convert a foreign price for you. The price you give it is
 * exactly what a customer is charged (CHF) — set it yourself, in CHF,
 * accounting for whatever margin you want over the AliExpress price.
 * dimensionsCm is left unset unless you explicitly pass --dimensions,
 * because most marketplace listings state package size, not the item's
 * real footprint (the same confirmed problem as CJ's data — see
 * lib/suppliers/cjdropshipping.ts's module doc). An unknown size is
 * honest; a guessed one produces a wrongly-scaled render.
 *
 * ProductCategory has no "electronics" bucket — it was built for
 * furniture and decor. For a PC tower, monitor, mic, or similar, "decor"
 * is the reasonable catch-all; an RGB strip or neon sign fits "lighting"
 * or "decor" about equally well. The category only affects marketplace
 * filtering, not this script's own publish flow.
 *
 * Usage — list what's already registered:
 *   npx tsx scripts/add-manual-product.ts
 *
 * Usage — add one:
 *   npx tsx scripts/add-manual-product.ts photo.jpg \
 *     --name "RGB Gaming PC Tower, Tempered Glass Panel" \
 *     --category decor \
 *     --price 189 \
 *     --url "https://aliexpress.com/item/..." \
 *     --dimensions 20x45x45
 *
 * --url is optional but worth always including — it's your own fulfilment
 * reference for where to actually place the order once someone buys.
 * --dimensions is "LxWxH" in cm, optional, only if the real item size
 * (not package size) is stated on the listing.
 *
 * Reads DATABASE_URL from .env.
 */
import { readFileSync } from "fs";
import sharp from "sharp";
import { dbEnabled } from "../lib/db";
import { loadProductCatalog, upsertProduct } from "../lib/productSearchDb";
import type { Product, ProductCategory } from "../lib/types";

try {
  process.loadEnvFile?.();
} catch {
  // No .env file yet — the check below gives a clearer error.
}

const CATEGORIES: ProductCategory[] = ["sofa", "chair", "table", "lighting", "rug", "art", "plant", "storage", "decor", "textile"];

/** Same bounded-thumbnail approach as lib/ai/posterArt.ts, sized up slightly: a real product photo a customer scrutinizes before buying deserves a bit more fidelity than an AI-generated catalog thumbnail, and volume here is low by construction (one at a time, by hand). */
const IMAGE_MAX_EDGE = 1200;
const IMAGE_QUALITY = 85;

async function toStoredImageUrl(buffer: Buffer): Promise<string> {
  const resized = await sharp(buffer)
    .rotate()
    .resize(IMAGE_MAX_EDGE, IMAGE_MAX_EDGE, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: IMAGE_QUALITY })
    .toBuffer();
  return `data:image/jpeg;base64,${resized.toString("base64")}`;
}

function flag(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function parseDimensions(raw: string | null): { l: number; w: number; h: number } | undefined {
  if (!raw) return undefined;
  // Whitespace around the "x" is tolerated ("20 x 45 x 45"), since that's
  // the more natural way to type it and the strict form is an easy way to
  // reject a perfectly good input for no real reason.
  const m = raw.match(/^(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)$/i);
  if (!m) {
    console.error(`--dimensions must be "LxWxH" in cm, e.g. 20x45x45. Got: "${raw}"`);
    process.exit(1);
  }
  return { l: Number(m[1]), w: Number(m[2]), h: Number(m[3]) };
}

async function main() {
  if (!dbEnabled()) {
    console.error("DATABASE_URL is not set. Add it to .env first.");
    process.exit(1);
  }

  const imagePath = process.argv[2];

  if (!imagePath) {
    console.log("Registered manual products (AliExpress or otherwise):\n");
    const catalog = await loadProductCatalog();
    const manual = catalog.filter((p) => p.id.startsWith("aliexpress-"));
    if (manual.length === 0) console.log("  (none yet)");
    for (const p of manual) {
      console.log(`  ${p.id}`);
      console.log(`    ${p.name} — CHF ${p.price} [${p.category}]${p.productUrl ? `  ${p.productUrl}` : ""}`);
    }
    console.log("\nAdd one with:");
    console.log('  npx tsx scripts/add-manual-product.ts photo.jpg --name "..." --category decor --price 99');
    return;
  }

  const name = flag("name");
  const category = flag("category") as ProductCategory | null;
  const priceArg = flag("price");
  const url = flag("url");
  const dimensionsCm = parseDimensions(flag("dimensions"));

  if (!name || !category || !priceArg) {
    console.error('Usage: npx tsx scripts/add-manual-product.ts <photo> --name "..." --category <cat> --price <chf>');
    console.error(`Categories: ${CATEGORIES.join(", ")}`);
    process.exit(1);
  }
  if (!CATEGORIES.includes(category)) {
    console.error(`Unknown category "${category}". Must be one of: ${CATEGORIES.join(", ")}`);
    process.exit(1);
  }
  const price = Number(priceArg);
  if (!Number.isFinite(price) || price <= 0) {
    console.error(`--price must be a positive number (CHF). Got: "${priceArg}"`);
    process.exit(1);
  }

  const buffer = readFileSync(imagePath);
  console.log(`Compressing and storing the photo (${(buffer.length / 1024 / 1024).toFixed(2)}MB source)...`);
  const imageUrl = await toStoredImageUrl(buffer);

  const id = `aliexpress-${slugify(name)}-${Date.now().toString(36)}`;
  const product: Product = {
    id,
    name,
    brand: "AliExpress",
    category,
    price,
    rating: 5,
    reviews: 0,
    styles: [],
    color: "#8C8578",
    blurb: `Sourced via AliExpress.${url ? ` Listing: ${url}` : ""}`,
    imageUrl,
    productUrl: url ?? undefined,
    dimensionsCm,
  };

  await upsertProduct(product);
  console.log(`\n✓ Registered: ${name}`);
  console.log(`  id: ${id}`);
  console.log(`  CHF ${price}, category "${category}"${dimensionsCm ? `, ${dimensionsCm.l}×${dimensionsCm.w}×${dimensionsCm.h}cm` : ", size not stated"}`);
  console.log(`\nUse it in a room with:`);
  console.log(`  npx tsx scripts/import-room-image.ts <room-image> --title "..." --products ${id},<other-ids>`);
}

main().catch((err) => {
  console.error("Failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
