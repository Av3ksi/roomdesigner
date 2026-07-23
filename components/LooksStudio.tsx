"use client";

import Link from "next/link";
import { AlertTriangle, CheckCircle2, Sparkles, Upload, XCircle } from "lucide-react";
import { useState } from "react";
import { formatPrice } from "@/lib/products";
import RoomHotspots, { type HotspotItem } from "@/components/RoomHotspots";
import { TARGET_MARKETS, type TargetMarket } from "@/lib/ai/webProductSearch";
import type { DetectionBox, Product, ProductCategory } from "@/lib/types";

const CATEGORIES: ProductCategory[] = [
  "sofa", "chair", "table", "lighting", "rug", "art", "plant", "storage", "decor", "textile",
];

const CATEGORY_LABEL: Record<ProductCategory, string> = {
  sofa: "Sofa", chair: "Chair", table: "Table", lighting: "Lighting", rug: "Rug",
  art: "Art", plant: "Plant", storage: "Storage", decor: "Decor", textile: "Textile",
};

interface CheckResult {
  productId: string;
  name: string;
  pass: boolean | null;
  note: string | null;
}

interface ExternalItem {
  name: string;
  url: string;
  retailer: string;
  priceText: string | null;
  box: DetectionBox | null;
}

interface GenerateResult {
  imageBase64: string;
  totalPrice: number;
  styleTags: string[];
  productIds: string[];
  itemBoxes: Record<string, DetectionBox>;
  checks: CheckResult[];
  autoMatched: { productId: string; name: string; price: number }[];
  externals: ExternalItem[];
}

/**
 * The in-app replacement for scripts/compose-finished-room.ts — same
 * pipeline (suggestPlacements + composeSceneWithProducts + per-item
 * identity checks), driven from a form instead of the terminal. Unlinked
 * from the main nav (same pattern as /composite-preview and /suppliers):
 * this is a curation tool for building Complete Rooms bundles, not a
 * customer-facing page — there's no account system in this app yet to
 * gate it behind, so "not linked anywhere" is the access control for now.
 */
