"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

/** Same real checkout as UpgradeModal — used here on /account, where the visitor is already known to be signed in, so there's no sign-in redirect branch to handle. */
export default function UpgradeToPremiumButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upgrade() {
    setLoading(true);
    setError(null);
    try {
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
    <div>
      <button
        onClick={upgrade}
        disabled={loading}
        className="btn-primary flex w-full items-center justify-center gap-1.5 disabled:opacity-60"
      >
        {loading ? <Loader2 size={14} className="animate-spin" /> : null}
        {loading ? "One moment…" : "Upgrade to Premium — CHF 19/month"}
      </button>
      {error && <p className="mt-2 text-center text-xs text-rose-300">{error}</p>}
    </div>
  );
}
