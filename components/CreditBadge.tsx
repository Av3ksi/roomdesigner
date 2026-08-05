"use client";

import { useEffect, useState } from "react";
import { Coins } from "lucide-react";
import BuyCreditsModal from "@/components/BuyCreditsModal";
import { useVistroomStore } from "@/lib/store";

/**
 * Site-wide credit balance pill (lib/credits.ts) — lives in the header
 * (Nav.tsx) rather than just on /designer, since credits are tied to the
 * anonymous session cookie, not to being signed in: a signed-out visitor
 * still has a balance and should be able to see it anywhere, not only on
 * the one page that happens to spend it.
 *
 * Reads from the shared store (lib/store.ts), not its own local state — a
 * real, confirmed bug had this component fetch into a local useState, so a
 * spend on /designer updated Designer.tsx's own count but left this badge
 * showing the stale pre-spend balance until a full reload. This is also
 * the one place that actually triggers the initial fetch (Nav is always
 * mounted, on every page), so nothing else needs to.
 */
export default function CreditBadge() {
  const credits = useVistroomStore((s) => s.credits);
  const premium = useVistroomStore((s) => s.premiumAccount);
  const refreshCredits = useVistroomStore((s) => s.refreshCredits);
  const [showBuyCredits, setShowBuyCredits] = useState(false);

  useEffect(() => {
    refreshCredits();
  }, [refreshCredits]);

  if (credits === null) return null;

  if (premium) {
    return (
      <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-brass/40 bg-brass/10 px-2.5 py-1.5 text-xs font-semibold text-brass-bright sm:px-3">
        <Coins size={13} />
        <span className="hidden sm:inline">Unlimited · </span>Premium
      </span>
    );
  }

  return (
    <>
      {showBuyCredits && <BuyCreditsModal onClose={() => setShowBuyCredits(false)} />}
      <button
        onClick={() => setShowBuyCredits(true)}
        className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-semibold transition sm:px-3 ${
          credits === 0
            ? "border-rose-400/40 bg-rose-400/10 text-rose-300 hover:border-rose-400/60"
            : "border-ink-line text-cream-dim hover:border-brass/40 hover:text-brass-bright"
        }`}
      >
        <Coins size={13} />
        {credits}
        <span className="hidden sm:inline"> credit{credits === 1 ? "" : "s"}</span>
      </button>
    </>
  );
}
