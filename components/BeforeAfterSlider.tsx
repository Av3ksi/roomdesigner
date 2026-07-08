"use client";

import { MoveHorizontal } from "lucide-react";
import { useCallback, useRef, useState } from "react";

interface Props {
  before: React.ReactNode;
  after: React.ReactNode;
  beforeLabel?: string;
  afterLabel?: string;
  className?: string;
  initial?: number;
}

/** Draggable before/after comparison. Both children fill the frame. */
export default function BeforeAfterSlider({
  before,
  after,
  beforeLabel = "Before",
  afterLabel = "After",
  className = "",
  initial = 52,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(initial);
  const dragging = useRef(false);

  const update = useCallback((clientX: number) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setPos(Math.max(4, Math.min(96, pct)));
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    dragging.current = true;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    update(e.clientX);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (dragging.current) update(e.clientX);
  };
  const onPointerUp = () => {
    dragging.current = false;
  };

  return (
    <div
      ref={ref}
      className={`relative select-none overflow-hidden rounded-2xl border border-ink-line ${className}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      style={{ touchAction: "none", cursor: "ew-resize" }}
    >
      {/* After fills the frame */}
      <div className="absolute inset-0">{after}</div>
      {/* Before clipped to the left of the divider */}
      <div
        className="absolute inset-0 overflow-hidden"
        style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
      >
        {before}
      </div>

      {/* Divider */}
      <div
        className="absolute bottom-0 top-0 z-10 w-0.5 bg-cream/90"
        style={{ left: `${pos}%` }}
      >
        <div className="absolute left-1/2 top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-cream/40 bg-ink/85 text-cream shadow-lg backdrop-blur">
          <MoveHorizontal size={16} />
        </div>
      </div>

      <span className="pointer-events-none absolute left-3 top-3 z-10 rounded-full bg-ink/75 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-cream backdrop-blur">
        {beforeLabel}
      </span>
      <span className="pointer-events-none absolute right-3 top-3 z-10 rounded-full bg-brass/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-ink backdrop-blur">
        {afterLabel}
      </span>
    </div>
  );
}
