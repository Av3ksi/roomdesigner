import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe, stripeEnabled, toStripeAmount } from "@/lib/stripe";
import { dbEnabled } from "@/lib/db";
import { getProductsByIds } from "@/lib/productSearchDb";
import { createPendingOrder } from "@/lib/orders";
import { DELIVERY, INSTALLATION } from "@/lib/checkoutOptions";
import { clientIp, enforceRateLimit } from "@/lib/rateLimit";
import { getCurrentUserId, getOrCreateSessionId } from "@/lib/session";

export const runtime = "nodejs";

interface CartItemInput {
  productId: string;
  qty: number;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Creates a real Stripe Checkout Session for the cart and records a
 * 'pending' order row before redirecting — the webhook flips it to 'paid'
 * once Stripe confirms. Requires both Stripe and the DB (an order we can't
 * persist is an order we can't fulfil), so this degrades to 501 rather than
 * silently taking payment with nowhere to record it.
 */
export async function POST(req: NextRequest) {
  if (!stripeEnabled() || !dbEnabled()) {
    return NextResponse.json(
      { error: "Real checkout isn't configured on this server yet (needs STRIPE_SECRET_KEY and DATABASE_URL)." },
      { status: 501 }
    );
  }

  const body = await req.json().catch(() => null);
  const items: CartItemInput[] = Array.isArray(body?.items) ? body.items : [];
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const deliveryId = typeof body?.delivery === "string" ? body.delivery : DELIVERY[0].id;
  const installId = typeof body?.installation === "string" ? body.installation : INSTALLATION[0].id;

  if (items.length === 0) return NextResponse.json({ error: "Your cart is empty." }, { status: 400 });
  if (!isValidEmail(email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });

  const sessionId = await getOrCreateSessionId();
  const limited = await enforceRateLimit({
    name: "checkout-session",
    sessionId,
    ip: clientIp(req),
    sessionLimit: 10,
    ipLimit: 30,
  });
  if (limited) return NextResponse.json({ error: limited.error }, { status: 429 });

  const deliveryOpt = DELIVERY.find((d) => d.id === deliveryId) ?? DELIVERY[0];
  const installOpt = INSTALLATION.find((i) => i.id === installId) ?? INSTALLATION[0];

  // Never trust client-sent prices — look every product up server-side.
  const products = await getProductsByIds(items.map((i) => i.productId));
  if (products.length === 0) {
    return NextResponse.json({ error: "None of the items in your cart could be found." }, { status: 400 });
  }
  const qtyById = new Map(
    items.map((i) => [i.productId, Math.max(1, Math.min(20, Math.floor(i.qty) || 1))])
  );

  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = products.map((p) => ({
    quantity: qtyById.get(p.id) ?? 1,
    price_data: {
      currency: "chf",
      unit_amount: toStripeAmount(p.price),
      product_data: {
        name: p.name,
        ...(p.imageUrl ? { images: [p.imageUrl] } : {}),
      },
    },
  }));
  if (deliveryOpt.price > 0) {
    lineItems.push({
      quantity: 1,
      price_data: { currency: "chf", unit_amount: toStripeAmount(deliveryOpt.price), product_data: { name: deliveryOpt.label } },
    });
  }
  if (installOpt.price > 0) {
    lineItems.push({
      quantity: 1,
      price_data: { currency: "chf", unit_amount: toStripeAmount(installOpt.price), product_data: { name: installOpt.label } },
    });
  }

  const totalPrice =
    products.reduce((sum, p) => sum + p.price * (qtyById.get(p.id) ?? 1), 0) + deliveryOpt.price + installOpt.price;

  const userId = await getCurrentUserId();
  const origin = req.nextUrl.origin;

  const checkoutSession = await stripe().checkout.sessions.create({
    mode: "payment",
    line_items: lineItems,
    customer_email: email,
    // Restricted to the European markets this store actually serves — also
    // what lib/vidaxlOrders.ts needs to have anywhere to ship to.
    shipping_address_collection: { allowed_countries: ["CH", "DE", "AT", "FR", "IT"] },
    success_url: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/checkout`,
    metadata: { sessionId, userId: userId ?? "" },
  });

  await createPendingOrder({
    userId,
    sessionId,
    email,
    stripeCheckoutSessionId: checkoutSession.id,
    productIds: products.map((p) => p.id),
    lineItems: products.map((p) => ({ productId: p.id, qty: qtyById.get(p.id) ?? 1 })),
    totalPrice,
  });

  return NextResponse.json({ url: checkoutSession.url });
}
