"use client";

import { AlertTriangle, ArrowRight, Package, Truck } from "lucide-react";
import { useMemo, useState } from "react";
import ProductGlyph from "@/components/room/ProductGlyph";
import { STYLE_MAP } from "@/lib/styles";
import type { SupplierCatalogResult } from "@/lib/suppliers";
import type { ProductCategory } from "@/lib/types";

function formatChf(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "CHF", maximumFractionDigits: 0 });
}

export default function SupplierCatalogPreview({ catalog }: { catalog: SupplierCatalogResult }) {
  const [category, setCategory] = useState<ProductCategory | "all">("all");
  const categories = useMemo(
    () => Array.from(new Set(catalog.products.map((p) => p.category))).sort(),
    [catalog.products],
  );
  const filtered = category === "all" ? catalog.products : catalog.products.filter((p) => p.category === category);

  return (
    <div className="container-page py-14">
      <div className="max-w-2xl">
        <div className="eyebrow mb-3">Supplier integration — internal preview</div>
        <h1 className="font-display text-4xl leading-tight sm:text-5xl">
          {catalog.supplierLabel} catalog, mapped.
        </h1>
        <p className="mt-4 text-cream-dim">
          Every product below went through the real ingestion pipeline — category, style tags and
          color inferred from the supplier's own text, retail price computed from cost with a
          dropship markup. This page is not linked from the main nav; it exists to prove the
          pipeline before wiring it into the live marketplace catalog.
        </p>
      </div>

      <div
        className={`card mt-6 flex flex-wrap items-center gap-3 p-4 ${
          catalog.source === "mock" ? "border-brass/30 bg-brass/5" : "border-sage/40 bg-sage/5"
        }`}
      >
        <span
          className={`chip ${catalog.source === "mock" ? "!border-brass/40 !text-brass-bright" : "!border-sage/50 !text-sage"}`}
        >
          {catalog.source === "mock" ? "MOCK DATA" : "LIVE FEED"}
        </span>
        <p className="text-sm text-cream-dim">
          {catalog.source === "mock" ? (
            <>
              Set <code className="rounded bg-ink-panel px-1.5 py-0.5">VIDAXL_API_URL</code>,{" "}
              <code className="rounded bg-ink-panel px-1.5 py-0.5">VIDAXL_ACCOUNT_EMAIL</code> and{" "}
              <code className="rounded bg-ink-panel px-1.5 py-0.5">VIDAXL_API_KEY</code> in your
              environment to switch this to the real feed — nothing else changes, same product
              shape either way.
            </>
          ) : (
            "Live data from the configured supplier API."
          )}
        </p>
        <span className="ml-auto text-xs text-cream-faint">
          {catalog.products.length} products · fetched{" "}
          {new Date(catalog.fetchedAt).toLocaleTimeString("en-US", { timeZone: "UTC" })} UTC
        </span>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <button
          onClick={() => setCategory("all")}
          className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold transition ${
            category === "all" ? "border-brass bg-brass/10 text-brass-bright" : "border-ink-line text-cream-dim hover:border-brass/40"
          }`}
        >
          All ({catalog.products.length})
        </button>
        {categories.map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold capitalize transition ${
              category === c ? "border-brass bg-brass/10 text-brass-bright" : "border-ink-line text-cream-dim hover:border-brass/40"
            }`}
          >
            {c} ({catalog.products.filter((p) => p.category === c).length})
          </button>
        ))}
      </div>

      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {filtered.map((p) => {
          const margin = p.supplier ? Math.round(((p.price - p.supplier.costPrice) / p.price) * 100) : null;
          return (
            <div key={p.id} className="card overflow-hidden">
              <div className="relative aspect-[5/4] overflow-hidden">
                <ProductGlyph product={p} className="h-full w-full" />
                {!p.imageUrl && (
                  <span className="absolute left-2.5 top-2.5 rounded-full bg-ink/80 px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-cream-faint backdrop-blur">
                    {catalog.source === "mock" ? "No photo in mock feed" : "No photo in supplier feed"}
                  </span>
                )}
              </div>
              <div className="p-4">
                <div className="truncate font-semibold">{p.name}</div>
                <div className="text-xs text-cream-faint">
                  {p.brand} · SKU {p.supplier?.sku}
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {p.styles.map((s) => (
                    <span key={s} className="chip !px-1.5 !py-0.5 !text-[9px]">
                      {STYLE_MAP[s]?.name ?? s}
                    </span>
                  ))}
                </div>
                <div className="mt-3 flex items-baseline justify-between">
                  <div>
                    <div className="font-display text-lg text-brass-bright">{formatChf(p.price)}</div>
                    {p.supplier && (
                      <div className="text-[10px] text-cream-faint">
                        cost {formatChf(p.supplier.costPrice)} · {margin}% margin
                      </div>
                    )}
                  </div>
                  {p.category === "sofa" && (
                    <span className="flex items-center gap-1 rounded-full border border-brass/30 px-2 py-1 text-[9px] font-semibold text-brass">
                      <Truck size={10} /> freight
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="card mt-10 flex items-start gap-3 p-5">
        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-brass" />
        <div className="text-sm text-cream-dim">
          <span className="font-semibold text-cream">Not wired into the live marketplace yet.</span>{" "}
          Merging supplier products into the main catalog (used by the Studio's concept generation)
          is a deliberate next step, not automatic — the generation logic references specific
          curated product IDs today, so this needs a considered merge rather than a silent swap.
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2 text-xs text-cream-faint">
        <Package size={13} className="text-brass" />
        Category and style inferred from vendor text via keyword matching — see{" "}
        <code className="rounded bg-ink-panel px-1.5 py-0.5">lib/suppliers/mapping.ts</code>
        <ArrowRight size={11} />
      </div>
    </div>
  );
}
