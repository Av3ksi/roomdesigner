"use client";

import { AlertTriangle, ArrowUpRight, Sparkles, Upload } from "lucide-react";
import { useState } from "react";
import ProductGlyph from "@/components/room/ProductGlyph";
import type { SupplierCatalogResult } from "@/lib/suppliers";
import type { DetectionBox, Product } from "@/lib/types";

function formatChf(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "CHF", maximumFractionDigits: 0 });
}

interface CompositeApiResult {
  imageBase64: string;
  maskBox: DetectionBox;
  usedRealDetection: boolean;
}

export default function CompositePreview({ catalog }: { catalog: SupplierCatalogResult }) {
  const [roomFile, setRoomFile] = useState<File | null>(null);
  const [roomPreviewUrl, setRoomPreviewUrl] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CompositeApiResult | null>(null);
  const [hotspotOpen, setHotspotOpen] = useState(false);

  const productsWithPhotos = catalog.products.filter((p) => p.imageUrl);

  function onRoomFileChange(file: File | null) {
    setRoomFile(file);
    setResult(null);
    setError(null);
    if (roomPreviewUrl) URL.revokeObjectURL(roomPreviewUrl);
    setRoomPreviewUrl(file ? URL.createObjectURL(file) : null);
  }

  async function generate() {
    if (!roomFile || !selectedProduct?.imageUrl) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setHotspotOpen(false);

    try {
      const form = new FormData();
      form.append("room", roomFile);
      form.append("productImageUrl", selectedProduct.imageUrl);
      form.append("category", selectedProduct.category);

      const res = await fetch("/api/composite", { method: "POST", body: form });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `Request failed: ${res.status}`);
      setResult(body as CompositeApiResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container-page py-14">
      <div className="max-w-2xl">
        <div className="eyebrow mb-3">Compositing step — internal preview</div>
        <h1 className="font-display text-4xl leading-tight sm:text-5xl">A real product, in your real room.</h1>
        <p className="mt-4 text-cream-dim">
          Upload a real room photo, pick a real product, and hit generate — this makes one real, billed
          OpenAI call (nothing fires automatically). The mask position is still a rough placeholder (see{" "}
          <code className="rounded bg-ink-panel px-1.5 py-0.5">lib/ai/composite.ts</code>), so expect
          imperfect placement for now; the hotspot below shows exactly where the mask was.
        </p>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_1.3fr]">
        <div className="space-y-6">
          <div className="card p-5">
            <div className="mb-3 text-sm font-semibold">1. Room photo</div>
            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-ink-line px-4 py-8 text-center text-sm text-cream-faint hover:border-brass/40">
              <Upload size={18} className="text-brass" />
              {roomFile ? roomFile.name : "Click to upload a real room photo"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => onRoomFileChange(e.target.files?.[0] ?? null)}
              />
            </label>
            {roomPreviewUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={roomPreviewUrl} alt="Room preview" className="mt-3 max-h-48 w-full rounded-lg object-cover" />
            )}
          </div>

          <div className="card p-5">
            <div className="mb-3 text-sm font-semibold">2. Product ({catalog.supplierLabel}, {catalog.source})</div>
            {productsWithPhotos.length === 0 && (
              <div className="flex items-start gap-2 rounded-lg border border-brass/30 bg-brass/5 p-3 text-xs text-cream-dim">
                <AlertTriangle size={14} className="mt-0.5 shrink-0 text-brass" />
                {catalog.source === "live"
                  ? "No products with photos in this live scan — the live feed only has photos where a SKU happens to cross-match the bundled sample. Temporarily rename .env (mv .env .env.live-backup) and restart to test against the sample dataset instead, which guarantees photos."
                  : "No products with photos in this catalog at all — check lib/suppliers/data/vidaxl-sample.json."}
              </div>
            )}
            <div className="grid max-h-72 grid-cols-3 gap-2 overflow-y-auto">
              {productsWithPhotos.slice(0, 30).map((p) => (
                <button
                  key={p.id}
                  onClick={() => setSelectedProduct(p)}
                  className={`overflow-hidden rounded-lg border text-left transition ${
                    selectedProduct?.id === p.id ? "border-brass ring-1 ring-brass" : "border-ink-line hover:border-brass/40"
                  }`}
                >
                  <div className="relative aspect-square bg-ink-panel">
                    {p.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.imageUrl} alt={p.name} className="h-full w-full object-cover" />
                    ) : (
                      <ProductGlyph product={p} className="h-full w-full" />
                    )}
                  </div>
                  <div className="truncate px-1.5 py-1 text-[9px] text-cream-faint">{p.name}</div>
                </button>
              ))}
            </div>
            {selectedProduct && (
              <div className="mt-3 text-xs text-cream-dim">
                Selected: <span className="font-semibold text-cream">{selectedProduct.name}</span> ·{" "}
                {formatChf(selectedProduct.price)} · category "{selectedProduct.category}"
              </div>
            )}
          </div>

          <button
            onClick={generate}
            disabled={!roomFile || !selectedProduct || loading}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-brass px-6 py-3 text-sm font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Sparkles size={16} />
            {loading ? "Generating (real API call, ~15-60s)..." : "Generate composite (real cost, ~$0.01)"}
          </button>
          {!loading && (!roomFile || !selectedProduct) && (
            <div className="text-center text-xs text-cream-faint">
              {!roomFile && !selectedProduct
                ? "Upload a room photo and pick a product to enable this."
                : !roomFile
                  ? "Upload a room photo to enable this."
                  : "Pick a product to enable this."}
            </div>
          )}

          {error && (
            <div className="card flex items-start gap-2 border-red-500/30 bg-red-500/5 p-4 text-sm text-red-300">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" />
              {error}
            </div>
          )}
        </div>

        <div className="card relative flex items-center justify-center overflow-hidden bg-ink-panel p-0">
          {result ? (
            <div className="relative w-full">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`data:image/png;base64,${result.imageBase64}`}
                alt="Composited room"
                className="w-full"
              />
              <button
                onClick={() => setHotspotOpen((v) => !v)}
                style={{
                  left: `${result.maskBox.x * 100}%`,
                  top: `${result.maskBox.y * 100}%`,
                  width: `${result.maskBox.w * 100}%`,
                  height: `${result.maskBox.h * 100}%`,
                }}
                className="absolute rounded-md border-2 border-brass-bright/70 bg-brass/10 transition hover:bg-brass/20"
                aria-label={`View ${selectedProduct?.name}`}
              />
              {hotspotOpen && selectedProduct && (
                <div
                  style={{ left: `${result.maskBox.x * 100}%`, top: `${(result.maskBox.y + result.maskBox.h) * 100}%` }}
                  className="absolute z-10 mt-2 w-56 rounded-lg border border-ink-line bg-ink p-3 shadow-xl"
                >
                  <div className="text-sm font-semibold">{selectedProduct.name}</div>
                  <div className="mt-0.5 text-xs text-cream-faint">{selectedProduct.brand}</div>
                  <div className="mt-2 font-display text-lg text-brass-bright">{formatChf(selectedProduct.price)}</div>
                  {selectedProduct.productUrl ? (
                    <a
                      href={selectedProduct.productUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 flex items-center gap-1 text-xs font-semibold text-brass hover:underline"
                    >
                      View product <ArrowUpRight size={12} />
                    </a>
                  ) : (
                    <div className="mt-2 text-[10px] text-cream-faint">
                      No purchase link in this dataset yet — re-run the ingestion script to capture it.
                    </div>
                  )}
                </div>
              )}
              <span className="absolute bottom-2 right-2 rounded-full bg-ink/80 px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-cream-faint backdrop-blur">
                {result.usedRealDetection ? "positioned via a real detection" : "generic default position"}
              </span>
            </div>
          ) : (
            <div className="p-16 text-center text-sm text-cream-faint">
              Upload a room photo and pick a product, then generate to see the result here.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
