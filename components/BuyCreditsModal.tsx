"use client";

import { useState } from "react";
import { Coins, Crown, Loader2, X } from "lucide-react";
import { CREDIT_PACKS } from "@/lib/creditPacks";

interface BuyCreditsModalProps {
  onClose: () => void;
}

/**
 * Shown when a session hits 0 credits (lib/credits.ts) — fixed-overlay
 * modal. Pack purchases are NOT wired to real
 * payment yet (POST /api/checkout/credits currently always returns 501) —
 * this is deliberately the real client shape (fetch → handle response →
 * redirect to a Stripe URL) a real purchase would use, so wiring an actual
 * Stripe price later is a small, contained change to that one route
 * (mirrors app/api/checkout/premium, which IS live) rather than a rewrite
 * here. The "Upgrade to Premium" option below IS real today, since that
 * checkout already exists — offered as the other way out of a 0 balance,
 * not a replacement for buying a pack.
 */
export default function BuyCreditsModal({ onClose }: BuyCreditsModalProps) {
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [upgrading, setUpgrading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function buyPack(packId: string) {
    setBuyingId(packId);
    setError(null);
    try {
      const res = await fetch("/api/checkout/credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packId }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Something went wrong.");
      window.location.href = body.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBuyingId(null);
    }
  }

  async function upgrade() {
    setUpgrading(true);
    setError(null);
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
      setError(err instanceof Error ? err.message : String(err));
      setUpgrading(false);
    }
  }

  const busy = buyingId !== null || upgrading;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <button aria-label="Close" className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="card relative w-full max-w-md animate-fade-in p-6">
        <button
          onClick={onClose}
          className="absolute right-3 top-3 rounded-full border border-ink-line p-1.5 text-cream-dim hover:text-cream"
          aria-label="Close"
        >
          <X size={14} />
        </button>

        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-brass/15 text-brass">
          <Coins size={22} />
        </div>
        <h2 className="text-center font-display text-xl">Out of credits</h2>
        <p className="mt-2 text-center text-sm leading-relaxed text-cream-faint">
          Every AI room render — add, remove, or move — spends one credit. Buy more to keep going.
        </p>

        {error && <p className="mt-3 text-center text-xs text-rose-300">{error}</p>}

        <div className="mt-6 space-y-2.5">
          {CREDIT_PACKS.map((pack) => (
            <button
              key={pack.id}
              onClick={() => buyPack(pack.id)}
              disabled={busy}
              className="flex w-full items-center justify-between rounded-xl border border-ink-line bg-ink-panel px-4 py-3 text-left transition hover:border-brass/50 disabled:opacity-50"
            >
              <span className="text-sm font-semibold text-cream">{pack.credits} credits</span>
              <span className="flex items-center gap-2 text-sm text-brass-bright">
                {buyingId === pack.id && <Loader2 size={13} className="animate-spin" />}
                CHF {pack.priceChf}
              </span>
            </button>
          ))}
        </div>

        <div className="mt-4 flex items-center gap-3 text-[10px] uppercase tracking-wider text-cream-faint">
          <span className="h-px flex-1 bg-ink-line" />
          or
          <span className="h-px flex-1 bg-ink-line" />
        </div>

        <button
          onClick={upgrade}
          disabled={busy}
          className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-full bg-brass py-2.5 text-sm font-semibold text-ink transition hover:bg-brass-bright disabled:opacity-60"
        >
          {upgrading ? <Loader2 size={14} className="animate-spin" /> : <Crown size={14} />}
          {upgrading ? "One moment…" : "Go unlimited with Premium — CHF 19/month"}
        </button>
        <button onClick={onClose} className="mt-3 w-full text-center text-xs text-cream-faint underline decoration-ink-line hover:text-cream">
          Maybe later
        </button>
      </div>
    </div>
  );
}
