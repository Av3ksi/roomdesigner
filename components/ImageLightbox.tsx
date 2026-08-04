"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

/**
 * Click-to-zoom wrapper around an <img> — same fixed-overlay modal pattern
 * as UpgradeModal.tsx for visual consistency. Renders as a Fragment (no
 * extra wrapping div) so it drops into a `position: relative` parent
 * exactly like the plain <img> it replaces — important on pages like
 * LookDetail/Designer where RoomHotspots' pins are absolutely positioned
 * siblings relying on that same parent for their percentage coordinates.
 */
export default function ImageLightbox({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className={`cursor-zoom-in ${className ?? ""}`} onClick={() => setOpen(true)} />

      {open && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 sm:p-10">
          <button aria-label="Close" className="absolute inset-0 cursor-zoom-out bg-black/85 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <button
            onClick={() => setOpen(false)}
            className="absolute right-4 top-4 rounded-full border border-ink-line bg-ink/80 p-2 text-cream-dim transition hover:text-cream"
            aria-label="Close"
          >
            <X size={18} />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={alt} className="relative max-h-full max-w-full rounded-lg object-contain shadow-2xl" />
        </div>
      )}
    </>
  );
}