export default function LooksStudio({ catalog }: { catalog: Product[] }) {
  const [roomFile, setRoomFile] = useState<File | null>(null);
  const [roomPreviewUrl, setRoomPreviewUrl] = useState<string | null>(null);
  const [selected, setSelected] = useState<Partial<Record<ProductCategory, Product>>>({});
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [styleDirection, setStyleDirection] = useState("");
  const [quality, setQuality] = useState<"low" | "medium" | "high">("medium");
  const [targetMarket, setTargetMarket] = useState<TargetMarket>("CH");
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishedId, setPublishedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const productsByCategory = (cat: ProductCategory) => catalog.filter((p) => p.category === cat && p.imageUrl);
  const selectedProducts = Object.values(selected).filter((p): p is Product => Boolean(p));

  function onRoomFileChange(file: File | null) {
    setRoomFile(file);
    if (roomPreviewUrl) URL.revokeObjectURL(roomPreviewUrl);
    setRoomPreviewUrl(file ? URL.createObjectURL(file) : null);
    setResult(null);
    setPublishedId(null);
    setError(null);
  }

  function pickProduct(category: ProductCategory, productId: string) {
    setSelected((s) => {
      const next = { ...s };
      if (!productId) delete next[category];
      else next[category] = catalog.find((p) => p.id === productId);
      return next;
    });
    setResult(null);
    setPublishedId(null);
  }

  async function generate() {
    if (!roomFile || selectedProducts.length === 0 || generating) return;
    setGenerating(true);
    setError(null);
    setResult(null);
    setPublishedId(null);

    try {
      const form = new FormData();
      form.append("room", roomFile);
      form.append("productIds", JSON.stringify(selectedProducts.map((p) => p.id)));
      form.append("quality", quality);
      form.append("targetMarket", targetMarket);
      if (styleDirection.trim()) form.append("styleDirection", styleDirection.trim());

      const res = await fetch("/api/finished-rooms/generate", { method: "POST", body: form });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `Request failed: ${res.status}`);
      setResult(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(false);
    }
  }

  async function publish() {
    if (!result || !title.trim() || publishing) return;
    setPublishing(true);
    setError(null);

    try {
      const res = await fetch("/api/finished-rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description,
          styleTags: result.styleTags,
          heroImageBase64: result.imageBase64,
          productIds: result.productIds,
          itemBoxes: result.itemBoxes,
          autoMatchedIds: result.autoMatched.map((a) => a.productId),
          externals: result.externals,
          totalPrice: result.totalPrice,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `Request failed: ${res.status}`);
      setPublishedId(body.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPublishing(false);
    }
  }

  const canGenerate = Boolean(roomFile) && selectedProducts.length > 0 && !generating;
  const canvasSrc = result ? `data:image/png;base64,${result.imageBase64}` : roomPreviewUrl;

  const hotspots: HotspotItem[] = result
    ? (() => {
        const priceById = new Map(selectedProducts.map((p) => [p.id, p.price]));
        const nameById = new Map(selectedProducts.map((p) => [p.id, p.name]));
        const autoMatchedIds = new Set(result.autoMatched.map((a) => a.productId));
        for (const a of result.autoMatched) {
          priceById.set(a.productId, a.price);
          nameById.set(a.productId, a.name);
        }
        const productPins: HotspotItem[] = Object.entries(result.itemBoxes).map(([id, box]) => ({
          id,
          name: nameById.get(id) ?? id,
          priceLabel: formatPrice(priceById.get(id) ?? 0),
          box,
          kind: autoMatchedIds.has(id) ? "auto" : "catalog",
        }));
        const externalPins: HotspotItem[] = result.externals
          .filter((e) => e.box)
          .map((e, i) => ({
            id: `ext-${i}`,
            name: e.name,
            priceLabel: e.priceText ?? "See price",
            box: e.box!,
            kind: "external",
            url: e.url,
            retailer: e.retailer,
          }));
        return [...productPins, ...externalPins];
      })()
    : [];

  return (
    <div className="container-page py-10">
      <div className="max-w-2xl">
        <div className="eyebrow mb-3">Looks Studio (internal)</div>
        <h1 className="font-display text-4xl leading-tight sm:text-5xl">Build a Complete Room.</h1>
        <p className="mt-4 text-cream-dim">
          Upload a room photo, pick one product per category, generate the scene in one composite
          call, review it, then publish it as a sellable bundle on /looks.
        </p>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[420px_1fr]">
        {/* Controls */}
        <div className="card space-y-5 p-5">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-cream-dim">Room photo</label>
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-ink-line bg-ink-panel py-6 text-sm text-cream-faint hover:border-brass/40">
              <Upload size={16} className="text-brass" />
              {roomFile ? roomFile.name : "Click to upload"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => onRoomFileChange(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>

          <div className="space-y-2.5">
            <label className="block text-xs font-semibold text-cream-dim">Products (one per category)</label>
            {CATEGORIES.map((cat) => {
              const options = productsByCategory(cat);
              if (options.length === 0) return null;
              return (
                <div key={cat} className="flex items-center gap-2">
                  <span className="w-20 shrink-0 text-xs text-cream-faint">{CATEGORY_LABEL[cat]}</span>
                  <select
                    value={selected[cat]?.id ?? ""}
                    onChange={(e) => pickProduct(cat, e.target.value)}
                    className="flex-1 rounded-lg border border-ink-line bg-ink-panel px-2.5 py-1.5 text-xs text-cream-dim focus:border-brass/50 focus:outline-none"
                  >
                    <option value="">— none —</option>
                    {options.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name.slice(0, 48)} — {formatPrice(p.price)}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-cream-dim">
              Style direction <span className="font-normal text-cream-faint">(showroom mode)</span>
            </label>
            <textarea
              value={styleDirection}
              onChange={(e) => setStyleDirection(e.target.value)}
              rows={2}
              placeholder='e.g. "warm japandi, sage-green accent wall, cozy evening lighting" — empty = keep the photo untouched, only add products'
              className="w-full rounded-lg border border-ink-line bg-ink-panel px-3 py-2 text-xs outline-none placeholder:text-cream-faint focus:border-brass/50"
            />
            <p className="mt-1 text-[10px] text-cream-faint">
              With a style direction, the whole room gets redesigned around the products — repainted
              walls, lighting mood, staging accents — like a real showroom shoot. The architecture
              (windows, doors, layout) stays; only the products are what customers actually buy.
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-cream-dim">Quality</label>
            <select
              value={quality}
              onChange={(e) => setQuality(e.target.value as "low" | "medium" | "high")}
              className="w-full rounded-lg border border-ink-line bg-ink-panel px-2.5 py-1.5 text-xs text-cream-dim focus:border-brass/50 focus:outline-none"
            >
              <option value="low">Low (cheapest, quick tests)</option>
              <option value="medium">Medium (recommended for publishing)</option>
              <option value="high">High (most expensive)</option>
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-cream-dim">
              Target market <span className="font-normal text-cream-faint">(web-sourced extras)</span>
            </label>
            <select
              value={targetMarket}
              onChange={(e) => setTargetMarket(e.target.value as TargetMarket)}
              className="w-full rounded-lg border border-ink-line bg-ink-panel px-2.5 py-1.5 text-xs text-cream-dim focus:border-brass/50 focus:outline-none"
            >
              {TARGET_MARKETS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[10px] text-cream-faint">
              Who this Look is for — controls which country the web-sourced extras (posters, items not in our
              catalog) are searched to actually ship to.
            </p>
          </div>

          <button
            onClick={generate}
            disabled={!canGenerate}
            className="btn-primary w-full justify-center disabled:opacity-40"
          >
            <Sparkles size={15} />
            {generating ? "Compositing the scene (~30-90s)…" : "Generate scene"}
          </button>

          {result && (
            <div className="space-y-3 border-t border-ink-line pt-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-cream-dim">Title</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Scandinavian Living Room"
                  className="w-full rounded-lg border border-ink-line bg-ink-panel px-3 py-2 text-sm outline-none focus:border-brass/50"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-cream-dim">Description (optional)</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  className="w-full rounded-lg border border-ink-line bg-ink-panel px-3 py-2 text-sm outline-none focus:border-brass/50"
                />
              </div>
              <button
                onClick={publish}
                disabled={!title.trim() || publishing || Boolean(publishedId)}
                className="btn-primary w-full justify-center disabled:opacity-40"
              >
                {publishedId ? "Published" : publishing ? "Publishing…" : `Publish — ${formatPrice(result.totalPrice)}`}
              </button>
              {publishedId && (
                <Link href={`/looks/${publishedId}`} className="block text-center text-xs text-brass hover:underline">
                  View it on /looks →
                </Link>
              )}
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-xs text-red-300">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              {error}
            </div>
          )}
        </div>

        {/* Preview */}
        <div className="space-y-4">
          <div className="card flex min-h-[420px] items-center justify-center overflow-hidden bg-ink-panel p-0">
            {canvasSrc ? (
              <div className="relative w-full">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={canvasSrc} alt="Room" className="w-full" />
                <RoomHotspots items={hotspots} />
              </div>
            ) : (
              <div className="p-16 text-center text-sm text-cream-faint">Upload a room photo to start.</div>
            )}
          </div>
          {result && result.checks.some((c) => c.pass === false) && (
            <p className="text-[10px] text-amber-400">
              {result.checks.filter((c) => c.pass === false).length} picked product(s) weren&apos;t found in the render
              (substituted or omitted) — see the identity check below. They&apos;re still listed, just without a pin.
            </p>
          )}

          {result && (
            <div className="card space-y-2 p-4">
              <div className="text-xs font-semibold text-cream-dim">Identity check per product</div>
              {result.checks.map((c) => (
                <div key={c.productId} className="flex items-start gap-2 text-xs">
                  {c.pass === true ? (
                    <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-emerald-400" />
                  ) : c.pass === false ? (
                    <XCircle size={14} className="mt-0.5 shrink-0 text-red-400" />
                  ) : (
                    <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-400" />
                  )}
                  <div>
                    <span className="font-semibold text-cream-dim">{c.name}</span>
                    {c.note && <span className="text-cream-faint"> — {c.note}</span>}
                    {c.pass === null && <span className="text-cream-faint"> — check unavailable</span>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {result && result.autoMatched.length > 0 && (
            <div className="card space-y-1.5 p-4">
              <div className="text-xs font-semibold text-cream-dim">
                Also found in our catalog ({result.autoMatched.length})
              </div>
              <p className="text-[10px] text-cream-faint">
                Extra pieces the showroom restyle staged in were matched against real products we
                already sell — added as purchasable hotspots too, included in the total above.
              </p>
              {result.autoMatched.map((m) => (
                <div key={m.productId} className="text-xs text-cream-dim">
                  • {m.name}
                </div>
              ))}
            </div>
          )}

          {result && result.externals.length > 0 && (
            <div className="card space-y-1.5 p-4">
              <div className="text-xs font-semibold text-cream-dim">
                Sourced from other stores ({result.externals.length})
              </div>
              <p className="text-[10px] text-cream-faint">
                Staged pieces we don&apos;t carry, matched to a real product elsewhere via web search.
                These link out (rose pins) and aren&apos;t in the total — no margin until we source them ourselves.
              </p>
              {result.externals.map((e, i) => (
                <a
                  key={i}
                  href={e.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block truncate text-xs text-rose-300 hover:underline"
                >
                  • {e.name} — {e.retailer}
                  {e.priceText ? ` · ${e.priceText}` : ""}
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
