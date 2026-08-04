"use client";

import { useState } from "react";
import { Crown, Loader2, X } from "lucide-react";

interface UpgradeModalProps {
  onClose: () => void;
}

/**
 * The freemium paywall — shown once the free AI room generation is used
 * up. "Upgrade" starts a real Stripe subscription checkout
 * (app/api/checkout/premium); premium is a property of a signed-in
 * account, so a signed-out visitor is sent to /login first rather than
 * straight to Stripe with nothing to attach the subscription to.
 */
export default function UpgradeModal({ onClose }: UpgradeModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upgrade() {
    setLoading(true);
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
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <button aria-label="Close" className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="card relative w-full max-w-sm animate-fade-in p-6 text-center">
        <button
          onClick={onClose}
          className="absolute right-3 top-3 rounded-full border border-ink-line p-1.5 text-cream-dim hover:text-cream"
          aria-label="Close"
        >
          <X size={14} />
        </button>

        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-brass/15 text-brass">
          <Crown size={22} />
        </div>

        <h2 className="font-display text-xl">Upgrade to Premium</h2>
        <p className="mt-2 text-sm leading-relaxed text-cream-faint">
          You&apos;ve used your free room generation. Upgrade for unlimited AI room designs, removals, and renders.
        </p>

        {error && <p className="mt-3 text-xs text-rose-300">{error}</p>}

        <button
          onClick={upgrade}
          disabled={loading}
          className="mt-6 flex w-full items-center justify-center gap-1.5 rounded-full bg-brass py-2.5 text-sm font-semibold text-ink transition hover:bg-brass-bright disabled:opacity-60"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : null}
          {loading ? "One moment…" : "Upgrade to Premium"}
        </button>
        <button onClick={onClose} className="mt-3 text-xs text-cream-faint underline decoration-ink-line hover:text-cream">
          Maybe later
        </button>
      </div>
    </div>
  );
}
