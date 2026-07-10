"use client";

import { Check, Columns3, ExternalLink, Layers, Link2, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import RoomScene from "@/components/room/RoomScene";
import { encodeSnapshot, shareUrlFor } from "@/lib/share";
import { formatPrice, pricingBreakdown } from "@/lib/products";
import { useMaisonStore } from "@/lib/store";
import type { RoomSnapshot } from "@/lib/types";

function DesignCard({
  design,
  compareMode,
  selected,
  onToggleSelect,
}: {
  design: RoomSnapshot;
  compareMode: boolean;
  selected: boolean;
  onToggleSelect: () => void;
}) {
  const removeDesign = useMaisonStore((s) => s.removeDesign);
  const renameDesign = useMaisonStore((s) => s.renameDesign);
  const [copied, setCopied] = useState(false);
  const total = pricingBreakdown(design.products).total;

  const share = async () => {
    const url = shareUrlFor(design);
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className={`card group overflow-hidden transition ${
        compareMode && selected ? "border-brass" : "hover:border-brass/50"
      }`}
    >
      <div
        role={compareMode ? "button" : undefined}
        tabIndex={compareMode ? 0 : undefined}
        onClick={compareMode ? onToggleSelect : undefined}
        className={`relative aspect-[3/2] overflow-hidden ${compareMode ? "cursor-pointer" : ""}`}
      >
        <RoomScene spec={design.spec} variant={design.variant} className="h-full w-full" />
        {compareMode && (
          <span
            className={`absolute right-2.5 top-2.5 flex h-6 w-6 items-center justify-center rounded-full border backdrop-blur ${
              selected ? "border-brass bg-brass text-ink" : "border-cream-faint/60 bg-ink/70 text-transparent"
            }`}
          >
            <Check size={13} strokeWidth={3} />
          </span>
        )}
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <button
            onClick={() => {
              const next = prompt("Rename design", design.name);
              if (next && next.trim()) renameDesign(design.id, next.trim());
            }}
            className="flex min-w-0 items-center gap-1.5 truncate text-left font-semibold hover:text-brass-bright"
          >
            <span className="truncate">{design.name}</span>
            <Pencil size={11} className="shrink-0 text-cream-faint" />
          </button>
        </div>
        <div className="mt-0.5 text-xs text-cream-faint">
          {design.styleName} · {design.products.length} pieces · {new Date(design.createdAt).toLocaleDateString()}
        </div>
        <div className="mt-2 font-display text-lg text-brass-bright">{formatPrice(total)}</div>
        {!compareMode && (
          <div className="mt-3 flex gap-2">
            <Link href={`/shared?d=${encodeSnapshot(design)}`} className="btn-ghost flex-1 !py-2 text-xs">
              <ExternalLink size={12} /> Open
            </Link>
            <button
              onClick={() => void share()}
              className="rounded-full border border-ink-line p-2 text-cream-faint transition hover:border-brass/40 hover:text-brass-bright"
              aria-label="Copy share link"
            >
              <Link2 size={13} className={copied ? "text-brass-bright" : ""} />
            </button>
            <button
              onClick={() => {
                if (confirm(`Remove "${design.name}" from saved designs?`)) removeDesign(design.id);
              }}
              className="rounded-full border border-ink-line p-2 text-cream-faint transition hover:border-red-400/40 hover:text-red-400"
              aria-label="Delete design"
            >
              <Trash2 size={13} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function SavedDesigns() {
  const savedDesigns = useMaisonStore((s) => s.savedDesigns);
  const [compareMode, setCompareMode] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 3) return prev;
      return [...prev, id];
    });
  };

  const compared = savedDesigns.filter((d) => selected.includes(d.id));

  return (
    <div className="container-page py-14">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <div className="eyebrow mb-3">My designs</div>
          <h1 className="font-display text-4xl leading-tight sm:text-5xl">
            Every room you&apos;ve saved.
          </h1>
          <p className="mt-4 text-cream-dim">
            Re-open a concept, share it, or compare up to three side by side.
          </p>
        </div>
        {savedDesigns.length > 1 && (
          <button
            onClick={() => {
              setCompareMode((v) => !v);
              setSelected([]);
            }}
            className={`btn-ghost shrink-0 ${compareMode ? "!border-brass/50 !text-brass-bright" : ""}`}
          >
            <Columns3 size={15} /> {compareMode ? "Exit compare" : "Compare designs"}
          </button>
        )}
      </div>

      {compareMode && (
        <div className="mt-4 text-xs text-cream-faint">
          Select up to 3 designs to compare · {selected.length}/3 selected
        </div>
      )}

      {savedDesigns.length === 0 ? (
        <div className="card mt-10 flex flex-col items-center gap-3 p-14 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full border border-brass/40 bg-brass/10 text-brass">
            <Layers size={22} />
          </span>
          <div className="text-lg font-semibold">No saved designs yet</div>
          <p className="max-w-sm text-sm text-cream-dim">
            Generate a room in the Studio and hit &quot;Save design&quot; to keep it here.
          </p>
          <Link href="/studio" className="btn-primary mt-2">
            Go to the Studio
          </Link>
        </div>
      ) : (
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {savedDesigns.map((d) => (
            <DesignCard
              key={d.id}
              design={d}
              compareMode={compareMode}
              selected={selected.includes(d.id)}
              onToggleSelect={() => toggleSelect(d.id)}
            />
          ))}
        </div>
      )}

      {compareMode && compared.length > 0 && (
        <div className="mt-10 overflow-x-auto rounded-2xl border border-ink-line">
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-ink-line bg-ink-soft text-left text-[11px] uppercase tracking-wider text-cream-faint">
                <th className="px-4 py-3 font-medium">Design</th>
                {compared.map((d) => (
                  <th key={d.id} className="px-4 py-3 font-medium text-cream">
                    {d.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-line/60">
              <tr>
                <td className="px-4 py-3 text-cream-faint">Style</td>
                {compared.map((d) => (
                  <td key={d.id} className="px-4 py-3">{d.styleName}</td>
                ))}
              </tr>
              <tr>
                <td className="px-4 py-3 text-cream-faint">Pieces</td>
                {compared.map((d) => (
                  <td key={d.id} className="px-4 py-3">{d.products.length}</td>
                ))}
              </tr>
              <tr>
                <td className="px-4 py-3 text-cream-faint">Furniture</td>
                {compared.map((d) => (
                  <td key={d.id} className="px-4 py-3">{formatPrice(pricingBreakdown(d.products).furniture)}</td>
                ))}
              </tr>
              <tr>
                <td className="px-4 py-3 text-cream-faint">Lighting</td>
                {compared.map((d) => (
                  <td key={d.id} className="px-4 py-3">{formatPrice(pricingBreakdown(d.products).lighting)}</td>
                ))}
              </tr>
              <tr>
                <td className="px-4 py-3 text-cream-faint">Decoration</td>
                {compared.map((d) => (
                  <td key={d.id} className="px-4 py-3">{formatPrice(pricingBreakdown(d.products).decoration)}</td>
                ))}
              </tr>
              <tr className="bg-brass/5">
                <td className="px-4 py-3 font-semibold text-brass-bright">Total</td>
                {compared.map((d) => (
                  <td key={d.id} className="px-4 py-3 font-semibold text-brass-bright">
                    {formatPrice(pricingBreakdown(d.products).total)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
