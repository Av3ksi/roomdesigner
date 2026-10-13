"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Globe, Loader2, Lock } from "lucide-react";
import { formatPrice } from "@/lib/products";
import type { FinishedRoom } from "@/lib/finishedRooms";

/**
 * Private-by-default counterpart to Complete Rooms — every room this
 * browser (or account, once signed in) has saved via Designer's "Save to my
 * collection," published or not. Anyone can view this page (no login), but
 * flipping a room public requires signing in — see /api/finished-rooms/[id]/publish.
 */
export default function MyRooms() {
  const [rooms, setRooms] = useState<FinishedRoom[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/my-rooms")
      .then((res) => res.json())
      .then((body) => setRooms(Array.isArray(body.rooms) ? body.rooms : []))
      .catch(() => setRooms([]));
  }, []);

  async function togglePublish(room: FinishedRoom) {
    setError(null);
    setBusyId(room.id);
    try {
      const res = await fetch(`/api/finished-rooms/${room.id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ published: !room.published }),
      });
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `Request failed: ${res.status}`);
      setRooms((prev) => prev?.map((r) => (r.id === room.id ? { ...r, published: !room.published } : r)) ?? prev);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="container-page py-14">
      <div className="max-w-2xl">
        <div className="eyebrow mb-3">My Collection</div>
        <h1 className="font-display text-4xl leading-tight sm:text-5xl">Rooms you&apos;ve saved.</h1>
        <p className="mt-4 text-cream-dim">
          Private by default — save any room straight from the Designer. Publish one when you&apos;re ready
          to share it on <span className="text-cream">Complete Rooms</span>, buyable by anyone.
        </p>
      </div>

      {error && <p className="mt-4 text-sm text-rose-300">{error}</p>}

      {rooms === null ? (
        <div className="mt-10 flex items-center gap-2 text-sm text-cream-faint">
          <Loader2 size={14} className="animate-spin" /> Loading…
        </div>
      ) : rooms.length === 0 ? (
        <div className="mt-10 rounded-xl border border-ink-line bg-ink-panel p-8 text-sm text-cream-faint">
          Nothing saved yet. Build a room in the{" "}
          <Link href="/designer" className="text-brass-bright hover:underline">
            Designer
          </Link>{" "}
          and save it here.
        </div>
      ) : (
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {rooms.map((room) => (
            <div key={room.id} className="card overflow-hidden p-0">
              <Link href={`/looks/${room.id}`} className="relative block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`data:image/png;base64,${room.heroImageBase64}`}
                  alt={room.title}
                  className="aspect-[4/3] w-full object-cover"
                />
                <span
                  className={`absolute left-3 top-3 flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider backdrop-blur-sm ${
                    room.published ? "bg-brass/90 text-ink" : "bg-ink/80 text-cream-dim"
                  }`}
                >
                  {room.published ? <Globe size={11} /> : <Lock size={11} />}
                  {room.published ? "Published" : "Private"}
                </span>
              </Link>
              <div className="p-5">
                <h2 className="font-display text-xl">{room.title}</h2>
                <div className="mt-4 flex items-center justify-between gap-3">
                  <span className="text-xs text-cream-faint">{room.products.length + room.externals.length} pieces</span>
                  <span className="font-display text-lg text-brass-bright">{formatPrice(room.totalPrice)}</span>
                </div>
                <button
                  onClick={() => togglePublish(room)}
                  disabled={busyId === room.id}
                  className="btn-ghost mt-4 w-full justify-center !text-xs disabled:opacity-50"
                >
                  {busyId === room.id ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : room.published ? (
                    "Unpublish"
                  ) : (
                    "Publish to Complete Rooms"
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
