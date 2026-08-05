"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { CREDIT_PACKS } from "@/lib/creditPacks";
import BuyCreditsModal from "@/components/BuyCreditsModal";

// Pricing is intentionally anchored to the real credit system (lib/credits.ts,
// lib/creditPacks.ts) rather than invented plan features — every line item
// below is something the app actually does today. FREE_CREDITS (3) is a
// one-time starting grant, not a monthly allowance, so the free tier says
// so plainly instead of implying a recurring reset.
//
// A fourth "Pro/Studio" tier (client workspaces, API access, trade pricing)
// was deliberately dropped rather than shipped — none of that exists in the
// app yet. Revisit once there's real demand from design firms/agencies, not
// before; a tier promising unbuilt features isn't conservative pricing.
const FREE_FEATURES = [
  "3 free AI room generations to start",
  "All 10 signature styles",
  "Full spatial analysis",
  "Shoppable product lists",
];

// The only real difference a Premium subscription makes (see isPremiumUser
// in lib/auth.ts) is skipping the credit gate — kept the feature list to
// what's actually true rather than promising a priority queue, multiple
// concepts per render, or exports that don't exist yet.
const PLUS_FEATURES = [
  "Unlimited AI room generations",
  "No per-render credit spend",
  "All 10 signature styles",
  "Full spatial analysis & saved rooms",
];

function upgradePrice(pack: (typeof CREDIT_PACKS)[number]) {
  return (pack.priceChf / pack.credits).toFixed(2);
}

export default function PricingSection() {
  const [showBuyCredits, setShowBuyCredits] = useState(false);
  const [upgrading, setUpgrading] = useState(false);
  const [upgradeError, setUpgradeError] = useState<string | null>(null);

  async function goPlus() {
    setUpgrading(true);
    setUpgradeError(null);
    try {
      const me = await fetch("/api/auth/me").then((res) => res.json());
      if (!me.user) {
        window.location.href = "/login";
        return;
      }
      const res = await fetch("/api/checkout/premium", { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Something went wrong.");
      window.location.href = body.url;
    } catch (err) {
      setUpgradeError(err instanceof Error ? err.message : String(err));
      setUpgrading(false);
    }
  }

  return (
    <section className="border-t border-ink-line/60 bg-ink-soft/50">
      {showBuyCredits && <BuyCreditsModal onClose={() => setShowBuyCredits(false)} />}
      <div className="container-page py-20">
        <div className="mb-12 max-w-2xl">
          <div className="eyebrow mb-3">Pricing</div>
          <h2 className="font-display text-4xl leading-tight sm:text-5xl">
            A designer on retainer, for less than lunch.
          </h2>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {/* Free — the actual signup-cost starting grant, not a recurring plan. */}
          <div className="card relative flex flex-col p-7">
            <div className="text-sm font-semibold text-cream-dim">Free</div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="font-display text-5xl text-cream">CHF 0</span>
              <span className="text-xs uppercase tracking-wider text-cream-faint">forever</span>
            </div>
            <p className="mt-2 text-sm text-cream-faint">Feel the magic on your own room.</p>
            <ul className="mt-6 flex-1 space-y-2.5">
              {FREE_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-sm text-cream-dim">
                  <Check size={15} className="mt-0.5 shrink-0 text-brass" />
                  {f}
                </li>
              ))}
            </ul>
            <Link href="/designer" className="btn-ghost mt-7 w-full justify-center">
              Start free
            </Link>
          </div>

          {/* Credit packs — pay-as-you-go, directly from lib/creditPacks.ts (no separate pricing model to keep in sync). */}
          <div className="card relative flex flex-col p-7">
            <div className="text-sm font-semibold text-cream-dim">Credit packs</div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="font-display text-5xl text-cream">CHF {CREDIT_PACKS[0].priceChf}</span>
              <span className="text-xs uppercase tracking-wider text-cream-faint">to start</span>
            </div>
            <p className="mt-2 text-sm text-cream-faint">Top up anytime — credits never expire.</p>
            <ul className="mt-6 flex-1 space-y-2.5">
              {CREDIT_PACKS.map((pack) => (
                <li key={pack.id} className="flex items-start justify-between gap-2.5 text-sm text-cream-dim">
                  <span className="flex items-start gap-2.5">
                    <Check size={15} className="mt-0.5 shrink-0 text-brass" />
                    {pack.credits} credits
                  </span>
                  <span className="text-cream-faint">
                    CHF {pack.priceChf} <span className="text-xs">({upgradePrice(pack)}/credit)</span>
                  </span>
                </li>
              ))}
            </ul>
            <button onClick={() => setShowBuyCredits(true)} className="btn-ghost mt-7 w-full justify-center">
              Buy credits
            </button>
          </div>

          {/* Plus — the one real subscription (app/api/checkout/premium), unlimited generations by skipping the credit gate entirely. */}
          <div className="card relative flex flex-col border-brass/70 p-7 shadow-[0_0_60px_-18px_rgba(200,169,110,0.45)]">
            <span className="absolute -top-3 left-6 rounded-full bg-brass px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-ink">
              Most loved
            </span>
            <div className="text-sm font-semibold text-cream-dim">Plus</div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="font-display text-5xl text-cream">CHF 19</span>
              <span className="text-xs uppercase tracking-wider text-cream-faint">per month</span>
            </div>
            <p className="mt-2 text-sm text-cream-faint">For a whole home, room by room.</p>
            <ul className="mt-6 flex-1 space-y-2.5">
              {PLUS_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-sm text-cream-dim">
                  <Check size={15} className="mt-0.5 shrink-0 text-brass" />
                  {f}
                </li>
              ))}
            </ul>
            <button
              onClick={goPlus}
              disabled={upgrading}
              className="btn-primary mt-7 flex w-full items-center justify-center gap-1.5 disabled:opacity-60"
            >
              {upgrading ? <Loader2 size={14} className="animate-spin" /> : null}
              {upgrading ? "One moment…" : "Go Plus"}
            </button>
            {upgradeError && <p className="mt-2 text-center text-xs text-rose-300">{upgradeError}</p>}
          </div>
        </div>
      </div>
    </section>
  );
}
