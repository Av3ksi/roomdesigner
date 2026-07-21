"use client";

import { useState } from "react";
import { formatPrice } from "@/lib/products";
import type { DetectionBox } from "@/lib/types";

export interface HotspotItem {
  id: string;
  name: string;
  price: number;
  box: DetectionBox;
  /** Matched from AI staging rather than hand-picked by the curator — shown with a distinct color and a note, never blended in as if deliberately styled. */
  autoMatched: boolean;
}

/**
 * Small circular "shop the look" pins (Pinterest/ASOS-style), not bounding
 * boxes — a real product's silhouette rarely fills a rectangle cleanly, so
 * a full outline reads as a debug overlay. A dot at the center plus a
 * popover on click is the same information with a professional look.
 * Shared by the Looks Studio preview (no onAction — info only, there's no
 * cart in the internal tool) and the published /looks/[id] page (onAction
 * wired to add-to-cart).
 */
export default function RoomHotspots({
  items,
  onAction,
  actionLabel = "Add to cart",
}: {
  items: HotspotItem[];
  onAction?: (id: string) => void;
  actionLabel?: string;
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
          className={`absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/90 shadow-md transition hover:scale-125 ${
            item.autoMatched ? "bg-sky-400" : "bg-brass-bright"
          }`}
          aria-label={`View ${item.name}`}
        />
      ))}

      {open && (
        <div
          style={{
            left: `${Math.min(Math.max(open.box.x * 100, 0), 68)}%`,
            top: `${Math.min((open.box.y + open.box.h / 2) * 100 + 3, 88)}%`,
          }}
          className="absolute z-10 w-56 rounded-lg border border-ink-line bg-ink p-3 text-left shadow-xl"
        >
          <div className="text-xs font-semibold text-cream">{open.name}</div>
          <div className="mt-1 font-display text-base text-brass-bright">{formatPrice(open.price)}</div>
          {open.autoMatched && (
            <div className="mt-1 text-[10px] text-sky-300">Matched from styling — not hand-picked for this look.</div>
          )}
          {onAction && (
            <button
              onClick={() => onAction(open.id)}
              className="mt-2.5 w-full rounded-full bg-brass px-3 py-1.5 text-xs font-semibold text-ink"
            >
              {actionLabel}
            </button>
          )}
        </div>
      )}
    </>
  );
}
