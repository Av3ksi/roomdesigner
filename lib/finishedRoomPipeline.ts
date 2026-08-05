import { checkRenderedProductIdentity } from "./ai/identityCheck";
import { composeSceneWithProducts, reshapeBoxForProduct, type SceneItem } from "./ai/composite";
import { suggestPlacements } from "./ai/placement";
import { detectSceneItems } from "./ai/locate";
import { createFinishedRoom } from "./finishedRooms";
import type { DetectionBox, Product } from "./types";

export interface ComposeFinishedRoomInput {
  roomPhoto: Buffer;
  title: string;
  description: string;
  /** One per category (enforced by the caller) — same constraint composeSceneWithProducts's single placement-per-category has always had. Every product must have an imageUrl. */
  products: Product[];
  quality?: "low" | "medium" | "high";
  /** 'curated' (a human picked the room + products, scripts/compose-finished-room.ts) or 'agent' (scripts/generate-looks.ts). */
  source?: string;
}

export interface ComposeFinishedRoomResult {
  id: string;
  totalPrice: number;
  /** Products the finished render didn't confirm a clickable position for. */
  unpinned: string[];
}

/**
 * The shared core of "stage real products into a room photo and save it as
 * a finished_rooms bundle" — pulled out of scripts/compose-finished-room.ts
 * once scripts/generate-looks.ts needed the exact same pipeline against an
 * AI-generated base photo instead of a human-supplied one. Everything
 * upstream of this (where the room photo comes from, which products to
 * use, the title/description) is the caller's job; this just does the
 * compositing + QA + persistence once those are decided.
 */
export async function composeAndSaveFinishedRoom(input: ComposeFinishedRoomInput): Promise<ComposeFinishedRoomResult> {
  const { roomPhoto, title, description, products, source } = input;
  const quality = input.quality ?? "medium";

  const placement = await suggestPlacements(roomPhoto);
  if (!placement) throw new Error("Room placement analysis failed (check ANTHROPIC_API_KEY).");

  const items: SceneItem[] = [];
  for (const product of products) {
    if (!product.imageUrl) throw new Error(`Product "${product.name}" has no photo — can't be composited.`);
    const productRes = await fetch(product.imageUrl);
    if (!productRes.ok) throw new Error(`Failed to fetch product photo for "${product.name}": ${productRes.status}`);
    const productBuffer = Buffer.from(await productRes.arrayBuffer());
    const suggestion = placement.placements[product.category];
    const box = await reshapeBoxForProduct(suggestion.box, productBuffer);
    items.push({ productPhoto: productBuffer, category: product.category, box, wallAngleDeg: suggestion.wallAngleDeg });
  }

  const result = await composeSceneWithProducts(roomPhoto, items, quality);
  const finalImage = Buffer.from(result.imageBase64, "base64");

  // Best-effort QA — logged, not enforced, same as the CLI script: a
  // flagged mismatch still gets saved (an ops person can review the log),
  // rather than silently discarding a render real money already paid for.
  for (const [i, product] of products.entries()) {
    const check = await checkRenderedProductIdentity(items[i].productPhoto, finalImage, items[i].box);
    if (check && !check.pass) console.warn(`[maison] "${product.name}": ${check.note}`);
  }

  // Locates each item's real on-image position for LookDetail's clickable
  // hotspots — the box we told the model to place at is only a suggestion
  // inside the masked region, not guaranteed to be exactly where it landed.
  const detected = await detectSceneItems(
    finalImage,
    products.map((p, i) => ({ index: i + 1, name: p.name, category: p.category })),
  );
  const itemBoxes: Record<string, DetectionBox> = {};
  for (const d of detected) {
    if (d.pickedIndex >= 1 && d.pickedIndex <= products.length) {
      itemBoxes[products[d.pickedIndex - 1].id] = d.box;
    }
  }
  const unpinned = products.filter((p) => !itemBoxes[p.id]).map((p) => p.name);

  const totalPrice = products.reduce((sum, p) => sum + p.price, 0);
  const styleTags = Array.from(new Set(products.flatMap((p) => p.styles)));

  const id = await createFinishedRoom({
    title,
    description,
    styleTags,
    heroImageBase64: finalImage.toString("base64"),
    productIds: products.map((p) => p.id),
    itemBoxes,
    totalPrice,
    source,
  });

  return { id, totalPrice, unpinned };
}
