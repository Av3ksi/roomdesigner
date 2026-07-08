"use client";

import { Moon, Plus, ShoppingBag, Sun, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ProductGlyph from "@/components/room/ProductGlyph";
import RoomScene from "@/components/room/RoomScene";
import { formatPrice } from "@/lib/products";
import { useMaisonStore } from "@/lib/store";
import type { Product, ProductCategory, RoomStyleSpec } from "@/lib/types";

interface ExploreModeProps {
  spec: RoomStyleSpec;
  variant: number;
  styleName: string;
  products: Product[];
  onClose: () => void;
}

/**
 * Hotspot anchors in scene coordinates (% of the 1200×800 render). Each maps
 * a drawn object to the concept product of the same category, making every
 * visible piece in the room directly shoppable.
 */
const SPOTS: {
  category: ProductCategory;
  x: number;
  y: number;
  show?: (variant: number, spec: RoomStyleSpec) => boolean;
}[] = [
  { category: "sofa", x: 59, y: 70 },
  { category: "textile", x: 43.5, y: 64 },
  { category: "table", x: 44, y: 88 },
  { category: "decor", x: 55, y: 84 },
  { category: "rug", x: 27, y: 90 },
  { category: "lighting", x: 80, y: 51 },
  { category: "art", x: 50, y: 34, show: (_v, s) => s.art !== "none" },
  { category: "plant", x: 22, y: 79, show: (_v, s) => s.plant },
  { category: "storage", x: 65, y: 63, show: (v) => v > 0 },
];

export default function ExploreMode({
  spec,
  variant,
  styleName,
  products,
  onClose,
}: ExploreModeProps) {
  const [tilt, setTilt] = useState({ rx: 0, ry: 0 });
  const [night, setNight] = useState(false);
  const [activeSpot, setActiveSpot] = useState<ProductCategory | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const addToCart = useMaisonStore((s) => s.addToCart);
  const addManyToCart = useMaisonStore((s) => s.addManyToCart);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const displaySpec: RoomStyleSpec = night
    ? {
        ...spec,
        windowLight: "#39415A",
        wall: spec.wall,
        warmth: Math.min(1, spec.warmth + 0.5),
      }
    : spec;

  const onPointerMove = (e: React.PointerEvent) => {
    const el = frameRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const nx = ((e.clientX - r.left) / r.width) * 2 - 1; // -1..1
    const ny = ((e.clientY - r.top) / r.height) * 2 - 1;
    setTilt({ ry: nx * 5, rx: -ny * 3.5 });
  };

  const spotProducts = SPOTS.map((s) => ({
    ...s,
    product: products.find((p) => p.category === s.category),
  })).filter(
    (s): s is (typeof SPOTS)[number] & { product: Product } =>
      Boolean(s.product) && (s.show ? s.show(variant, spec) : true),
  );

  const active = spotProducts.find((s) => s.category === activeSpot);
  const total = products.reduce((n, p) => n + p.price, 0);

  // Portal to <body>: ancestors carry transforms (entry animations) which
  // would otherwise become the containing block for this fixed overlay.
  return createPortal(
    <div className="fixed inset-0 z-[60] flex flex-col bg-ink">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-ink-line/70 px-5 py-3.5">
        <div>
          <div className="eyebrow">Interactive room · {styleName}</div>
          <div className="text-xs text-cream-faint">
            Move to look around · tap a dot to shop the piece · {night ? "evening" : "daylight"} lighting
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setNight(!night)}
            className="btn-ghost !px-3.5 !py-2 text-xs"
            aria-label="Toggle lighting"
          >
            {night ? <Sun size={14} /> : <Moon size={14} />}
            {night ? "Daylight" : "Evening"}
          </button>
          <button
            onClick={onClose}
            className="rounded-full border border-ink-line p-2.5 text-cream-dim transition hover:border-brass/50 hover:text-cream"
            aria-label="Exit exploration"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Scene */}
      <div
        ref={frameRef}
        className="relative flex flex-1 items-center justify-center overflow-hidden"
        onPointerMove={onPointerMove}
        onPointerLeave={() => setTilt({ rx: 0, ry: 0 })}
        style={{ perspective: "1400px" }}
      >
        <div
          className="relative aspect-[3/2] max-h-full max-w-full"
          style={{
            height: "min(100%, 76vh)",
            transform: `rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg) scale(1.08)`,
            transition: "transform 0.18s ease-out",
            transformStyle: "preserve-3d",
          }}
        >
          <RoomScene spec={displaySpec} variant={variant} className="h-full w-full" />
          {night && (
            <div className="pointer-events-none absolute inset-0 bg-[#0B1020]/35 mix-blend-multiply" />
          )}

          {/* Hotspots */}
          {spotProducts.map((s) => (
            <button
              key={s.category}
              onClick={() =>
                setActiveSpot(activeSpot === s.category ? null : s.category)
              }
              className="group absolute z-10 -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${s.x}%`, top: `${s.y}%` }}
              aria-label={`Shop ${s.product.name}`}
            >
              <span
                className={`block h-5 w-5 rounded-full border-2 transition ${
                  activeSpot === s.category
                    ? "scale-125 border-ink bg-brass"
                    : "border-cream/90 bg-ink/60 backdrop-blur group-hover:scale-125 group-hover:bg-brass/80"
                }`}
              />
              <span className="absolute inset-0 -z-10 animate-ping rounded-full bg-brass/40 group-hover:animate-none" />
            </button>
          ))}

          {/* Product popover */}
          {active && (
            <div
              className="absolute z-20 w-64 animate-fade-in"
              style={{
                left: `${Math.min(82, Math.max(18, active.x))}%`,
                top: `${active.y}%`,
                transform: active.y < 42 ? "translate(-50%, 26px)" : "translate(-50%, calc(-100% - 22px))",
              }}
            >
              <div className="card overflow-hidden border-brass/40 bg-ink-soft/95 shadow-2xl backdrop-blur">
                <div className="flex gap-3 p-3">
                  <div className="h-16 w-20 shrink-0 overflow-hidden rounded-md">
                    <ProductGlyph product={active.product} className="h-full w-full" />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{active.product.name}</div>
                    <div className="text-xs text-cream-faint">
                      {active.product.brand} · ★ {active.product.rating}
                    </div>
                    <div className="mt-1 text-sm font-semibold text-brass-bright">
                      {formatPrice(active.product.price)}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => {
                    addToCart(active.product);
                    setActiveSpot(null);
                  }}
                  className="flex w-full items-center justify-center gap-2 border-t border-ink-line bg-brass/10 py-2.5 text-xs font-semibold text-brass-bright transition hover:bg-brass hover:text-ink"
                >
                  <Plus size={13} /> Add to room list
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-line/70 px-5 py-3.5">
        <div className="text-sm text-cream-dim">
          <span className="font-semibold text-cream">{products.length} pieces</span> in this
          room · complete for{" "}
          <span className="font-semibold text-brass-bright">{formatPrice(total)}</span>
        </div>
        <button onClick={() => addManyToCart(products)} className="btn-primary !py-2.5">
          <ShoppingBag size={15} /> Buy the complete room
        </button>
      </div>
    </div>,
    document.body,
  );
}
