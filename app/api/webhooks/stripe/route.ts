import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe, stripeEnabled } from "@/lib/stripe";
import { markOrderPaid } from "@/lib/orders";
import { orderConfirmationEmailHtml, sendEmail } from "@/lib/email";
import { getProductsByIds } from "@/lib/productSearchDb";
import { formatPrice } from "@/lib/products";

export const runtime = "nodejs";

/**
 * Stripe calls this once payment completes. Reads the raw request body (not
 * req.json()) because signature verification is over the exact bytes Stripe
 * sent — parsing and re-serializing would break the signature check.
 */
export async function POST(req: NextRequest) {
  if (!stripeEnabled()) return NextResponse.json({ error: "Stripe not configured." }, { status: 501 });
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "STRIPE_WEBHOOK_SECRET not configured." }, { status: 501 });

  const signature = req.headers.get("stripe-signature");
  const rawBody = await req.text();
  if (!signature) return NextResponse.json({ error: "Missing stripe-signature header." }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(rawBody, signature, secret);
  } catch (err) {
    console.error("[maison] stripe webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const paymentIntentId =
      typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;

    const order = await markOrderPaid(session.id, paymentIntentId);
    // null means either this order was already marked paid (a retried
    // webhook delivery — Stripe resends until it gets a 2xx) or it doesn't
    // exist; either way there's nothing left to do.
    if (order) {
      const products = await getProductsByIds(order.productIds);
      await sendEmail({
        to: order.email,
        subject: "Your Maison order is confirmed",
        html: orderConfirmationEmailHtml({
          orderId: order.id,
          totalLabel: formatPrice(order.totalPrice),
          itemNames: products.map((p) => p.name),
        }),
      });
    }
  }

  return NextResponse.json({ received: true });
}
