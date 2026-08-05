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
  // Extra angle photos and an optional floor plan — context for analysis
  // (inventory + room-dimension estimates) only. The single original_photo
  // above stays the one and only base image every render edits; these never
  // get passed to the image-edit step.
  await db`ALTER TABLE rooms ADD COLUMN IF NOT EXISTS extra_photos TEXT[] NOT NULL DEFAULT '{}'`;
  await db`ALTER TABLE rooms ADD COLUMN IF NOT EXISTS floorplan_photo TEXT`;
  // Which signed-in account this live Designer session belongs to, once
  // known — NULL for a room only ever touched anonymously. Set at creation
  // when already signed in, or backfilled (claimed) the first time a
  // signed-in visitor loads a room that only had their anonymous
  // session_id so far — same "start anonymous, attach identity when it
  // matters" pattern as finished_rooms.user_id. Lets lib/roomPersistence.ts's
  // ownership checks and getMostRecentRoomForUser find a room across a
  // browser/device that never had this room's id in localStorage.
  await db`ALTER TABLE rooms ADD COLUMN IF NOT EXISTS user_id UUID`;
  await db`CREATE INDEX IF NOT EXISTS idx_rooms_user ON rooms(user_id)`;

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
  // Every real photo the supplier feed had for this SKU, not just the one
  // clean shot in image_url — the product detail gallery only, never read
  // for compositing (see lib/suppliers/mapping.ts's pickProductImageUrl).
  await db`ALTER TABLE products ADD COLUMN IF NOT EXISTS image_urls TEXT[]`;

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
  // Where each product actually ended up in the final hero image (a
  // {productId: DetectionBox} map), located by lib/ai/locate.ts against the
  // finished render itself — not the pre-generation placement suggestion,
  // which showroom-restyle mode is free to ignore. Powers clickable
  // hotspots on /looks/[id]. Rows created before this existed just have
  // '{}' and render without hotspots rather than erroring.
  await db`ALTER TABLE finished_rooms ADD COLUMN IF NOT EXISTS item_boxes JSONB NOT NULL DEFAULT '{}'::jsonb`;
  // Which product_ids were auto-matched from AI staging (lib/ai/locate.ts's
  // detectUnaccountedItems) rather than hand-picked by the curator — lets
  // the UI mark them visually distinct (a different hotspot color) so
  // nobody mistakes "we happened to find something close" for "this was
  // deliberately styled in".
  await db`ALTER TABLE finished_rooms ADD COLUMN IF NOT EXISTS auto_matched_ids TEXT[] NOT NULL DEFAULT '{}'`;
  // Staged items we don't carry, sourced to a real external retailer via web
  // search ([{name, url, retailer, priceText, box}]). Not catalog products —
  // they link out, aren't added to cart, and don't count toward the total.
  await db`ALTER TABLE finished_rooms ADD COLUMN IF NOT EXISTS external_items JSONB NOT NULL DEFAULT '[]'::jsonb`;

  // Which finished rooms were curated by us (Looks Studio) vs. published by
  // a customer for inspiration (see app/publish) — same table, since both
  // are "a real room + real products, shown for inspiration," just a
  // different author and moderation posture.
  await db`ALTER TABLE finished_rooms ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'curated'`;
  await db`ALTER TABLE finished_rooms ADD COLUMN IF NOT EXISTS user_id UUID`;

  // The anonymous session that saved this room to "my collection" (see
  // lib/finishedRooms.ts's getUserFinishedRooms/setFinishedRoomPublished) —
  // lets a room be privately owned before a customer ever logs in. user_id
  // above is set once the owner is actually signed in (at publish time, if
  // not already known), same "start anonymous, attach identity when it
  // matters" pattern as the rest of this app.
  await db`ALTER TABLE finished_rooms ADD COLUMN IF NOT EXISTS session_id TEXT`;
  await db`CREATE INDEX IF NOT EXISTS idx_finished_rooms_session ON finished_rooms(session_id)`;

  // Abuse/cost protection for the paid AI endpoints — see lib/rateLimit.ts.
  // One row per limiter key (e.g. "generate:session-id"); a single UPSERT
  // atomically resets-if-expired or increments, so concurrent requests from
  // the same key can't race past the limit.
  await db`
    CREATE TABLE IF NOT EXISTS rate_limits (
      key TEXT PRIMARY KEY,
      window_start TIMESTAMPTZ NOT NULL,
      count INT NOT NULL
    )
  `;

  // Credit-based gate for AI room generation (replaces the old single-
  // free-generation session_usage table) — see lib/credits.ts. One row per
  // anonymous session holding the current balance; credits_remaining is
  // the actual gate (a single atomic UPDATE ... WHERE credits_remaining >
  // 0, safe under concurrent requests) — credit_transactions below is a
  // parallel append-only log for history/support, not itself read for the
  // gating decision.
  await db`
    CREATE TABLE IF NOT EXISTS credit_accounts (
      session_id TEXT PRIMARY KEY,
      credits_remaining INT NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  // amount: positive = credit added (initial grant, purchase, admin grant),
  // negative = spent (one row per generation). user_id is opportunistic
  // metadata (populated when the spender happens to be signed in) — NOT
  // used for balance lookups, which stay purely session-keyed per
  // lib/credits.ts's scope; it's here so a support question ("did this
  // account's credits change") can be answered without a second join.
  await db`
    CREATE TABLE IF NOT EXISTS credit_transactions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      session_id TEXT NOT NULL,
      user_id UUID,
      amount INT NOT NULL,
      reason TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await db`CREATE INDEX IF NOT EXISTS idx_credit_transactions_session ON credit_transactions(session_id)`;
  await db`CREATE INDEX IF NOT EXISTS idx_credit_transactions_user ON credit_transactions(user_id)`;

  // Real accounts — email only by default, no passwords to hash/store/leak.
  // Login is normally a one-time link emailed via Resend (see lib/auth.ts).
  await db`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  // One narrow exception to "no passwords": an owner/admin account can set
  // one via scripts/set-user-password.ts instead of waiting on a magic-link
  // email every time — see lib/password.ts. NULL (the default for every
  // normal account) always fails password login; only an account that
  // explicitly opted in has one.
  await db`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT`;
  // Unlimited AI generations, bypassing lib/credits.ts's credit gate
  // entirely — set by a real Stripe subscription (app/api/checkout/premium,
  // app/api/webhooks/stripe) or manually via scripts/set-user-password.ts
  // --premium for an owner/comp account that shouldn't need to pay itself.
  await db`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_premium BOOLEAN NOT NULL DEFAULT false`;
  // Links this user to their Stripe subscription — set once a premium
  // checkout completes, used by the webhook to find the right user again
  // when the subscription later renews, updates, or cancels.
  await db`ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT`;
  await db`ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT`;
  await db`
    CREATE TABLE IF NOT EXISTS login_tokens (
      token TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await db`CREATE INDEX IF NOT EXISTS idx_login_tokens_email ON login_tokens(email)`;

  // One row per real checkout — created when a Stripe Checkout Session
  // starts, updated to "paid" by the webhook once Stripe confirms payment,
  // then "fulfilling"/"fulfilled"/"fulfillment_failed" as the VidaXL order
  // is placed (lib/vidaxlOrders.ts). user_id is nullable — guest checkout
  // (an email captured at checkout time) is supported, not just logged-in
  // purchases.
  await db`
    CREATE TABLE IF NOT EXISTS orders (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID,
      session_id TEXT NOT NULL,
      email TEXT NOT NULL,
      stripe_checkout_session_id TEXT NOT NULL UNIQUE,
      stripe_payment_intent_id TEXT,
      product_ids TEXT[] NOT NULL DEFAULT '{}',
      total_price NUMERIC NOT NULL,
      currency TEXT NOT NULL DEFAULT 'chf',
      status TEXT NOT NULL DEFAULT 'pending',
      vidaxl_order_id TEXT,
      vidaxl_order_error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await db`CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id)`;
  await db`CREATE INDEX IF NOT EXISTS idx_orders_session ON orders(session_id)`;
  await db`CREATE INDEX IF NOT EXISTS idx_orders_stripe_session ON orders(stripe_checkout_session_id)`;

  // Per-product quantities ([{productId, qty}]) — product_ids alone can't
  // tell "2 of this sofa" from "1 of this sofa", which VidaXL fulfillment
  // needs to get right. Populated at checkout-session creation time.
  await db`ALTER TABLE orders ADD COLUMN IF NOT EXISTS line_items JSONB NOT NULL DEFAULT '[]'::jsonb`;
  // Ship-to name/address — only known once Stripe Checkout collects it, so
  // these land via the webhook (markOrderPaid), not at session creation.
  await db`ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_name TEXT`;
  await db`ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_address JSONB`;
}
