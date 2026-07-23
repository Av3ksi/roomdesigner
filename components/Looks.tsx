"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { formatPrice } from "@/lib/products";
import type { FinishedRoom } from "@/lib/finishedRooms";

/**
 * The IKEA-showroom model: curated, fixed room bundles (scripts/compose-
 * finished-room.ts) rather than the Designer chat's build-your-own-room.
 * Read-only browsing — the money action (add all to cart) lives on the
 * detail page, same "look, then commit" shape as the rest of the site.
 */
export default function Looks({ rooms }: { rooms: FinishedRoom[] }) {
  return (
    <div className="container-page py-14">
      <div className="max-w-2xl">
        <div className="eyebrow mb-3">Complete Rooms</div>
        <h1 className="font-display text-4xl leading-tight sm:text-5xl">Shop the whole look.</h1>
        <p className="mt-4 text-cream-dim">
          Real rooms, styled with real products, photographed once — pick a look you love and add
          every piece to your cart in one click.
        </p>
      </div>

      {rooms.length === 0 ? (
        <div className="mt-10 rounded-xl border border-ink-line bg-ink-panel p-8 text-sm text-cream-faint">
          No complete rooms published yet.
        </div>
      ) : (
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {rooms.map((room) => (
            <Link
              key={room.id}
              href={`/looks/${room.id}`}
              className="card group overflow-hidden p-0 transition hover:border-brass/40"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`data:image/png;base64,${room.heroImageBase64}`}
                alt={room.title}
                className="aspect-[4/3] w-full object-cover"
              />
              <div className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-display text-xl">{room.title}</h2>
                  <ArrowUpRight size={16} className="mt-1 shrink-0 text-brass opacity-0 transition group-hover:opacity-100" />
                </div>
                {room.description && (
                  <p className="mt-1.5 line-clamp-2 text-sm text-cream-dim">{room.description}</p>
                )}
                <div className="mt-4 flex items-center justify-between">
                  <span className="text-xs text-cream-faint">{room.products.length} pieces</span>
                  <span className="font-display text-lg text-brass-bright">{formatPrice(room.totalPrice)}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
