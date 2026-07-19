import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

/**
 * Postgres persistence (blueprint's Phase 1, chunk 2 — docs/BLUEPRINT.md
 * §10). Degrades exactly like every other integration in this app: no
 * DATABASE_URL means no persistence and no DB-backed catalog search, not
 * a crash — the Designer Agent still works in-memory-only, same as
 * before this chunk existed.
 */
export function dbEnabled(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

let cached: NeonQueryFunction<false, false> | null = null;

export function sql(): NeonQueryFunction<false, false> {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not configured");
  if (!cached) cached = neon(process.env.DATABASE_URL);
  return cached;
}

let schemaReady: Promise<void> | null = null;

/**
 * Idempotent (CREATE TABLE/INDEX IF NOT EXISTS) — safe to call on every
 * cold start rather than requiring a separate migration step. Cached per
 * process so repeated calls in one request lifecycle are free.
 *
 * Images (original photo + every rendered version) are stored as base64
 * directly in Postgres for now — a known, deliberate shortcut (the
 * blueprint's real architecture calls for blob storage/S3) to avoid
 * standing up a second new external service before this chunk proves
 * itself. Revisit before real scale.
 */
export function ensureSchema(): Promise<void> {
  if (!schemaReady) schemaReady = runSchema();
  return schemaReady;
}

async function runSchema(): Promise<void> {
  const db = sql();
  await db`
    CREATE TABLE IF NOT EXISTS rooms (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      session_id TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT 'Untitled room',
      original_photo TEXT NOT NULL,
      room_context JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await db`CREATE INDEX IF NOT EXISTS idx_rooms_session ON rooms(session_id)`;

  await db`
    CREATE TABLE IF NOT EXISTS room_messages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('user','assistant')),
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await db`CREATE INDEX IF NOT EXISTS idx_messages_room ON room_messages(room_id)`;

  await db`
    CREATE TABLE IF NOT EXISTS room_constraints (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      description TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await db`CREATE INDEX IF NOT EXISTS idx_constraints_room ON room_constraints(room_id)`;

  await db`
    CREATE TABLE IF NOT EXISTS room_versions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      image_base64 TEXT NOT NULL,
      label TEXT NOT NULL,
      objects JSONB NOT NULL DEFAULT '[]',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await db`CREATE INDEX IF NOT EXISTS idx_versions_room ON room_versions(room_id)`;

  await db`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      supplier_id TEXT NOT NULL,
      supplier_label TEXT NOT NULL,
      sku TEXT NOT NULL,
      name TEXT NOT NULL,
      brand TEXT NOT NULL,
      category TEXT NOT NULL,
      price NUMERIC NOT NULL,
      rating NUMERIC NOT NULL,
      reviews INT NOT NULL DEFAULT 0,
      styles TEXT[] NOT NULL DEFAULT '{}',
      color TEXT NOT NULL,
      blurb TEXT NOT NULL,
      image_url TEXT,
      product_url TEXT,
      cost_price NUMERIC,
      dimensions_cm JSONB,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await db`CREATE INDEX IF NOT EXISTS idx_products_category ON products(category)`;
  await db`CREATE INDEX IF NOT EXISTS idx_products_price ON products(price)`;

  // Curated, fixed "shop the whole look" bundles (the IKEA-style showroom
  // model) — a hero image of a real room with a hand-picked set of real
  // catalog products already composited in, sold as one complete look
  // rather than assembled live per customer. Product IDs reference the
  // `products` table's id column but aren't a hard FK: a bundle should
  // still display (with stale pricing flagged) if a product is later
  // discontinued, not 500 because of one dangling reference.
  await db`
    CREATE TABLE IF NOT EXISTS finished_rooms (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      style_tags TEXT[] NOT NULL DEFAULT '{}',
      hero_image_base64 TEXT NOT NULL,
      product_ids TEXT[] NOT NULL DEFAULT '{}',
      total_price NUMERIC NOT NULL,
      published BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await db`CREATE INDEX IF NOT EXISTS idx_finished_rooms_published ON finished_rooms(published)`;
}
