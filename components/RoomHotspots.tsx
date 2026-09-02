"use client";

import { useState } from "react";
import { ArrowUpRight, Move, ShoppingBag } from "lucide-react";
import type { DetectionBox } from "@/lib/types";

export interface HotspotItem {
  id: string;
  name: string;
  box: DetectionBox;
  /** Pre-formatted price label, e.g. "CHF 473" or a retailer's own "£29". Unused for kind: "unavailable". */
  priceLabel: string;
  /**
   * catalog     = hand-picked, one of our own products (add to cart)
   * auto        = staged extra matched to one of our own products (add to cart, marked)
   * external    = staged extra sourced to another retailer (link out, no cart)
   * unavailable = a real object the AI detected in the render that isn't sourced anywhere —
   *               still gets a pin so every visible object is clickable, just honestly not shoppable yet
   */
  kind: "catalog" | "auto" | "external" | "unavailable";
  /** External retailer product URL — only on kind: "external". */
  url?: string;
  /** Retailer name for external items. */
  retailer?: string;
  /** True when this item has everything a caller's onMove needs (a known category). Only meaningful together with onMove — ignored otherwise. */
  movable?: boolean;
}

const PIN_COLOR: Record<HotspotItem["kind"], string> = {
  catalog: "bg-brass-bright",
  auto: "bg-sky-400",
  external: "bg-rose-400",
  unavailable: "bg-slate-400",
};

/**
 * Small circular "shop the look" pins, clickable, color-coded by source:
 * brass = our own hand-picked product, sky = an extra matched to our own
 * catalog, rose = an extra we don't carry, sourced to another retailer
 * (links out, never added to cart), slate = a real detected object we
 * chose not to source (past the web-search cap) — still pinned so nothing
 * in the room is silently invisible, just honestly marked as not shoppable
 * yet. Shared by the Looks Studio preview and the published /looks/[id]
 * page. onAction fires add-to-cart for catalog/auto pins only; external
 * pins always link out; unavailable pins have no action at all. onMove is
 * optional and additive — only Designer.tsx (the one place an already-
 * placed object can actually be repositioned) passes it; the Looks Studio
 * preview and published /looks/[id] page omit it and see no "Move" button.
 */
export default function RoomHotspots({
  items,
  onAction,
  onMove,
}: {
  items: HotspotItem[];
  onAction?: (id: string) => void;
  onMove?: (id: string) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = items.find((i) => i.id === openId) ?? null;

  return (
    <>
      {items.map((item) => (
        <button
          key={item.id}
          onClick={() => setOpenId(openId === item.id ? null : item.id)}
          style={{ left: `${(item.box.x + item.box.w / 2) * 100}%`, top: `${(item.box.y + item.box.h / 2) * 100}%` }}
          className={`absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/90 shadow-md transition hover:scale-125 ${PIN_COLOR[item.kind]}`}
          aria-label={`View ${item.name}`}
        />
      ))}

      {open && (
        <div
          style={{
            left: `${Math.min(Math.max(open.box.x * 100, 0), 66)}%`,
            top: `${Math.min((open.box.y + open.box.h / 2) * 100 + 3, 86)}%`,
          }}
          className="absolute z-10 w-60 rounded-lg border border-ink-line bg-ink p-3 text-left shadow-xl"
        >
          <div className="text-xs font-semibold text-cream">{open.name}</div>

          {open.kind === "unavailable" ? (
            <div className="mt-1 text-[10px] text-cream-faint">Not sourced yet — not available to buy here.</div>
          ) : (
            <div className="mt-1 font-display text-base text-brass-bright">{open.priceLabel}</div>
          )}

          {open.kind === "auto" && (
            <div className="mt-1 text-[10px] text-sky-300">Matched from styling — not hand-picked for this look.</div>
          )}
          {open.kind === "external" && (
            <div className="mt-1 text-[10px] text-rose-300">
              From {open.retailer || "another store"} — we don&apos;t stock this one, so it opens their site.
            </div>
          )}

          <div className="mt-2.5 flex flex-col gap-1.5">
            {open.kind === "external" ? (
              open.url && (
                <a
                  href={open.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex w-full items-center justify-center gap-1 rounded-full border border-rose-400/50 px-3 py-1.5 text-xs font-semibold text-rose-200 hover:bg-rose-400/10"
                >
                  View at {open.retailer || "retailer"} <ArrowUpRight size={12} />
                </a>
              )
            ) : open.kind === "unavailable" ? null : (
              onAction && (
                <button
                  onClick={() => onAction(open.id)}
                  className="flex w-full items-center justify-center gap-1 rounded-full bg-brass px-3 py-1.5 text-xs font-semibold text-ink"
                >
                  <ShoppingBag size={12} /> Add to cart
                </button>
              )
            )}
            {onMove && open.movable && open.kind !== "unavailable" && (
              <button
                onClick={() => onMove(open.id)}
                className="flex w-full items-center justify-center gap-1 rounded-full border border-ink-line px-3 py-1.5 text-xs font-semibold text-cream-dim hover:border-brass/40 hover:text-cream"
              >
                <Move size={12} /> Move
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
