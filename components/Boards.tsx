"use client";

import { ArrowLeft, LayoutGrid, Pencil, Plus, ShoppingBag, Trash2, X } from "lucide-react";
import { useState } from "react";
import ProductGlyph from "@/components/room/ProductGlyph";
import { formatPrice } from "@/lib/products";
import { useMaisonStore } from "@/lib/store";

export default function Boards() {
  const boards = useMaisonStore((s) => s.boards);
  const createBoard = useMaisonStore((s) => s.createBoard);
  const deleteBoard = useMaisonStore((s) => s.deleteBoard);
  const renameBoard = useMaisonStore((s) => s.renameBoard);
  const removeFromBoard = useMaisonStore((s) => s.removeFromBoard);
  const addManyToCart = useMaisonStore((s) => s.addManyToCart);
  const [openId, setOpenId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");

  const openBoard = boards.find((b) => b.id === openId) ?? null;

  if (openBoard) {
    const total = openBoard.products.reduce((n, p) => n + p.price, 0);
    return (
      <div className="container-page py-14">
        <button onClick={() => setOpenId(null)} className="btn-ghost !px-4 !py-2 text-xs">
          <ArrowLeft size={13} /> All boards
        </button>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="eyebrow mb-2">Inspiration board</div>
            <h1 className="font-display text-3xl sm:text-4xl">{openBoard.name}</h1>
            <p className="mt-2 text-sm text-cream-faint">
              {openBoard.products.length} piece{openBoard.products.length === 1 ? "" : "s"} · {formatPrice(total)} combined
            </p>
          </div>
          {openBoard.products.length > 0 && (
            <button onClick={() => addManyToCart(openBoard.products)} className="btn-primary">
              <ShoppingBag size={15} /> Add all to room list
            </button>
          )}
        </div>

        {openBoard.products.length === 0 ? (
          <div className="card mt-8 flex flex-col items-center gap-2 p-14 text-center">
            <LayoutGrid size={22} className="text-brass" />
            <div className="text-sm text-cream-dim">Nothing saved here yet — save a product from any product page.</div>
          </div>
        ) : (
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {openBoard.products.map((p) => (
              <div key={p.id} className="card group overflow-hidden">
                <div className="relative aspect-[5/4] overflow-hidden">
                  <ProductGlyph product={p} className="h-full w-full" />
                  <button
                    onClick={() => removeFromBoard(openBoard.id, p.id)}
                    className="absolute right-2.5 top-2.5 rounded-full border border-ink-line bg-ink/80 p-1.5 text-cream-dim opacity-0 backdrop-blur transition group-hover:opacity-100 hover:text-red-400"
                    aria-label={`Remove ${p.name} from board`}
                  >
                    <X size={12} />
                  </button>
                </div>
                <div className="p-3.5">
                  <div className="truncate text-sm font-medium">{p.name}</div>
                  <div className="mt-0.5 text-xs text-brass-bright">{formatPrice(p.price)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="container-page py-14">
      <div className="max-w-2xl">
        <div className="eyebrow mb-3">Inspiration boards</div>
        <h1 className="font-display text-4xl leading-tight sm:text-5xl">
          Collect ideas before you commit.
        </h1>
        <p className="mt-4 text-cream-dim">
          Group products across styles and rooms into named boards — a
          moodboard for the whole house, or one per room.
        </p>
      </div>

      <form
        className="card mt-8 flex gap-2 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!newName.trim()) return;
          createBoard(newName.trim());
          setNewName("");
        }}
      >
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Name a new board — e.g. Guest room"
          className="min-w-0 flex-1 rounded-full border border-ink-line bg-ink-soft px-4 py-2 text-sm outline-none placeholder:text-cream-faint/60 focus:border-brass/50"
        />
        <button type="submit" disabled={!newName.trim()} className="btn-primary shrink-0 !px-5 !py-2 text-xs disabled:opacity-40">
          <Plus size={13} /> Create
        </button>
      </form>

      {boards.length === 0 ? (
        <div className="card mt-6 flex flex-col items-center gap-2 p-14 text-center">
          <LayoutGrid size={22} className="text-brass" />
          <div className="text-sm text-cream-dim">No boards yet — create your first one above.</div>
        </div>
      ) : (
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {boards.map((b) => (
            <div key={b.id} className="card overflow-hidden">
              <button onClick={() => setOpenId(b.id)} className="block w-full text-left">
                <div className="grid aspect-[3/2] grid-cols-2 gap-0.5 overflow-hidden bg-ink-panel">
                  {b.products.slice(0, 4).map((p) => (
                    <ProductGlyph key={p.id} product={p} className="h-full w-full" />
                  ))}
                  {b.products.length === 0 && (
                    <div className="col-span-2 flex items-center justify-center text-cream-faint">
                      <LayoutGrid size={22} />
                    </div>
                  )}
                </div>
              </button>
              <div className="flex items-center justify-between p-3.5">
                <div className="min-w-0">
                  <button
                    onClick={() => {
                      const next = prompt("Rename board", b.name);
                      if (next && next.trim()) renameBoard(b.id, next.trim());
                    }}
                    className="flex items-center gap-1.5 truncate text-left text-sm font-semibold hover:text-brass-bright"
                  >
                    <span className="truncate">{b.name}</span>
                    <Pencil size={11} className="shrink-0 text-cream-faint" />
                  </button>
                  <div className="text-[11px] text-cream-faint">{b.products.length} piece{b.products.length === 1 ? "" : "s"}</div>
                </div>
                <button
                  onClick={() => {
                    if (confirm(`Delete "${b.name}"?`)) deleteBoard(b.id);
                  }}
                  className="shrink-0 rounded-full border border-ink-line p-2 text-cream-faint transition hover:border-red-400/40 hover:text-red-400"
                  aria-label="Delete board"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
