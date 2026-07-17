"use client";

import { AlertTriangle, ArrowUpRight, Sparkles, Upload, Wand2 } from "lucide-react";
import { useRef, useState } from "react";
import ProductGlyph from "@/components/room/ProductGlyph";
import { DEFAULT_CATEGORY_BOX, clampBox } from "@/lib/placementBoxes";
import type { SupplierCatalogResult } from "@/lib/suppliers";
import type { DetectionBox, Product, ProductCategory } from "@/lib/types";

function formatChf(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "CHF", maximumFractionDigits: 0 });
}

interface CompositeApiResult {
  imageBase64: string;
  maskBox: DetectionBox;
  placementSource: "explicit" | "detection" | "default";
}

type PlacementBoxes = Record<ProductCategory, DetectionBox>;

/** Where the currently shown placement box came from — shown honestly in the UI. */
type BoxOrigin = "default" | "ai" | "adjusted";

export default function CompositePreview({ catalog }: { catalog: SupplierCatalogResult }) {
  const [roomFile, setRoomFile] = useState<File | null>(null);
  const [roomPreviewUrl, setRoomPreviewUrl] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [placementBox, setPlacementBox] = useState<DetectionBox | null>(null);
  const [boxOrigin, setBoxOrigin] = useState<BoxOrigin>("default");
  const [aiBoxes, setAiBoxes] = useState<PlacementBoxes | null>(null);
  const [aiSource, setAiSource] = useState<"claude" | "default" | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CompositeApiResult | null>(null);
  const [hotspotOpen, setHotspotOpen] = useState(false);

  const overlayRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    mode: "move" | "resize";
    startX: number;
    startY: number;
    box: DetectionBox;
    rect: DOMRect;
  } | null>(null);

  const productsWithPhotos = catalog.products.filter((p) => p.imageUrl);

  function onRoomFileChange(file: File | null) {
    setRoomFile(file);
    setResult(null);
    setError(null);
    // Suggestions are per-photo — a new photo invalidates them.
    setAiBoxes(null);
    setAiSource(null);
    if (roomPreviewUrl) URL.revokeObjectURL(roomPreviewUrl);
    setRoomPreviewUrl(file ? URL.createObjectURL(file) : null);
    if (selectedProduct) {
      setPlacementBox({ ...DEFAULT_CATEGORY_BOX[selectedProduct.category] });
      setBoxOrigin("default");
    }
  }

  function selectProduct(p: Product) {
    setSelectedProduct(p);
    const suggested = aiBoxes?.[p.category];
    setPlacementBox({ ...(suggested ?? DEFAULT_CATEGORY_BOX[p.category]) });
    setBoxOrigin(suggested ? "ai" : "default");
  }

  async function suggestPlacement() {
    if (!roomFile) return;
    setAiLoading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("room", roomFile);
      const res = await fetch("/api/placement", { method: "POST", body: form });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `Placement request failed: ${res.status}`);
      setAiBoxes(body.boxes as PlacementBoxes);
      setAiSource(body.source as "claude" | "default");
      if (selectedProduct) {
        setPlacementBox({ ...(body.boxes as PlacementBoxes)[selectedProduct.category] });
        setBoxOrigin(body.source === "claude" ? "ai" : "default");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAiLoading(false);
    }
  }

  function onBoxPointerDown(e: React.PointerEvent, mode: "move" | "resize") {
    if (!placementBox || !overlayRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = {
      mode,
      startX: e.clientX,
      startY: e.clientY,
      box: placementBox,
      rect: overlayRef.current.getBoundingClientRect(),
    };
    overlayRef.current.setPointerCapture(e.pointerId);
  }

  function onOverlayPointerMove(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    const dx = (e.clientX - d.startX) / d.rect.width;
    const dy = (e.clientY - d.startY) / d.rect.height;
    setPlacementBox(
      clampBox(
        d.mode === "move"
          ? { ...d.box, x: d.box.x + dx, y: d.box.y + dy }
          : { ...d.box, w: d.box.w + dx, h: d.box.h + dy },
      ),
    );
    setBoxOrigin("adjusted");
  }

  function onOverlayPointerUp() {
    dragRef.current = null;
  }

  async function generate() {
    if (!roomFile || !selectedProduct?.imageUrl || !placementBox) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setHotspotOpen(false);

    try {
      const form = new FormData();
      form.append("room", roomFile);
      form.append("productImageUrl", selectedProduct.imageUrl);
      form.append("category", selectedProduct.category);
      form.append("boxX", String(placementBox.x));
      form.append("boxY", String(placementBox.y));
      form.append("boxW", String(placementBox.w));
      form.append("boxH", String(placementBox.h));

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

  const boxOriginLabel =
    boxOrigin === "adjusted"
      ? "your placement (dragged)"
      : boxOrigin === "ai"
        ? "AI-suggested placement"
        : "generic default — drag it or use AI suggest";

  return (
    <div className="container-page py-14">
      <div className="max-w-2xl">
        <div className="eyebrow mb-3">Compositing step — internal preview</div>
        <h1 className="font-display text-4xl leading-tight sm:text-5xl">A real product, in your real room.</h1>
        <p className="mt-4 text-cream-dim">
          Upload a real room photo, pick a real product, position the placement box on your photo
          (drag to move, corner to resize — or let AI read the room and suggest it), then generate.
          Generation makes one real, billed OpenAI call; nothing fires automatically.
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
              <div
                ref={overlayRef}
                onPointerMove={onOverlayPointerMove}
                onPointerUp={onOverlayPointerUp}
                className="relative mt-3 touch-none select-none overflow-hidden rounded-lg"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={roomPreviewUrl} alt="Room preview" draggable={false} className="w-full" />
                {placementBox && selectedProduct && (
                  <div
                    onPointerDown={(e) => onBoxPointerDown(e, "move")}
                    style={{
                      left: `${placementBox.x * 100}%`,
                      top: `${placementBox.y * 100}%`,
                      width: `${placementBox.w * 100}%`,
                      height: `${placementBox.h * 100}%`,
                    }}
                    className="absolute cursor-move rounded-md border-2 border-brass-bright/80 bg-brass/15"
                  >
                    <span className="absolute -top-5 left-0 rounded bg-ink/80 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-brass-bright backdrop-blur">
                      {selectedProduct.category}
                    </span>
                    <span
                      onPointerDown={(e) => onBoxPointerDown(e, "resize")}
                      className="absolute -bottom-1.5 -right-1.5 h-4 w-4 cursor-nwse-resize rounded-sm border border-ink bg-brass-bright"
                    />
                  </div>
                )}
              </div>
            )}

            {roomPreviewUrl && selectedProduct && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  onClick={suggestPlacement}
                  disabled={aiLoading}
                  className="flex items-center gap-1.5 rounded-full border border-brass/40 px-3.5 py-1.5 text-xs font-semibold text-brass-bright transition hover:bg-brass/10 disabled:opacity-40"
                >
                  <Wand2 size={13} />
                  {aiLoading ? "Reading the room..." : "AI suggest placement"}
                </button>
                <span className="text-[10px] text-cream-faint">{boxOriginLabel}</span>
              </div>
            )}
            {aiSource === "default" && (
              <div className="mt-2 text-[10px] text-cream-faint">
                AI placement unavailable (no ANTHROPIC_API_KEY on the server) — these are the generic
                defaults, drag the box to position it yourself.
              </div>
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
                  onClick={() => selectProduct(p)}
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
            disabled={!roomFile || !selectedProduct || !placementBox || loading}
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
                {result.placementSource === "explicit"
                  ? "your placement"
                  : result.placementSource === "detection"
                    ? "detected position"
                    : "generic default position"}
              </span>
            </div>
          ) : (
            <div className="p-16 text-center text-sm text-cream-faint">
              Upload a room photo, pick a product, position the box, then generate to see the result here.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
