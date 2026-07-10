"use client";

import { Heart, ShoppingBag, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import ProductDetailPanel from "@/components/ProductDetailPanel";
import ProductGlyph from "@/components/room/ProductGlyph";
import { formatPrice } from "@/lib/products";
import { useMaisonStore } from "@/lib/store";
import type { Product } from "@/lib/types";

export default function Wishlist() {
  const wishlist = useMaisonStore((s) => s.wishlist);
  const toggleWishlist = useMaisonStore((s) => s.toggleWishlist);
  const addManyToCart = useMaisonStore((s) => s.addManyToCart);
  const [detailProduct, setDetailProduct] = useState<Product | null>(null);

  const total = wishlist.reduce((n, p) => n + p.price, 0);

  return (
    <div className="container-page py-14">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <div className="eyebrow mb-3">Your wishlist</div>
          <h1 className="font-display text-4xl leading-tight sm:text-5xl">
            Pieces you keep coming back to.
          </h1>
          <p className="mt-4 text-cream-dim">
            Saved from the Studio, the 3D room and the Marketplace — ready
            whenever you are.
          </p>
        </div>
        {wishlist.length > 0 && (
          <button
            onClick={() => addManyToCart(wishlist)}
            className="btn-primary shrink-0"
          >
            <ShoppingBag size={15} /> Add all to room list · {formatPrice(total)}
          </button>
        )}
      </div>

      {wishlist.length === 0 ? (
        <div className="card mt-10 flex flex-col items-center gap-3 p-14 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full border border-brass/40 bg-brass/10 text-brass">
            <Heart size={22} />
          </span>
          <div className="text-lg font-semibold">Your wishlist is empty</div>
          <p className="max-w-sm text-sm text-cream-dim">
            Tap the heart on any product in the Studio, the immersive room, or
            the Marketplace to save it here.
          </p>
          <Link href="/marketplace" className="btn-primary mt-2">
            Browse the marketplace
          </Link>
        </div>
      ) : (
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {wishlist.map((p) => (
            <div key={p.id} className="card group overflow-hidden transition hover:border-brass/50">
              <div
                role="button"
                tabIndex={0}
                onClick={() => setDetailProduct(p)}
                onKeyDown={(e) => e.key === "Enter" && setDetailProduct(p)}
                className="relative block aspect-[5/4] w-full cursor-pointer overflow-hidden"
              >
                <ProductGlyph product={p} className="h-full w-full transition duration-500 group-hover:scale-105" />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleWishlist(p);
                  }}
                  aria-label={`Remove ${p.name} from wishlist`}
                  className="absolute right-2.5 top-2.5 rounded-full border border-red-400/50 bg-ink/80 p-2 text-red-400 backdrop-blur transition hover:bg-red-500/20"
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="p-4">
                <div className="truncate font-semibold">{p.name}</div>
                <div className="text-xs text-cream-faint">{p.brand}</div>
                <div className="mt-2 font-semibold text-brass-bright">{formatPrice(p.price)}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {detailProduct && (
        <ProductDetailPanel
          product={detailProduct}
          styleId={detailProduct.styles[0] ?? "scandinavian"}
          onClose={() => setDetailProduct(null)}
        />
      )}
    </div>
  );
}
