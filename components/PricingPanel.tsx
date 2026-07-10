"use client";

import { ChevronDown, CreditCard, ShoppingBag, SlidersHorizontal } from "lucide-react";
import { useMemo, useState } from "react";
import { formatPrice, pricingBreakdown } from "@/lib/products";
import type { Product } from "@/lib/types";

interface PricingPanelProps {
  products: Product[];
  onBuyComplete: () => void;
  onCustomize: () => void;
}

const ROWS: { key: "furniture" | "lighting" | "decoration" | "installation" | "delivery"; label: string }[] = [
  { key: "furniture", label: "Furniture" },
  { key: "lighting", label: "Lighting" },
  { key: "decoration", label: "Decoration" },
  { key: "installation", label: "Installation" },
  { key: "delivery", label: "Delivery" },
];

const TERMS = [12, 24, 36];

export default function PricingPanel({ products, onBuyComplete, onCustomize }: PricingPanelProps) {
  const [financeOpen, setFinanceOpen] = useState(false);
  const [term, setTerm] = useState(12);
  const breakdown = useMemo(() => pricingBreakdown(products), [products]);
  const monthly = Math.ceil(breakdown.total / term);

  return (
    <div className="card overflow-hidden border-brass/25">
      <div className="border-b border-ink-line px-5 py-4">
        <div className="text-[11px] uppercase tracking-wider text-cream-faint">Pricing breakdown</div>
        <div className="mt-0.5 text-sm text-cream-dim">{products.length} pieces, fully specified</div>
      </div>

      <div className="divide-y divide-ink-line/60 px-5">
        {ROWS.map((r) => (
          <div key={r.key} className="flex items-center justify-between py-2.5 text-sm">
            <span className="text-cream-dim">{r.label}</span>
            <span className="font-medium text-cream">{formatPrice(breakdown[r.key])}</span>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between border-t border-brass/25 bg-brass/5 px-5 py-4">
        <span className="font-display text-base uppercase tracking-wider text-brass-bright">Total</span>
        <span className="font-display text-2xl text-brass-bright">{formatPrice(breakdown.total)}</span>
      </div>

      <div className="space-y-2 p-4">
        <button onClick={onBuyComplete} className="btn-primary w-full">
          <ShoppingBag size={15} /> Buy Complete Room
        </button>
        <button onClick={onCustomize} className="btn-ghost w-full">
          <SlidersHorizontal size={14} /> Customize Products
        </button>
        <button
          onClick={() => setFinanceOpen((v) => !v)}
          className="flex w-full items-center justify-center gap-2 rounded-full border border-ink-line px-4 py-2.5 text-xs font-semibold text-cream-dim transition hover:border-brass/40 hover:text-brass-bright"
        >
          <CreditCard size={14} /> Finance Monthly
          <ChevronDown size={13} className={`transition-transform ${financeOpen ? "rotate-180" : ""}`} />
        </button>

        {financeOpen && (
          <div className="animate-fade-in rounded-xl border border-ink-line bg-ink-soft p-3.5">
            <div className="flex gap-2">
              {TERMS.map((m) => (
                <button
                  key={m}
                  onClick={() => setTerm(m)}
                  className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-semibold transition ${
                    term === m ? "border-brass bg-brass/10 text-brass-bright" : "border-ink-line text-cream-dim hover:border-brass/40"
                  }`}
                >
                  {m} mo
                </button>
              ))}
            </div>
            <div className="mt-3 flex items-baseline justify-between">
              <span className="text-xs text-cream-faint">Estimated payment</span>
              <span className="font-display text-xl text-brass-bright">{formatPrice(monthly)}/mo</span>
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-cream-faint">
              Illustrative estimate only, 0% representative APR assumed — not a credit offer. Final
              financing terms are confirmed at checkout.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
