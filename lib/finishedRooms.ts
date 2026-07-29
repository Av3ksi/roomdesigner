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
  /** Matched from AI staging (lib/ai/locate.ts's detectUnaccountedItems) rather than hand-picked by the curator. */
  autoMatched: boolean;
}

/** A staged item we don't carry, sourced to a real external retailer (lib/ai/webProductSearch.ts). Links out; not add-to-cart; not in the total. */
export interface FinishedRoomExternalItem {
  name: string;
  url: string;
  retailer: string;
  priceText: string | null;
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
  /** Web-sourced items for staged pieces we don't carry — link out, never added to cart. */
  externals: FinishedRoomExternalItem[];
  totalPrice: number;
  /** 'curated' (Looks Studio, our own compositing) or 'user' (a customer's own room, /publish or "save to my collection"). */
  source: string;
  /** Set once the owner is signed in — null for a room saved anonymously and never published. */
  userId: string | null;
  /** The anonymous session that saved this room — how an unpublished, not-yet-logged-in "my collection" entry is owned. */
  sessionId: string | null;
  /** Public (joins Complete Rooms) or private (only visible to its owner via "my collection"). */
  published: boolean;
  createdAt: string;
}

function resolveExternals(raw: unknown): FinishedRoomExternalItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((e): e is Record<string, unknown> => typeof e === "object" && e !== null)
    .filter((e) => typeof e.name === "string" && typeof e.url === "string")
    .map((e) => ({
      name: e.name as string,
      url: e.url as string,
      retailer: typeof e.retailer === "string" ? e.retailer : "",
      priceText: typeof e.priceText === "string" ? e.priceText : null,
      box: isValidBox(e.box) ? e.box : null,
    }));
}

function resolveRow(row: Record<string, unknown>, catalog: Product[]): FinishedRoom {
  const byId = new Map(catalog.map((p) => [p.id, p]));
  const productIds = (row.product_ids as string[] | null) ?? [];
  const products = productIds.map((id) => byId.get(id)).filter((p): p is Product => Boolean(p));
  const itemBoxes = (row.item_boxes as Record<string, unknown> | null) ?? {};
  const autoMatchedIds = new Set((row.auto_matched_ids as string[] | null) ?? []);
  const items: FinishedRoomItem[] = products.map((product) => {
    const box = itemBoxes[product.id];
    return { product, box: isValidBox(box) ? box : null, autoMatched: autoMatchedIds.has(product.id) };
  });
  return {
    id: row.id as string,
    title: row.title as string,
    description: row.description as string,
    styleTags: (row.style_tags as string[] | null) ?? [],
    heroImageBase64: row.hero_image_base64 as string,
    products,
    items,
    externals: resolveExternals(row.external_items),
    totalPrice: Number(row.total_price),
    source: (row.source as string | null) ?? "curated",
    userId: (row.user_id as string | null) ?? null,
    sessionId: (row.session_id as string | null) ?? null,
    published: (row.published as boolean | null) ?? true,
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
  /** Subset of productIds that were auto-matched from AI staging rather than hand-picked. */
  autoMatchedIds?: string[];
  /** Web-sourced external items for staged pieces we don't carry. */
  externals?: FinishedRoomExternalItem[];
  totalPrice: number;
  /** 'curated' (default, Looks Studio) or 'user' (a customer's own room, /publish or "save to my collection"). */
  source?: string;
  userId?: string | null;
  /** The anonymous session saving this room — required to later list/publish it via "my collection". */
  sessionId?: string | null;
  /** Public immediately (default, existing curated/publish behavior) or private until explicitly published. */
  published?: boolean;
}): Promise<string> {
  await ensureSchema();
  const db = sql();
  const rows = await db`
    INSERT INTO finished_rooms (title, description, style_tags, hero_image_base64, product_ids, item_boxes, auto_matched_ids, external_items, total_price, source, user_id, session_id, published)
    VALUES (
      ${input.title}, ${input.description}, ${input.styleTags}, ${input.heroImageBase64}, ${input.productIds},
      ${JSON.stringify(input.itemBoxes ?? {})}, ${input.autoMatchedIds ?? []}, ${JSON.stringify(input.externals ?? [])}, ${input.totalPrice},
      ${input.source ?? "curated"}, ${input.userId ?? null}, ${input.sessionId ?? null}, ${input.published ?? true}
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

/**
 * "My collection" — every room this browser (or, once signed in, this
 * account) has saved, published or not. Ownership is session_id OR user_id
 * so a room saved anonymously still shows up after the owner later logs in
 * on the same browser, without requiring a separate merge step.
 */
export async function getUserFinishedRooms(owner: { sessionId: string; userId: string | null }): Promise<FinishedRoom[]> {
  if (!dbEnabled()) return [];
  try {
    await ensureSchema();
    const db = sql();
    const [rows, catalog] = await Promise.all([
      db`
        SELECT * FROM finished_rooms
        WHERE session_id = ${owner.sessionId} OR (${owner.userId}::uuid IS NOT NULL AND user_id = ${owner.userId})
        ORDER BY created_at DESC
      `,
      loadProductCatalog(),
    ]);
    return rows.map((r) => resolveRow(r, catalog));
  } catch (err) {
    console.error("[maison] getUserFinishedRooms failed:", err);
    return [];
  }
}

/**
 * Flips a saved room public (joins Complete Rooms) or back to private.
 * Ownership-checked against the same session_id/user_id pair
 * getUserFinishedRooms uses — returns false rather than throwing when the
 * room doesn't exist or isn't owned by this caller, so the route can 404
 * without leaking which case it was. Publishing also attaches the caller's
 * user_id if the room was saved anonymously and is only now being
 * published by a signed-in owner.
 */
export async function setFinishedRoomPublished(
  id: string,
  owner: { sessionId: string; userId: string | null },
  published: boolean,
): Promise<boolean> {
  await ensureSchema();
  const db = sql();
  const rows = await db`
    UPDATE finished_rooms
    SET published = ${published}, user_id = COALESCE(user_id, ${owner.userId})
    WHERE id = ${id} AND (session_id = ${owner.sessionId} OR (${owner.userId}::uuid IS NOT NULL AND user_id = ${owner.userId}))
    RETURNING id
  `;
  return rows.length > 0;
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
