import Stripe from "stripe";

/**
 * Real payment processing. Degrades like every other integration here:
 * without STRIPE_SECRET_KEY, checkout falls back to the old demo flow
 * (Checkout.tsx's local "place order" button) instead of crashing.
 */
export function stripeEnabled(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

let cached: Stripe | null = null;

export function stripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY not configured");
  if (!cached) cached = new Stripe(process.env.STRIPE_SECRET_KEY);
  return cached;
}

/** Stripe wants the smallest currency unit — CHF has 2 decimal places, like USD (it is not zero-decimal). */
export function toStripeAmount(chf: number): number {
  return Math.round(chf * 100);
}
