"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useConsentStore } from "@/lib/consentStore";

/**
 * Gates ad/analytics tracking behind an explicit choice, shown once per
 * visitor. Nothing in app/layout.tsx's Pixel/gtag scripts loads until
 * "Accept" is clicked — see lib/consentStore.ts for why this has to be
 * opt-in rather than a dismissible notice.
 */
export default function ConsentBanner() {
  const consent = useConsentStore((s) => s.trackingConsent);
  const setConsent = useConsentStore((s) => s.setTrackingConsent);
  // zustand's persisted value only exists after client-side hydration; the
  // server render and the very first client render both see the default
  // (null), so gating on `mounted` avoids a hydration-mismatch flash of
  // the banner for a returning visitor who already answered.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted || consent !== null) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[90] border-t border-ink-line bg-ink-soft/98 p-4 backdrop-blur">
      <div className="container-page flex flex-col items-center justify-between gap-3 sm:flex-row">
        <p className="max-w-2xl text-xs leading-relaxed text-cream-dim">
          We&apos;d like to use advertising cookies (Meta, Google) to see which ads lead to a purchase. These are
          off by default and only load if you agree — see our{" "}
          <Link href="/legal/privacy" className="underline hover:text-cream">
            Privacy Policy
          </Link>{" "}
          for details.
        </p>
        <div className="flex shrink-0 gap-2">
          <button onClick={() => setConsent("denied")} className="btn-ghost !py-2 text-xs">
            Necessary only
          </button>
          <button onClick={() => setConsent("granted")} className="btn-primary !py-2 text-xs">
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
