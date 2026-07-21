import { dbEnabled, ensureSchema, sql } from "./db";
import { loadProductCatalog } from "./productSearchDb";
import { isValidBox } from "./placementBoxes";
import type { DetectionBox, Product } from "./types";

/**
 * "Shop the whole look" — curated, fixed room bundles composited once
 * (scripts/compose-finished-room.ts or /looks/studio) and sold as a single
 * complete design, the IKEA-showroom model rather than the Designer chat's
 * build-your-own-room. Read paths degrade to an empty list when the DB
 * isn't configured, same as every other persistence-backed feature here;
 * there's no in-memory fallback because there's no sensible fake content
 * for "curated real designs" the way the supplier catalog has a sample
 * feed.
 */

export interface FinishedRoomItem {
  product: Product;
  /** Where this product actually ended up in the final hero image — located post-generation (lib/ai/locate.ts), not the pre-generation placement guess. */
  box: DetectionBox | null;
}

export interface FinishedRoom {
  id: string;
  title: string;
  description: string;
  styleTags: string[];
  heroImageBase64: string;
  /** Resolved against the live/DB catalog at read time — a product_id with no current match is simply omitted, not an error. */
  products: Product[];
  /** Same products, each paired with its hotspot box when one was located (older rows and unmatched boxes have box: null). */
  items: FinishedRoomItem[];
  totalPrice: number;
  createdAt: string;
}

function resolveRow(row: Record<string, unknown>, catalog: Product[]): FinishedRoom {
  const byId = new Map(catalog.map((p) => [p.id, p]));
  const productIds = (row.product_ids as string[] | null) ?? [];
  const products = productIds.map((id) => byId.get(id)).filter((p): p is Product => Boolean(p));
  const itemBoxes = (row.item_boxes as Record<string, unknown> | null) ?? {};
  const items: FinishedRoomItem[] = products.map((product) => {
    const box = itemBoxes[product.id];
    return { product, box: isValidBox(box) ? box : null };
  });
  return {
    id: row.id as string,
    title: row.title as string,
    description: row.description as string,
    styleTags: (row.style_tags as string[] | null) ?? [],
    heroImageBase64: row.hero_image_base64 as string,
    products,
    items,
    totalPrice: Number(row.total_price),
    createdAt: row.created_at as string,
  };
}

export async function createFinishedRoom(input: {
  title: string;
  description: string;
  styleTags: string[];
  heroImageBase64: string;
  productIds: string[];
  /** productId -> its hotspot box in the hero image, when located successfully. */
  itemBoxes?: Record<string, DetectionBox>;
  totalPrice: number;
}): Promise<string> {
  await ensureSchema();
  const db = sql();
  const rows = await db`
    INSERT INTO finished_rooms (title, description, style_tags, hero_image_base64, product_ids, item_boxes, total_price)
    VALUES (
      ${input.title}, ${input.description}, ${input.styleTags}, ${input.heroImageBase64}, ${input.productIds},
      ${JSON.stringify(input.itemBoxes ?? {})}, ${input.totalPrice}
    )
    RETURNING id
  `;
  return rows[0].id as string;
}

export async function listFinishedRooms(): Promise<FinishedRoom[]> {
  if (!dbEnabled()) return [];
  try {
    await ensureSchema();
    const db = sql();
    const [rows, catalog] = await Promise.all([
      db`SELECT * FROM finished_rooms WHERE published = true ORDER BY created_at DESC`,
      loadProductCatalog(),
    ]);
    return rows.map((r) => resolveRow(r, catalog));
  } catch (err) {
    console.error("[maison] listFinishedRooms failed:", err);
    return [];
  }
}

export async function getFinishedRoom(id: string): Promise<FinishedRoom | null> {
  if (!dbEnabled()) return null;
  try {
    await ensureSchema();
    const db = sql();
    const [rows, catalog] = await Promise.all([
      db`SELECT * FROM finished_rooms WHERE id = ${id}`,
      loadProductCatalog(),
    ]);
    if (!rows.length) return null;
    return resolveRow(rows[0], catalog);
  } catch (err) {
    console.error("[maison] getFinishedRoom failed:", err);
    return null;
  }
}
