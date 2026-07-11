"use client";

import { History, Layers, RotateCcw, X } from "lucide-react";
import { createPortal } from "react-dom";
import RoomScene from "@/components/room/RoomScene";
import { formatPrice } from "@/lib/products";
import type { RoomHistoryEntry } from "@/lib/roomHistory";

interface RoomHistoryPanelProps {
  history: RoomHistoryEntry[];
  currentId: string;
  onRestore: (entry: RoomHistoryEntry) => void;
  onSave: (entry: RoomHistoryEntry) => void;
  onClose: () => void;
}

function relativeTime(ts: number): string {
  const diffSec = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (diffSec < 5) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const min = Math.round(diffSec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.round(hr / 24)}d ago`;
}

export default function RoomHistoryPanel({ history, currentId, onRestore, onSave, onClose }: RoomHistoryPanelProps) {
  return createPortal(
    <div className="fixed inset-0 z-[70] flex justify-end">
      <button aria-label="Close history" className="absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-md animate-fade-in flex-col overflow-y-auto border-l border-ink-line bg-ink-soft shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-ink-line bg-ink-soft/95 px-5 py-4 backdrop-blur">
          <div className="flex items-center gap-2">
            <History size={15} className="text-brass" />
            <div>
              <div className="text-sm font-semibold">Room history</div>
              <div className="text-[11px] text-cream-faint">{history.length} version{history.length === 1 ? "" : "s"} · scrub back any time</div>
            </div>
          </div>
          <button onClick={onClose} className="rounded-full border border-ink-line p-2 text-cream-dim hover:text-cream" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <ul className="flex-1 space-y-2.5 p-4">
          {history.map((entry) => {
            const isCurrent = entry.id === currentId;
            const total = entry.products.reduce((n, p) => n + p.price, 0);
            return (
              <li
                key={entry.id}
                className={`flex items-center gap-3 rounded-xl border p-2.5 transition ${
                  isCurrent ? "border-brass bg-brass/10" : "border-ink-line hover:border-brass/30"
                }`}
              >
                <div className="h-14 w-20 shrink-0 overflow-hidden rounded-lg border border-ink-line/60">
                  <RoomScene spec={entry.spec} variant={entry.variant} className="h-full w-full" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-medium">{entry.label}</span>
                    {isCurrent && (
                      <span className="chip !border-brass/40 !px-1.5 !py-0 !text-[9px] !text-brass-bright">Current</span>
                    )}
                  </div>
                  <div className="text-[11px] text-cream-faint">
                    {relativeTime(entry.timestamp)} · {entry.products.length} pieces · {formatPrice(total)}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col gap-1">
                  {!isCurrent && (
                    <button
                      onClick={() => onRestore(entry)}
                      className="flex items-center gap-1 rounded-full border border-ink-line px-2.5 py-1 text-[10px] font-semibold text-cream-dim transition hover:border-brass/50 hover:text-brass-bright"
                    >
                      <RotateCcw size={10} /> Restore
                    </button>
                  )}
                  <button
                    onClick={() => onSave(entry)}
                    className="flex items-center gap-1 rounded-full border border-ink-line px-2.5 py-1 text-[10px] font-semibold text-cream-dim transition hover:border-brass/50 hover:text-brass-bright"
                  >
                    <Layers size={10} /> Save
                  </button>
                </div>
              </li>
            );
          })}
        </ul>

        <div className="border-t border-ink-line p-4 text-[11px] leading-relaxed text-cream-faint">
          Every swap, colorway, budget change and AI edit is captured automatically — nothing is ever lost. Restoring creates a new entry, so you can always come back.
        </div>
      </aside>
    </div>,
    document.body,
  );
}
