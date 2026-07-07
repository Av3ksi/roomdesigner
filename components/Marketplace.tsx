"use client";

import { useMemo, useState } from "react";
import { Plus, Star } from "lucide-react";
import ProductGlyph from "@/components/room/ProductGlyph";
import { formatPrice, PRODUCTS } from "@/lib/products";
import { STYLES } from "@/lib/styles";
import { useMaisonStore } from "@/lib/store";
import type { ProductCategory } from "@/lib/types";

const CATEGORIES: { id: ProductCategory | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "sofa", label: "Sofas" },
  { id: "chair", label: "Chairs" },
  { id: "table", label: "Tables" },
  { id: "lighting", label: "Lighting" },
  { id: "rug", label: "Rugs" },
  { id: "art", label: "Art" },
  { id: "storage", label: "Storage" },
  { id: "plant", label: "Plants" },
  { id: "textile", label: "Textiles" },
  { id: "decor", label: "Decor" },
];

export default function Marketplace() {
  const [category, setCategory] = useState<ProductCategory | "all">("all");
  const [styleId, setStyleId] = useState<string>("all");
  const addToCart = useMaisonStore((s) => s.addToCart);

  const filtered = useMemo(
    () =>
      PRODUCTS.filter(
        (p) =>
          (category === "all" || p.category === category) &&
          (styleId === "all" || p.styles.includes(styleId)),
      ),
    [category, styleId],
  );

  return (
    <div className="container-page py-14">
      <div className="max-w-2xl">
        <div className="eyebrow mb-3">Marketplace</div>
        <h1 className="font-display text-4xl leading-tight sm:text-5xl">
          If it&apos;s in the render, it&apos;s real.
        </h1>
        <p className="mt-4 text-cream-dim">
          Every piece Maison places in a design is a purchasable product from
          a vetted retail partner — matched to the style, sized to your room.
        </p>
      </div>

      <div className="mt-10 flex flex-wrap items-center gap-2">
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            onClick={() => setCategory(c.id)}
            className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${
              category === c.id
                ? "border-brass bg-brass/10 text-brass-bright"
                : "border-ink-line text-cream-dim hover:border-brass/40"
            }`}
          >
            {c.label}
          </button>
        ))}
        <span className="mx-2 hidden h-5 w-px bg-ink-line sm:block" />
        <select
          value={styleId}
          onChange={(e) => setStyleId(e.target.value)}
          className="rounded-full border border-ink-line bg-ink-soft px-3.5 py-1.5 text-xs font-semibold text-cream-dim focus:border-brass/60 focus:outline-none"
          aria-label="Filter by style"
        >
          <option value="all">All styles</option>
          {STYLES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <span className="ml-auto text-xs text-cream-faint">
          {filtered.length} piece{filtered.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {filtered.map((p) => (
          <div key={p.id} className="card group overflow-hidden transition hover:border-brass/50">
            <div className="aspect-[5/4] overflow-hidden">
              <ProductGlyph product={p} className="h-full w-full transition duration-500 group-hover:scale-105" />
            </div>
            <div className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate font-semibold">{p.name}</div>
                  <div className="text-xs text-cream-faint">{p.brand}</div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-semibold text-brass-bright">{formatPrice(p.price)}</div>
                  <div className="flex items-center justify-end gap-1 text-[11px] text-cream-faint">
                    <Star size={10} className="fill-brass text-brass" /> {p.rating} ({p.reviews})
                  </div>
                </div>
              </div>
              <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-cream-faint">
                {p.blurb}
              </p>
              <button onClick={() => addToCart(p)} className="btn-ghost mt-4 w-full !py-2 text-xs">
                <Plus size={13} /> Add to room list
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
