import { dbEnabled, ensureSchema, sql } from "./db";

/**
 * CRUD for the `orders` table (see lib/db.ts's ensureSchema for the shape
 * and lifecycle: pending -> paid -> fulfilling -> fulfilled/fulfillment_failed).
 * Created at Stripe Checkout Session creation time, updated by the Stripe
 * webhook and then by the VidaXL fulfillment step.
 */
export interface OrderLineItem {
  productId: string;
  qty: number;
}

export interface ShippingAddress {
  line1: string;
  line2?: string;
  city?: string;
  postal_code?: string;
  state?: string;
  country: string;
}

export interface OrderRecord {
  id: string;
  userId: string | null;
  sessionId: string;
  email: string;
  stripeCheckoutSessionId: string;
  stripePaymentIntentId: string | null;
  productIds: string[];
  lineItems: OrderLineItem[];
  totalPrice: number;
  currency: string;
  status: string;
  shippingName: string | null;
  shippingAddress: ShippingAddress | null;
  vidaxlOrderId: string | null;
  vidaxlOrderError: string | null;
  createdAt: string;
}

function rowToOrder(row: Record<string, unknown>): OrderRecord {
  return {
    id: row.id as string,
    userId: (row.user_id as string | null) ?? null,
    sessionId: row.session_id as string,
    email: row.email as string,
    stripeCheckoutSessionId: row.stripe_checkout_session_id as string,
    stripePaymentIntentId: (row.stripe_payment_intent_id as string | null) ?? null,
    productIds: (row.product_ids as string[] | null) ?? [],
    lineItems: (row.line_items as OrderLineItem[] | null) ?? [],
    totalPrice: Number(row.total_price),
    currency: row.currency as string,
    status: row.status as string,
    shippingName: (row.shipping_name as string | null) ?? null,
    shippingAddress: (row.shipping_address as ShippingAddress | null) ?? null,
    vidaxlOrderId: (row.vidaxl_order_id as string | null) ?? null,
    vidaxlOrderError: (row.vidaxl_order_error as string | null) ?? null,
    createdAt: new Date(row.created_at as string).toISOString(),
  };
}

/** Called right after a Stripe Checkout Session is created, before the customer pays. */
export async function createPendingOrder(input: {
  userId: string | null;
  sessionId: string;
  email: string;
  stripeCheckoutSessionId: string;
  productIds: string[];
  lineItems: OrderLineItem[];
  totalPrice: number;
  currency?: string;
}): Promise<void> {
  if (!dbEnabled()) return;
  await ensureSchema();
  const db = sql();
  await db`
    INSERT INTO orders (user_id, session_id, email, stripe_checkout_session_id, product_ids, line_items, total_price, currency, status)
    VALUES (${input.userId}, ${input.sessionId}, ${input.email}, ${input.stripeCheckoutSessionId}, ${input.productIds}, ${JSON.stringify(input.lineItems)}, ${input.totalPrice}, ${input.currency ?? "chf"}, 'pending')
    ON CONFLICT (stripe_checkout_session_id) DO NOTHING
  `;
}

/**
 * Marks an order paid once Stripe confirms it via webhook. Guarded by
 * `status = 'pending'` so a retried/duplicate webhook delivery (Stripe
 * resends on any non-2xx response) can't double-process the same order.
 * Returns null if the order was already paid (or never existed) — the
 * caller should treat that as "nothing to do," not an error.
 */
export async function markOrderPaid(
  stripeCheckoutSessionId: string,
  stripePaymentIntentId: string | null,
  shipping: { name: string; address: ShippingAddress } | null
): Promise<OrderRecord | null> {
  if (!dbEnabled()) return null;
  await ensureSchema();
  const db = sql();
  const rows = await db`
    UPDATE orders SET
      status = 'paid',
      stripe_payment_intent_id = ${stripePaymentIntentId},
      shipping_name = ${shipping?.name ?? null},
      shipping_address = ${shipping ? JSON.stringify(shipping.address) : null},
      updated_at = now()
    WHERE stripe_checkout_session_id = ${stripeCheckoutSessionId} AND status = 'pending'
    RETURNING *
  `;
  const row = rows[0] as Record<string, unknown> | undefined;
  return row ? rowToOrder(row) : null;
}

export async function getOrderByStripeSession(stripeCheckoutSessionId: string): Promise<OrderRecord | null> {
  if (!dbEnabled()) return null;
  await ensureSchema();
  const db = sql();
  const rows = await db`SELECT * FROM orders WHERE stripe_checkout_session_id = ${stripeCheckoutSessionId}`;
  const row = rows[0] as Record<string, unknown> | undefined;
  return row ? rowToOrder(row) : null;
}

export async function setOrderFulfillment(
  orderId: string,
  patch: { status: string; vidaxlOrderId?: string | null; vidaxlOrderError?: string | null }
): Promise<void> {
  if (!dbEnabled()) return;
  await ensureSchema();
  const db = sql();
  await db`
    UPDATE orders SET status = ${patch.status}, vidaxl_order_id = ${patch.vidaxlOrderId ?? null}, vidaxl_order_error = ${patch.vidaxlOrderError ?? null}, updated_at = now()
    WHERE id = ${orderId}
  `;
}
