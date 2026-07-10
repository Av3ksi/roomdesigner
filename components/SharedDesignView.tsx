"use client";

import { Check, Heart, Layers, Link2, Orbit, ShoppingBag } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import PricingPanel from "@/components/PricingPanel";
import ProductDetailPanel from "@/components/ProductDetailPanel";
import ProductGlyph from "@/components/room/ProductGlyph";
import RoomScene from "@/components/room/RoomScene";
import Immersive3D from "@/components/studio/Immersive3D";
import { formatPrice } from "@/lib/products";
import { SAMPLE_ROOMS } from "@/lib/rooms";
import { decodeSnapshot, shareUrlFor } from "@/lib/share";
import { useMaisonStore } from "@/lib/store";
import type { Product } from "@/lib/types";

export default function SharedDesignView() {
  const params = useSearchParams();
  const router = useRouter();
  const encoded = params.get("d");
  const snapshot = useMemo(() => (encoded ? decodeSnapshot(encoded) : null), [encoded]);

  const addManyToCart = useMaisonStore((s) => s.addManyToCart);
  const addToCart = useMaisonStore((s) => s.addToCart);
  const toggleWishlist = useMaisonStore((s) => s.toggleWishlist);
  const isWishlisted = useMaisonStore((s) => s.isWishlisted);
  const saveDesign = useMaisonStore((s) => s.saveDesign);

  const [products, setProducts] = useState<Product[]>(snapshot?.products ?? []);
  const [exploring, setExploring] = useState(false);
  const [detailProduct, setDetailProduct] = useState<Product | null>(null);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);

  const replaceProduct = (product: Product) => {
    setProducts((prev) => {
      const idx = prev.findIndex((p) => p.category === product.category);
      if (idx === -1) return [...prev, product];
      const next = [...prev];
      next[idx] = product;
      return next;
    });
  };

  if (!snapshot) {
    return (
      <div className="container-page py-20 text-center">
        <div className="eyebrow mb-3">Shared design</div>
        <h1 className="font-display text-3xl">This link looks broken.</h1>
        <p className="mt-3 text-cream-dim">
          The share link is missing or malformed — ask for a fresh one.
        </p>
        <Link href="/studio" className="btn-primary mt-6 inline-flex">
          Design your own room
        </Link>
      </div>
    );
  }

  const total = products.reduce((n, p) => n + p.price, 0);

  const handleShare = async () => {
    const url = shareUrlFor({ ...snapshot, products });
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  const handleSave = () => {
    saveDesign({
      name: snapshot.name,
      styleId: snapshot.styleId,
      styleName: snapshot.styleName,
      variant: snapshot.variant,
      spec: snapshot.spec,
      products,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2200);
  };

  return (
    <div className="container-page py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow mb-2">Shared design · {snapshot.styleName}</div>
          <h1 className="font-display text-3xl sm:text-4xl">{snapshot.name}</h1>
        </div>
        <div className="flex gap-2">
          <button onClick={handleSave} className="btn-ghost !px-4 !py-2 text-xs">
            {saved ? <Check size={13} /> : <Layers size={13} />} {saved ? "Saved!" : "Save to my designs"}
          </button>
          <button onClick={() => void handleShare()} className="btn-ghost !px-4 !py-2 text-xs">
            <Link2 size={13} /> {copied ? "Link copied!" : "Copy link"}
          </button>
        </div>
      </div>

      <div className="mt-6 grid gap-8 lg:grid-cols-[1.5fr_1fr]">
        <div>
          <div className="aspect-[3/2] overflow-hidden rounded-2xl border border-ink-line">
            <RoomScene spec={snapshot.spec} variant={snapshot.variant} className="h-full w-full" />
          </div>
          <button onClick={() => setExploring(true)} className="btn-primary mt-4 w-full">
            <Orbit size={16} /> Enter this room — live 3D before & after
          </button>
        </div>

        <div>
          <PricingPanel
            products={products}
            onBuyComplete={() => {
              addManyToCart(products);
              router.push("/checkout");
            }}
            onCustomize={() => {}}
          />

          <div className="card mt-4 overflow-hidden">
            <div className="border-b border-ink-line px-5 py-4">
              <div className="font-semibold">Shop this look</div>
              <div className="text-xs text-cream-faint">{products.length} pieces — click any piece for full details</div>
            </div>
            <ul className="max-h-[380px] divide-y divide-ink-line/60 overflow-y-auto">
              {products.map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                  <button
                    onClick={() => setDetailProduct(p)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >
                    <div className="h-14 w-[70px] shrink-0 overflow-hidden rounded-md">
                      <ProductGlyph product={p} className="h-full w-full" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{p.name}</div>
                      <div className="text-xs text-cream-faint">
                        {p.brand} · ★ {p.rating}
                      </div>
                    </div>
                  </button>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-sm font-semibold">{formatPrice(p.price)}</span>
                    <button
                      onClick={() => toggleWishlist(p)}
                      className={`transition ${isWishlisted(p.id) ? "text-red-400" : "text-cream-faint hover:text-red-400"}`}
                      aria-label={isWishlisted(p.id) ? "Remove from wishlist" : "Add to wishlist"}
                    >
                      <Heart size={13} className={isWishlisted(p.id) ? "fill-current" : ""} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            <div className="border-t border-ink-line p-4">
              <button onClick={() => addManyToCart(products)} className="btn-primary w-full">
                <ShoppingBag size={15} /> Add the look · {formatPrice(total)}
              </button>
            </div>
          </div>
        </div>
      </div>

      {exploring && (
        <Immersive3D
          beforeSpec={SAMPLE_ROOMS[0].spec}
          afterSpec={snapshot.spec}
          variant={snapshot.variant}
          styleId={snapshot.styleId}
          styleName={snapshot.styleName}
          beforeLabel="A typical room"
          products={products}
          onReplaceProduct={replaceProduct}
          onAddProduct={addToCart}
          onBuyAll={() => addManyToCart(products)}
          onClose={() => setExploring(false)}
        />
      )}

      {detailProduct && (
        <ProductDetailPanel
          product={detailProduct}
          styleId={snapshot.styleId}
          onClose={() => setDetailProduct(null)}
          onReplace={(product) => {
            replaceProduct(product);
            setDetailProduct(null);
          }}
        />
      )}
    </div>
  );
}
