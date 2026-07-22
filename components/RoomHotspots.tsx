"use client";

import { useState } from "react";
import { ArrowUpRight, ShoppingBag } from "lucide-react";
import type { DetectionBox } from "@/lib/types";

export interface HotspotItem {
  id: string;
  name: string;
  box: DetectionBox;
  /** Pre-formatted price label, e.g. "CHF 473" or a retailer's own "£29". */
  priceLabel: string;
  /**
   * catalog  = hand-picked, one of our own products (add to cart)
   * auto     = staged extra matched to one of our own products (add to cart, marked)
   * external = staged extra sourced to another retailer (link out, no cart)
   */
  kind: "catalog" | "auto" | "external";
  /** External retailer product URL — only on kind: "external". */
  url?: string;
  /** Retailer name for external items. */
  retailer?: string;
}

const PIN_COLOR: Record<HotspotItem["kind"], string> = {
  catalog: "bg-brass-bright",
  auto: "bg-sky-400",
  external: "bg-rose-400",
};

/**
 * Small circular "shop the look" pins, clickable, color-coded by source:
 * brass = our own hand-picked product, sky = an extra matched to our own
 * catalog, rose = an extra we don't carry, sourced to another retailer
 * (links out, never added to cart). Shared by the Looks Studio preview and
 * the published /looks/[id] page. onAction fires add-to-cart for catalog/
 * auto pins only; external pins always link out regardless.
 */
export default function RoomHotspots({
  items,
  onAction,
}: {
  items: HotspotItem[];
  onAction?: (id: string) => void;
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
          <div className="mt-1 font-display text-base text-brass-bright">{open.priceLabel}</div>

          {open.kind === "auto" && (
            <div className="mt-1 text-[10px] text-sky-300">Matched from styling — not hand-picked for this look.</div>
          )}
          {open.kind === "external" && (
            <div className="mt-1 text-[10px] text-rose-300">
              From {open.retailer || "another store"} — we don&apos;t stock this one, so it opens their site.
            </div>
          )}

          {open.kind === "external" ? (
            open.url && (
              <a
                href={open.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2.5 flex w-full items-center justify-center gap-1 rounded-full border border-rose-400/50 px-3 py-1.5 text-xs font-semibold text-rose-200 hover:bg-rose-400/10"
              >
                View at {open.retailer || "retailer"} <ArrowUpRight size={12} />
              </a>
            )
          ) : (
            onAction && (
              <button
                onClick={() => onAction(open.id)}
                className="mt-2.5 flex w-full items-center justify-center gap-1 rounded-full bg-brass px-3 py-1.5 text-xs font-semibold text-ink"
              >
                <ShoppingBag size={12} /> Add to cart
              </button>
            )
          )}
        </div>
      )}
    </>
  );
}
