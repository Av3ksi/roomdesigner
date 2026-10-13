"use client";

/**
 * Fires ad-platform purchase conversion events — Meta Pixel and Google Ads
 * — so paid campaigns can actually learn which spend converts. Nothing in
 * here does anything unless BOTH of these hold:
 *
 *   1. The visitor has granted tracking consent (useConsentStore) — see
 *      that module's doc for why this is a hard requirement, not a nicety.
 *   2. The relevant script actually loaded, which itself only happens
 *      after consent AND its env var is configured (app/layout.tsx).
 *
 * Both scripts attach their SDK to `window` as a side effect (fbq, gtag);
 * this module is deliberately the ONLY place in the app that touches
 * those globals, so a future change to how conversions fire has one call
 * site instead of several.
 */

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    gtag?: (...args: unknown[]) => void;
  }
}

function trackingGranted(): boolean {
  try {
    // Read localStorage directly rather than importing useConsentStore:
    // this file is called from a plain useEffect, not a component render,
    // and zustand's persisted value is what's actually authoritative after
    // hydration — reading the same key back avoids a stale-closure risk if
    // the store hook's value were captured before persistence hydrated.
    const raw = localStorage.getItem("vistroom-consent");
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { state?: { trackingConsent?: string } };
    return parsed.state?.trackingConsent === "granted";
  } catch {
    return false;
  }
}

/** Order ids already reported, so a page refresh on /checkout/success can't double-count a sale. */
function alreadyReported(orderId: string): boolean {
  try {
    const key = "vistroom-reported-purchases";
    const seen: string[] = JSON.parse(sessionStorage.getItem(key) ?? "[]");
    if (seen.includes(orderId)) return true;
    sessionStorage.setItem(key, JSON.stringify([...seen, orderId].slice(-20)));
    return false;
  } catch {
    // If sessionStorage is unavailable, fail open on dedup (report it) —
    // losing dedup is a minor data-quality issue, losing the conversion
    // entirely is the more expensive mistake for a paid campaign to make.
    return false;
  }
}

/**
 * Reports a completed order to every configured, consented ad platform.
 * Call this exactly once, only after your own backend has confirmed the
 * order is genuinely paid (see components/CheckoutSuccess.tsx) — never
 * speculatively on page load, which would let anyone visiting the success
 * URL directly manufacture a fake conversion.
 */
export function trackPurchase(opts: { orderId: string; value: number; currency: string }): void {
  if (typeof window === "undefined") return;
  if (!trackingGranted()) return;
  if (alreadyReported(opts.orderId)) return;

  if (window.fbq) {
    window.fbq("track", "Purchase", { value: opts.value, currency: opts.currency });
  }

  const googleAdsId = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID;
  const purchaseLabel = process.env.NEXT_PUBLIC_GOOGLE_ADS_PURCHASE_LABEL;
  if (window.gtag && googleAdsId && purchaseLabel) {
    window.gtag("event", "conversion", {
      send_to: `${googleAdsId}/${purchaseLabel}`,
      value: opts.value,
      currency: opts.currency,
      transaction_id: opts.orderId,
    });
  }
}
