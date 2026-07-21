"use client";

import { ShoppingBag } from "lucide-react";
import { formatPrice } from "@/lib/products";
import { useMaisonStore } from "@/lib/store";
import RoomHotspots, { type HotspotItem } from "@/components/RoomHotspots";
import type { FinishedRoom } from "@/lib/finishedRooms";

export default function LookDetail({ room }: { room: FinishedRoom }) {
  const addToCart = useMaisonStore((s) => s.addToCart);
  const addManyToCart = useMaisonStore((s) => s.addManyToCart);

  const hotspots: HotspotItem[] = room.items
    .filter((item) => item.box)
    .map((item) => ({
      id: item.product.id,
      name: item.product.name,
      price: item.product.price,
      box: item.box!,
      autoMatched: item.autoMatched,
    }));

  function addById(id: string) {
    const item = room.items.find((i) => i.product.id === id);
    if (item) addToCart(item.product);
  }

  return (
    <div className="container-page py-14">
      <div className="grid gap-10 lg:grid-cols-[1.3fr_1fr]">
        <div>
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`data:image/png;base64,${room.heroImageBase64}`}
              alt={room.title}
              className="w-full rounded-2xl border border-ink-line"
            />
            <RoomHotspots items={hotspots} onAction={addById} actionLabel="Add to cart" />
          </div>
          {hotspots.length > 0 && (
            <p className="mt-2 text-[10px] text-cream-faint">Click any highlighted piece to view or add it.</p>
          )}
        </div>

        <div>
          <div className="eyebrow mb-3">Complete Room</div>
          <h1 className="font-display text-3xl leading-tight sm:text-4xl">{room.title}</h1>
          {room.description && <p className="mt-4 text-cream-dim">{room.description}</p>}

          {room.styleTags.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {room.styleTags.map((tag) => (
                <span key={tag} className="chip">
                  {tag}
                </span>
              ))}
            </div>
          )}

          <div className="mt-6 rounded-xl border border-brass/30 bg-brass/5 p-5">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-cream-dim">Whole look</span>
              <span className="font-display text-2xl text-brass-bright">{formatPrice(room.totalPrice)}</span>
            </div>
            <button
              onClick={() => addManyToCart(room.products)}
              disabled={room.products.length === 0}
              className="btn-primary mt-4 w-full justify-center disabled:opacity-40"
            >
              <ShoppingBag size={15} />
              Add all {room.products.length} pieces to cart
            </button>
          </div>

          <div className="mt-8 space-y-3">
            <h2 className="text-sm font-semibold text-cream-dim">In this room</h2>
            {room.products.map((product) => (
              <div key={product.id} className="flex items-center gap-3 rounded-xl border border-ink-line bg-ink-panel p-3">
                {product.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={product.imageUrl} alt={product.name} className="h-14 w-14 rounded-lg object-cover" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{product.name}</div>
                  <div className="text-xs text-cream-faint">{formatPrice(product.price)}</div>
                </div>
                <button
                  onClick={() => addToCart(product)}
                  className="rounded-full border border-ink-line px-3 py-1.5 text-xs font-semibold text-cream-dim transition hover:border-brass/50 hover:text-brass-bright"
                >
                  Add
                </button>
              </div>
            ))}
            {room.products.length === 0 && (
              <p className="text-sm text-cream-faint">
                The products originally in this look are no longer available in the catalog.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
