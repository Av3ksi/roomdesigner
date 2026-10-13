"use client";

import {
  Check,
  Circle,
  Heart,
  Package,
  Ruler,
  ShoppingBag,
  Truck,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import BoardSaveButton from "@/components/BoardSaveButton";
import ProductGlyph from "@/components/room/ProductGlyph";
import { formatPrice, tierOf } from "@/lib/products";
import { getProductDetails, STOCK_LABEL } from "@/lib/productDetails";
import { useVistroomStore } from "@/lib/store";
import type { BudgetTier, Product } from "@/lib/types";

interface ProductDetailPanelProps {
  product: Product;
  styleId: string;
  onClose: () => void;
  /** Replace this product's slot in the active room with a different one. */
  onReplace?: (product: Product) => void;
  /** Live-recolor the product in an active 3D/2D preview without swapping SKU. */
  onRecolor?: (hex: string) => void;
}

const TIER_LABEL: Record<BudgetTier, string> = {
  essential: "Essential",
  signature: "Signature",
  luxe: "Luxe",
};

/**
 * Builds the configured variant of a product — color and/or material — as a
 * distinct SKU (own id) so cart lines, wishlist entries and room swaps stay
 * unambiguous about exactly what was chosen.
 */
function configureVariant(
  product: Product,
  colorway: { name: string; hex: string } | null,
  material: string | null,
): Product {
  const parts: string[] = [];
  if (colorway && colorway.hex !== product.color) parts.push(colorway.name);
  if (material) parts.push(material);
  if (parts.length === 0) return product;
  return {
    ...product,
    id: `${product.id}::${parts.join("::")}`,
    name: `${product.name.split(" — ")[0]} — ${parts.join(" · ")}`,
    color: colorway?.hex ?? product.color,
  };
}

function StockDot({ stock }: { stock: "in_stock" | "low_stock" | "made_to_order" }) {
  const color = stock === "in_stock" ? "text-sage" : stock === "low_stock" ? "text-brass" : "text-cream-faint";
  return <Circle size={8} className={`${color} fill-current`} />;
}

export default function ProductDetailPanel({
  product,
  styleId,
  onClose,
  onReplace,
  onRecolor,
}: ProductDetailPanelProps) {
  const [colorName, setColorName] = useState<string>(
    product.name.includes(" — ") ? product.name.split(" — ")[1] : "As shown",
  );
  // No material selector any more — the options it offered were invented.
  // Kept as a constant so configureVariant keeps its shape for a future
  // real material-variant feature.
  const material: string | null = null;
  // Only real photos, only when there's more than one — falls back to the
  // single hero shot, then to the procedural glyph, never inventing images.
  const gallery = useMemo(
    () => (product.imageUrls && product.imageUrls.length > 1 ? product.imageUrls : product.imageUrl ? [product.imageUrl] : []),
    [product.imageUrls, product.imageUrl],
  );
  const [activeImage, setActiveImage] = useState(0);
  useEffect(() => setActiveImage(0), [product.id]);
  const addToCart = useVistroomStore((s) => s.addToCart);
  const toggleWishlist = useVistroomStore((s) => s.toggleWishlist);
  const isWishlisted = useVistroomStore((s) => s.isWishlisted(product.id));

  const details = useMemo(() => getProductDetails(product), [product]);
  const myTier = tierOf(product);

  const displayProduct = useMemo(() => {
    const active = details.colorways.find((c) => c.name === colorName) ?? null;
    return configureVariant(product, active, material);
  }, [product, details.colorways, colorName, material]);

  const displayMaterials = material
    ? [material, ...details.materials.slice(1)]
    : details.materials;

  const pickColorway = (name: string, hex: string) => {
    setColorName(name);
    onRecolor?.(hex);
  };

  return createPortal(
    <div className="fixed inset-0 z-[80] flex justify-end">
      <button aria-label="Close product details" className="absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-lg animate-fade-in flex-col overflow-y-auto border-l border-ink-line bg-ink-soft shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-ink-line bg-ink-soft/95 px-5 py-4 backdrop-blur">
          <div className="min-w-0">
            <div className="truncate text-[11px] uppercase tracking-widest text-cream-faint">
              {product.brand} · sold by {details.retailer}
            </div>
          </div>
          <button onClick={onClose} className="rounded-full border border-ink-line p-2 text-cream-dim hover:text-cream" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="aspect-[5/4] shrink-0 border-b border-ink-line">
          {gallery.length > 0 ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={gallery[activeImage]} alt={displayProduct.name} className="h-full w-full object-cover" />
          ) : (
            <ProductGlyph product={displayProduct} className="h-full w-full" />
          )}
        </div>
        {gallery.length > 1 && (
          <div className="flex shrink-0 gap-2 overflow-x-auto border-b border-ink-line bg-ink-panel/40 p-3">
            {gallery.map((url, i) => (
              <button
                key={url}
                onClick={() => setActiveImage(i)}
                className={`h-14 w-14 shrink-0 overflow-hidden rounded-lg border transition ${
                  i === activeImage ? "border-brass" : "border-ink-line hover:border-brass/40"
                }`}
                aria-label={`View photo ${i + 1}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="chip !border-brass/40 !text-brass-bright">{TIER_LABEL[myTier]}</span>
              <h2 className="font-display mt-2 text-2xl leading-tight">{displayProduct.name}</h2>
            </div>
            <div className="flex shrink-0 items-start gap-2">
              <button
                onClick={() => toggleWishlist(product)}
                className={`rounded-full border p-2.5 transition ${
                  isWishlisted ? "border-red-400/50 bg-red-500/10 text-red-400" : "border-ink-line text-cream-dim hover:border-red-400/40 hover:text-red-400"
                }`}
                aria-label={isWishlisted ? "Remove from wishlist" : "Add to wishlist"}
              >
                <Heart size={16} className={isWishlisted ? "fill-current" : ""} />
              </button>
              <BoardSaveButton product={product} />
            </div>
          </div>

          <div className="mt-3 font-display text-3xl text-brass-bright">{formatPrice(product.price)}</div>

          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-cream-dim">
            <span className="flex items-center gap-1.5">
              <StockDot stock={details.stock} /> {STOCK_LABEL[details.stock]}
            </span>
            <span className="flex items-center gap-1.5">
              <Truck size={13} className="text-brass" /> Delivers in {details.deliveryDays[0]}–{details.deliveryDays[1]} days
            </span>
          </div>

          {/* Colorways — hidden when the product only comes as shown, which
              is now every feed product: a one-option picker offering the
              colour you are already looking at is noise. */}
          {details.colorways.length > 1 && (
          <div className="mt-5">
            <div className="mb-2 text-[11px] uppercase tracking-wider text-cream-faint">Available colors</div>
            <div className="flex flex-wrap gap-2">
              {details.colorways.map((c) => (
                <button
                  key={c.name}
                  onClick={() => pickColorway(c.name, c.hex)}
                  className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[11px] transition ${
                    colorName === c.name ? "border-brass text-brass-bright" : "border-ink-line text-cream-dim hover:border-brass/40"
                  }`}
                >
                  <span className="h-3.5 w-3.5 rounded-full border border-black/40" style={{ background: c.hex }} />
                  {c.name}
                </button>
              ))}
            </div>
          </div>
          )}

          {/* Dimensions */}
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="card p-3.5">
              <div className="mb-1.5 flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-cream-faint">
                <Ruler size={12} className="text-brass" /> Dimensions
              </div>
              {details.dimensions ? (
                <>
                  <div className="text-sm">
                    {details.dimensions.w} × {details.dimensions.d} × {details.dimensions.h} cm
                  </div>
                  <div className="text-[10px] text-cream-faint">W × D × H</div>
                </>
              ) : (
                <>
                  <div className="text-sm text-cream-dim">Not specified</div>
                  <div className="text-[10px] text-cream-faint">Supplier hasn&apos;t provided measurements</div>
                </>
              )}
            </div>
            <div className="card p-3.5">
              <div className="mb-1.5 flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-cream-faint">
                <Package size={12} className="text-brass" /> Materials
              </div>
              <div className="text-sm leading-snug">{displayMaterials.join(", ")}</div>
            </div>
          </div>

          <p className="mt-4 text-sm leading-relaxed text-cream-dim">{product.blurb}</p>

        </div>

        <div className="sticky bottom-0 flex gap-2 border-t border-ink-line bg-ink-soft/95 p-4 backdrop-blur">
          {onReplace && (
            <button
              onClick={() => {
                onReplace(displayProduct);
                onClose();
              }}
              className="btn-ghost flex-1 !py-2.5 text-xs"
            >
              <Check size={14} /> Replace in room
            </button>
          )}
          <button onClick={() => addToCart(displayProduct)} className="btn-primary flex-1 !py-2.5 text-xs">
            <ShoppingBag size={14} /> Add to cart
          </button>
        </div>
      </aside>
    </div>,
    document.body,
  );
}
