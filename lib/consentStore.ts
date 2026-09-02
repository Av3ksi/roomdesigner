"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Whether the visitor has agreed to non-essential (advertising/analytics)
 * tracking. `null` means no choice has been made yet — the banner is still
 * showing, and NOTHING third-party may load.
 *
 * This exists because the site's own privacy policy explicitly stated "we
 * run no third-party advertising or analytics trackers" before ad
 * conversion tracking was added. Loading a Meta Pixel or Google Ads tag
 * unconditionally would make that a lie the moment it shipped, and would
 * set non-essential cookies for EU visitors without the consent GDPR
 * requires for exactly that category. Every consumer of trackingConsent
 * (lib/analytics.ts, app/layout.tsx's script tags) must treat "granted" as
 * the only value that permits loading anything.
 */
export type TrackingConsent = "granted" | "denied" | null;

interface ConsentStore {
  trackingConsent: TrackingConsent;
  setTrackingConsent: (value: TrackingConsent) => void;
}

export const useConsentStore = create<ConsentStore>()(
  persist(
    (set) => ({
      trackingConsent: null,
      setTrackingConsent: (value) => set({ trackingConsent: value }),
    }),
    { name: "vistroom-consent" },
  ),
);
