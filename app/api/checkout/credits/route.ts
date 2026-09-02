import { NextRequest, NextResponse } from "next/server";
import { CREDIT_PACKS } from "@/lib/creditPacks";

export const runtime = "nodejs";

/**
 * Credit pack purchases — NOT wired to real payment yet, unlike
 * app/api/checkout/premium (a real, live Stripe subscription). This route
 * exists so BuyCreditsModal.tsx already has the real client shape it would
 * use once this is live (fetch → handle response → redirect to a Stripe
 * Checkout URL), same pattern as the premium route: validate the pack,
 * create a real `mode: "payment"` Checkout Session with `metadata:
 * {sessionId, packId, credits}`, return { url }. The webhook
 * (app/api/webhooks/stripe) would then grant the credits via
 * lib/credits.ts's grantCredits() on checkout.session.completed, mirroring
 * how the premium subscription grants is_premium today.
 *
 * Until that's built, this only validates the request shape and returns
 * 501 — same "not configured yet" degrade pattern used everywhere else in
 * this app, not a silent fake success.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const packId = typeof body?.packId === "string" ? body.packId : "";
  const pack = CREDIT_PACKS.find((p) => p.id === packId);
  if (!pack) return NextResponse.json({ error: "Unknown credit pack." }, { status: 400 });

  return NextResponse.json({ error: "Credit pack purchases aren't available yet — check back soon." }, { status: 501 });
}
