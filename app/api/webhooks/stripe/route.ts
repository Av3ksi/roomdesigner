import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe, stripeEnabled } from "@/lib/stripe";
import { markOrderPaid, setOrderFulfillment, type ShippingAddress } from "@/lib/orders";
import { orderConfirmationEmailHtml, sendEmail } from "@/lib/email";
import { getProductsByIds } from "@/lib/productSearchDb";
import { formatPrice } from "@/lib/products";
import { createVidaxlOrder, vidaxlEnabled } from "@/lib/vidaxlOrders";
import { getUserByStripeCustomerId, setUserPremium, setUserPremiumFromStripe } from "@/lib/auth";

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

    // The premium subscription checkout (app/api/checkout/premium) — a
    // completely separate flow from furniture checkout below, identified
    // by mode + the userId it stamped into metadata (there's no order row
    // for this one, nothing to fulfil, just an account flag to flip).
    if (session.mode === "subscription") {
      const userId = session.metadata?.userId;
      const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
      const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
      if (userId && customerId && subscriptionId) {
        await setUserPremiumFromStripe(userId, customerId, subscriptionId);
      }
      return NextResponse.json({ received: true });
    }

    const paymentIntentId =
      typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;
    const shippingDetails = session.collected_information?.shipping_details;
    const shipping = shippingDetails ? { name: shippingDetails.name, address: shippingDetails.address as ShippingAddress } : null;

    const order = await markOrderPaid(session.id, paymentIntentId, shipping);
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

      // Best-effort, attempted once per successful payment (not retried by
      // this webhook — a Stripe retry would see status 'paid' and skip
      // markOrderPaid entirely). A failure here doesn't touch the customer;
      // it just means an ops person needs to place the supplier order
      // manually, same as before this existed.
      if (vidaxlEnabled()) {
        try {
          const result = await createVidaxlOrder(order, products);
          await setOrderFulfillment(order.id, { status: "fulfilled", vidaxlOrderId: result.vidaxlOrderId });
        } catch (err) {
          console.error("[maison] VidaXL order creation failed:", err);
          await setOrderFulfillment(order.id, {
            status: "fulfillment_failed",
            vidaxlOrderError: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }
  }

  // Subscription lifecycle after the initial checkout — a cancellation, or
  // a renewal payment that finally fails after Stripe's own retry
  // schedule, both need premium turned back off. Matched by customer id,
  // not subscription id, since that's the field we actually store
  // (lib/auth.ts's setUserPremiumFromStripe) and both event payloads carry
  // `customer` directly.
  if (event.type === "customer.subscription.deleted" || event.type === "customer.subscription.updated") {
    const subscription = event.data.object as Stripe.Subscription;
    const revoked = event.type === "customer.subscription.deleted" || ["canceled", "unpaid", "incomplete_expired"].includes(subscription.status);
    if (revoked) {
      const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
      const user = await getUserByStripeCustomerId(customerId);
      if (user) await setUserPremium(user.id, false);
    }
  }

  return NextResponse.json({ received: true });
}
