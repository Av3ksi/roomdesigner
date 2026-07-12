"use client";

import { Plus, Sparkles } from "lucide-react";
import { useMemo } from "react";
import ProductGlyph from "@/components/room/ProductGlyph";
import { formatPrice } from "@/lib/products";
import { resolveBundles } from "@/lib/bundles";
import type { Product } from "@/lib/types";

interface ShoppingBundlesProps {
  styleId: string;
  ownedIds: string[];
  onAddBundle: (products: Product[]) => void;
}

export default function ShoppingBundles({ styleId, ownedIds, onAddBundle }: ShoppingBundlesProps) {
  const bundles = useMemo(() => resolveBundles(styleId, ownedIds), [styleId, ownedIds]);

  if (bundles.length === 0) return null;

  return (
    <div className="card mt-4 p-4">
      <div className="mb-3 flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-cream-faint">
        <Sparkles size={12} className="text-brass" /> AI shopping bundles
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {bundles.map((b) => (
          <div key={b.id} className="w-56 shrink-0 rounded-xl border border-ink-line p-3.5">
            <div className="flex -space-x-3">
              {b.products.slice(0, 3).map((p) => (
                <div key={p.id} className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border-2 border-ink-soft">
                  <ProductGlyph product={p} className="h-full w-full" />
                </div>
              ))}
            </div>
            <div className="mt-2.5 text-sm font-semibold">{b.name}</div>
            <p className="mt-0.5 text-[11px] leading-snug text-cream-faint">{b.description}</p>
            <div className="mt-2.5 flex items-baseline gap-1.5">
              <span className="font-display text-base text-brass-bright">{formatPrice(b.bundlePrice)}</span>
              <span className="text-[11px] text-cream-faint line-through">{formatPrice(b.total)}</span>
            </div>
            <button
              onClick={() => onAddBundle(b.products)}
              className="btn-ghost mt-2.5 w-full !py-1.5 text-[11px]"
            >
              <Plus size={11} /> Add bundle · save {formatPrice(b.savings)}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
