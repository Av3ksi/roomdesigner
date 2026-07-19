import { dbEnabled, ensureSchema, sql } from "./db";
import { loadProductCatalog } from "./productSearchDb";
import type { Product } from "./types";

/**
 * "Shop the whole look" — curated, fixed room bundles composited once
 * (scripts/compose-finished-room.ts) and sold as a single complete
 * design, the IKEA-showroom model rather than the Designer chat's
 * build-your-own-room. Read paths degrade to an empty list when the DB
 * isn't configured, same as every other persistence-backed feature here;
 * there's no in-memory fallback because there's no sensible fake content
 * for "curated real designs" the way the supplier catalog has a sample
 * feed.
 */

export interface FinishedRoom {
  id: string;
  title: string;
  description: string;
  styleTags: string[];
  heroImageBase64: string;
  /** Resolved against the live/DB catalog at read time — a product_id with no current match is simply omitted, not an error. */
  products: Product[];
  totalPrice: number;
  createdAt: string;
}

function resolveRow(row: Record<string, unknown>, catalog: Product[]): FinishedRoom {
  const byId = new Map(catalog.map((p) => [p.id, p]));
  const productIds = (row.product_ids as string[] | null) ?? [];
  const products = productIds.map((id) => byId.get(id)).filter((p): p is Product => Boolean(p));
  return {
    id: row.id as string,
    title: row.title as string,
    description: row.description as string,
    styleTags: (row.style_tags as string[] | null) ?? [],
    heroImageBase64: row.hero_image_base64 as string,
    products,
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
  totalPrice: number;
}): Promise<string> {
  await ensureSchema();
  const db = sql();
  const rows = await db`
    INSERT INTO finished_rooms (title, description, style_tags, hero_image_base64, product_ids, total_price)
    VALUES (${input.title}, ${input.description}, ${input.styleTags}, ${input.heroImageBase64}, ${input.productIds}, ${input.totalPrice})
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
