"use client";

import { ArrowRight, Sparkles } from "lucide-react";
import Image from "next/image";
import { useMemo, useState } from "react";
import ProductGlyph from "@/components/room/ProductGlyph";
import { matchProductsToAnalysis } from "@/lib/matching";
import { STYLE_MAP } from "@/lib/styles";
import type { SupplierCatalogResult } from "@/lib/suppliers";
import type { ProductCategory, SampleRoom } from "@/lib/types";

const CATEGORIES: ProductCategory[] = [
  "sofa", "chair", "table", "lighting", "rug", "art", "plant", "storage", "decor", "textile",
];

function formatChf(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "CHF", maximumFractionDigits: 0 });
}

export default function MatchingPreview({ catalog, rooms }: { catalog: SupplierCatalogResult; rooms: SampleRoom[] }) {
  const [roomId, setRoomId] = useState(rooms[0]?.id ?? "");
  const room = rooms.find((r) => r.id === roomId) ?? rooms[0];

  const matches = useMemo(
    () => (room ? matchProductsToAnalysis(catalog.products, room.analysis, CATEGORIES) : []),
    [catalog.products, room],
  );

  if (!room) return null;

  return (
    <div className="container-page py-14">
      <div className="max-w-2xl">
        <div className="eyebrow mb-3">Matching step — internal preview</div>
        <h1 className="font-display text-4xl leading-tight sm:text-5xl">Room, matched to real products.</h1>
        <p className="mt-4 text-cream-dim">
          Each pick below is chosen deterministically from the {catalog.supplierLabel} catalog (
          {catalog.source}) — weighted by how well the product's style tags overlap the room's own
          ranked style affinity, with color proximity to the room's palette as a tiebreaker. See{" "}
          <code className="rounded bg-ink-panel px-1.5 py-0.5">lib/matching.ts</code>.
        </p>
      </div>

      <div className="mt-8 flex flex-wrap gap-2">
        {rooms.map((r) => (
          <button
            key={r.id}
            onClick={() => setRoomId(r.id)}
            className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
              r.id === room.id ? "border-brass bg-brass/10 text-brass-bright" : "border-ink-line text-cream-dim hover:border-brass/40"
            }`}
          >
            {r.name}
          </button>
        ))}
      </div>

      <div className="card mt-6 p-5">
        <div className="text-sm text-cream-faint">{room.meta}</div>
        <p className="mt-2 text-sm text-cream-dim">{room.analysis.summary}</p>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <div className="flex flex-wrap gap-1.5">
            {room.analysis.styleAffinity.map((s, i) => (
              <span
                key={s.styleId}
                className={`chip !text-[10px] ${i === 0 ? "!border-brass/50 !text-brass-bright" : ""}`}
              >
                {STYLE_MAP[s.styleId]?.name ?? s.styleId} · {s.score}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            {room.analysis.colorPalette.map((c) => (
              <span
                key={c.hex}
                title={c.name}
                className="h-5 w-5 rounded-full border border-ink-line"
                style={{ backgroundColor: c.hex }}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {matches.map((m) => (
          <div key={m.category} className="card overflow-hidden">
            <div className="relative aspect-[5/4] overflow-hidden bg-ink-panel">
              {m.product.imageUrl ? (
                <Image
                  src={m.product.imageUrl}
                  alt={m.product.name}
                  fill
                  sizes="(min-width: 1280px) 25vw, (min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                  className="object-cover"
                />
              ) : (
                <ProductGlyph product={m.product} className="h-full w-full" />
              )}
              <span className="absolute left-2.5 top-2.5 flex items-center gap-1 rounded-full bg-ink/80 px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-brass-bright backdrop-blur">
                <Sparkles size={10} /> match {m.matchScore.toFixed(0)}
              </span>
              <span className="absolute right-2.5 top-2.5 rounded-full bg-ink/80 px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-cream-faint backdrop-blur capitalize">
                {m.category}
              </span>
            </div>
            <div className="p-4">
              <div className="truncate font-semibold">{m.product.name}</div>
              <div className="text-xs text-cream-faint">{m.product.brand}</div>
              <div className="mt-2 flex flex-wrap gap-1">
                {m.product.styles.map((s) => (
                  <span key={s} className="chip !px-1.5 !py-0.5 !text-[9px]">
                    {STYLE_MAP[s]?.name ?? s}
                  </span>
                ))}
              </div>
              <div className="mt-3 font-display text-lg text-brass-bright">{formatChf(m.product.price)}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-2 text-xs text-cream-faint">
        <ArrowRight size={11} className="text-brass" />
        {matches.length} of {CATEGORIES.length} categories had a candidate in this catalog — the rest were
        skipped rather than forced.
      </div>
    </div>
  );
}
