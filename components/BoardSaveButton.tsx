"use client";

import { Check, LayoutGrid, Plus } from "lucide-react";
import { useState } from "react";
import { useMaisonStore } from "@/lib/store";
import type { Product } from "@/lib/types";

/** Popover button that saves a product into one or more named inspiration boards. */
export default function BoardSaveButton({ product }: { product: Product }) {
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const boards = useMaisonStore((s) => s.boards);
  const addToBoard = useMaisonStore((s) => s.addToBoard);
  const removeFromBoard = useMaisonStore((s) => s.removeFromBoard);
  const createBoard = useMaisonStore((s) => s.createBoard);

  const inAnyBoard = boards.some((b) => b.products.some((p) => p.id === product.id));

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`rounded-full border p-2.5 transition ${
          inAnyBoard ? "border-brass/50 bg-brass/10 text-brass-bright" : "border-ink-line text-cream-dim hover:border-brass/40 hover:text-brass-bright"
        }`}
        aria-label="Save to board"
      >
        <LayoutGrid size={16} />
      </button>
      {open && (
        <>
          <button className="fixed inset-0 z-10 cursor-default" onClick={() => setOpen(false)} aria-label="Close board picker" />
          <div className="absolute right-0 top-full z-20 mt-2 w-56 rounded-xl border border-ink-line bg-ink-soft p-2 shadow-2xl">
            <div className="mb-1.5 px-1.5 text-[10px] uppercase tracking-widest text-cream-faint">Save to board</div>
            <div className="max-h-40 space-y-0.5 overflow-y-auto">
              {boards.map((b) => {
                const inBoard = b.products.some((p) => p.id === product.id);
                return (
                  <button
                    key={b.id}
                    onClick={() => (inBoard ? removeFromBoard(b.id, product.id) : addToBoard(b.id, product))}
                    className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs text-cream-dim hover:bg-ink-panel"
                  >
                    <span className="truncate">{b.name}</span>
                    {inBoard && <Check size={12} className="shrink-0 text-brass" />}
                  </button>
                );
              })}
              {boards.length === 0 && (
                <div className="px-2 py-1.5 text-[11px] text-cream-faint">No boards yet — create one below.</div>
              )}
            </div>
            <form
              className="mt-1.5 flex gap-1 border-t border-ink-line pt-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                if (!newName.trim()) return;
                const board = createBoard(newName.trim());
                addToBoard(board.id, product);
                setNewName("");
              }}
            >
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="New board…"
                className="min-w-0 flex-1 rounded-lg border border-ink-line bg-ink-panel px-2 py-1.5 text-xs outline-none placeholder:text-cream-faint/60 focus:border-brass/50"
              />
              <button type="submit" disabled={!newName.trim()} className="rounded-lg bg-brass p-1.5 text-ink disabled:opacity-40">
                <Plus size={12} />
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
