import { NextRequest, NextResponse } from "next/server";
import { stripe, stripeEnabled, toStripeAmount } from "@/lib/stripe";
import { authEnabled, getUserById } from "@/lib/auth";
import { getCurrentUserId } from "@/lib/session";
import { clientIp, enforceRateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";

// Matches the "Vistroom Plus" price already published on the marketing
// /pricing page (components/landing/PricingSection.tsx) — one real,
// working subscription behind that page's otherwise-static plan cards.
// Not read from an env var: unlike the furniture catalog (real, variable
// wholesale-derived prices), this is a single fixed number we set
// ourselves, same as any other line of marketing copy.
const PREMIUM_PRICE_CHF = 19;

/**
 * Real Stripe subscription checkout for unlimited AI room generations —
 * the paid side of lib/credits.ts's credit gate. Requires being
 * signed in first (unlike furniture checkout, which supports guests) since
 * "premium" is a property of an ACCOUNT, not a cart; there's nothing to
 * attach the subscription to otherwise. The webhook (app/api/webhooks/
 * stripe) flips is_premium on once payment actually completes — this
 * route only starts the checkout, it never grants access itself.
 */
export async function POST(req: NextRequest) {
  if (!stripeEnabled() || !authEnabled()) {
    return NextResponse.json(
      { error: "Premium checkout isn't configured on this server yet (needs STRIPE_SECRET_KEY and DATABASE_URL)." },
      { status: 501 },
    );
  }

  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const user = await getUserById(userId);
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (user.isPremium) return NextResponse.json({ error: "Already premium." }, { status: 400 });

  const limited = await enforceRateLimit({
    name: "checkout-premium",
    sessionId: userId,
    ip: clientIp(req),
    sessionLimit: 10,
    ipLimit: 30,
  });
  if (limited) return NextResponse.json({ error: limited.error }, { status: 429 });

  const origin = req.nextUrl.origin;
  const checkoutSession = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer_email: user.email,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "chf",
          unit_amount: toStripeAmount(PREMIUM_PRICE_CHF),
          recurring: { interval: "month" },
          product_data: { name: "Vistroom Premium", description: "Unlimited AI room generations." },
        },
      },
    ],
    success_url: `${origin}/account?upgraded=1`,
    cancel_url: `${origin}/pricing`,
    metadata: { userId },
  });

  return NextResponse.json({ url: checkoutSession.url });
}
