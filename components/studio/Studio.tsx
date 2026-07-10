"use client";

import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  ImagePlus,
  Loader2,
  Map,
  MessageCircle,
  Orbit,
  RefreshCcw,
  RotateCcw,
  ScanLine,
  Send,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Truck,
  Upload,
  Wand2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import BeforeAfterSlider from "@/components/BeforeAfterSlider";
import ProductGlyph from "@/components/room/ProductGlyph";
import RoomScene from "@/components/room/RoomScene";
import Immersive3D from "@/components/studio/Immersive3D";
import {
  BRANDS,
  buildConceptProducts,
  formatPrice,
  matchingAccessories,
  PRODUCT_MAP,
  resolveSwap,
} from "@/lib/products";
import { SAMPLE_ROOMS } from "@/lib/rooms";
import { STYLE_MAP, STYLES } from "@/lib/styles";
import { useMaisonStore } from "@/lib/store";
import type {
  AssistantAction,
  AssistantContext,
  AssistantResponse,
  BudgetTier,
  DesignBrief,
  DesignConcept,
  Product,
  ProductCategory,
  RoomAnalysis,
  RoomStyleSpec,
  SampleRoom,
  UploadKind,
} from "@/lib/types";

/* ————————————————————————————————— types & helpers ————————————————————————————————— */

type Step = "upload" | "analyzing" | "analysis" | "styles" | "generating" | "result";

interface StagedImage {
  id: string;
  dataUrl: string;
  base64: string;
  kind: UploadKind;
  label: string;
}

type Source =
  | { kind: "sample"; room: SampleRoom }
  | { kind: "upload"; images: StagedImage[]; name: string };

const STEP_LABELS: { id: Step; label: string }[] = [
  { id: "upload", label: "Your room" },
  { id: "analysis", label: "AI analysis" },
  { id: "styles", label: "Style & brief" },
  { id: "result", label: "Your design" },
];

const ANALYZE_STAGES = [
  "Detecting furniture & objects",
  "Reading materials & surface finishes",
  "Extracting color palette",
  "Estimating dimensions & spatial layout",
  "Mapping windows, doors & light paths",
  "Scoring lighting quality",
  "Matching signature styles",
];

const GENERATE_STAGES = [
  "Composing spatial layout",
  "Selecting palette & materials",
  "Placing furniture from the marketplace",
  "Balancing light & shadow",
  "Rendering three concepts",
];

const ACCENTS = [
  { name: "Designer's choice", hex: null as string | null },
  { name: "Terracotta", hex: "#C0603A" },
  { name: "Deep sage", hex: "#5A7058" },
  { name: "Midnight", hex: "#2B3A4A" },
  { name: "Brass", hex: "#C8A96E" },
  { name: "Oxblood", hex: "#6E3B33" },
];

const BUDGETS: { id: BudgetTier; label: string; note: string }[] = [
  { id: "essential", label: "Essential", note: "Smart value, same design" },
  { id: "signature", label: "Signature", note: "The Maison standard" },
  { id: "luxe", label: "Luxe", note: "Heirloom-grade pieces" },
];

const LIFESTYLES = [
  { id: "kids", label: "Kids at home" },
  { id: "pets", label: "Pets" },
  { id: "office", label: "Work from home" },
  { id: "hosting", label: "Loves hosting" },
];

function applyAccent(spec: RoomStyleSpec, accent: string | null): RoomStyleSpec {
  if (!accent) return spec;
  return {
    ...spec,
    rugAccent: accent,
    cushions: [accent, ...spec.cushions.slice(1)],
    artColors: [accent, ...spec.artColors.slice(1)],
  };
}

function darken(hex: string, f: number): string {
  const n = parseInt(hex.replace("#", ""), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `#${((ch((n >> 16) & 255) << 16) | (ch((n >> 8) & 255) << 8) | ch(n & 255)).toString(16).padStart(6, "0")}`;
}

/**
 * Schematic 3D reconstruction of an uploaded room: the analysis palette
 * drives the "before" world's walls, floor and furniture tones.
 */
function datedSpecFromAnalysis(analysis: RoomAnalysis): RoomStyleSpec {
  const c = (i: number, fb: string) => analysis.colorPalette[i]?.hex ?? fb;
  const wall = c(0, "#CFC5AE");
  const sofa = c(1, "#6B5138");
  const floor = c(2, "#A5794A");
  const rug = c(3, "#8F7B5E");
  return {
    wall,
    wallAccent: darken(wall, 0.94),
    panel: "none",
    floor,
    floorSeam: darken(floor, 0.8),
    rug,
    rugAccent: darken(rug, 0.85),
    sofa,
    sofaShadow: darken(sofa, 0.75),
    cushions: [rug, darken(sofa, 0.75), darken(wall, 0.85)],
    wood: darken(floor, 0.7),
    metal: "#55524A",
    lampGlow: "#F5E1B8",
    windowLight: "#DDE3E0",
    art: "none",
    artColors: [rug],
    plant: false,
    pendant: false,
    warmth: 0.3,
  };
}

async function fileToDownscaledJpeg(
  file: File,
): Promise<{ dataUrl: string; base64: string }> {
  const bitmap = await createImageBitmap(file);
  const MAX = 1568;
  const scale = Math.min(1, MAX / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
  return { dataUrl, base64: dataUrl.split(",")[1] ?? "" };
}

function primaryImage(source: Source): StagedImage | null {
  if (source.kind === "sample") return null;
  return source.images.find((i) => i.kind === "photo") ?? source.images[0] ?? null;
}

/** The "before" visual: uploaded photo or the sample room's dated render. */
function BeforeVisual({
  source,
  detections,
  scanning,
  className = "",
}: {
  source: Source;
  detections?: RoomAnalysis["detections"];
  scanning?: boolean;
  className?: string;
}) {
  const img = source.kind === "upload" ? primaryImage(source) : null;
  return (
    <div className={`relative h-full w-full overflow-hidden bg-ink-panel ${className}`}>
      {source.kind === "sample" ? (
        <RoomScene spec={source.room.spec} dated className="h-full w-full" />
      ) : img ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={img.dataUrl} alt="Your room" className="h-full w-full object-cover" />
      ) : null}
      {detections?.map(
        (d, i) =>
          d.box && (
            <div
              key={`${d.label}-${i}`}
              className="absolute animate-fade-in rounded-md border border-brass/80"
              style={{
                left: `${d.box.x * 100}%`,
                top: `${d.box.y * 100}%`,
                width: `${d.box.w * 100}%`,
                height: `${d.box.h * 100}%`,
                animationDelay: `${0.4 + i * 0.55}s`,
                boxShadow: "0 0 0 1px rgba(0,0,0,0.35)",
              }}
            >
              <span className="absolute -top-6 left-0 whitespace-nowrap rounded bg-ink/90 px-1.5 py-0.5 text-[10px] font-semibold text-brass-bright">
                {d.label} · {(d.confidence * 100).toFixed(0)}%
              </span>
            </div>
          ),
      )}
      {scanning && (
        <>
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-brass/5 via-transparent to-brass/5" />
          <div className="pointer-events-none absolute inset-x-0 h-0.5 animate-scanline bg-brass/90 shadow-[0_0_24px_4px_rgba(200,169,110,0.55)]" />
          <div
            className="pointer-events-none absolute inset-0 opacity-30"
            style={{
              backgroundImage:
                "linear-gradient(rgba(200,169,110,0.14) 1px, transparent 1px), linear-gradient(90deg, rgba(200,169,110,0.14) 1px, transparent 1px)",
              backgroundSize: "44px 44px",
            }}
          />
          {/* Viewfinder corners */}
          {[
            "left-3 top-3 border-l-2 border-t-2",
            "right-3 top-3 border-r-2 border-t-2",
            "left-3 bottom-3 border-l-2 border-b-2",
            "right-3 bottom-3 border-r-2 border-b-2",
          ].map((cls) => (
            <span
              key={cls}
              className={`pointer-events-none absolute h-8 w-8 rounded-sm border-brass/80 ${cls}`}
            />
          ))}
        </>
      )}
    </div>
  );
}

function StageList({ stages, done }: { stages: string[]; done: boolean }) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(
      () => setIdx((i) => Math.min(i + 1, stages.length - 1)),
      850,
    );
    return () => clearInterval(t);
  }, [stages.length]);
  const effective = done ? stages.length : idx;
  return (
    <ul className="space-y-2.5">
      {stages.map((s, i) => {
        const state = i < effective ? "done" : i === effective ? "active" : "pending";
        return (
          <li key={s} className="flex items-center gap-2.5 text-sm">
            {state === "done" ? (
              <Check size={15} className="shrink-0 text-brass" />
            ) : state === "active" ? (
              <Loader2 size={15} className="shrink-0 animate-spin text-brass" />
            ) : (
              <span className="h-[15px] w-[15px] shrink-0 rounded-full border border-ink-line" />
            )}
            <span
              className={
                state === "pending"
                  ? "text-cream-faint"
                  : state === "active"
                    ? "text-cream animate-pulse-soft"
                    : "text-cream-dim"
              }
            >
              {s}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function ScanProgress({ done }: { done: boolean }) {
  const [pct, setPct] = useState(0);
  useEffect(() => {
    const t = setInterval(() => {
      setPct((p) => (p < 96 ? p + Math.max(1, Math.round((96 - p) / 18)) : p));
    }, 140);
    return () => clearInterval(t);
  }, []);
  const value = done ? 100 : pct;
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="font-display text-4xl text-brass-bright">{value}%</span>
        <span className="text-[11px] uppercase tracking-widest text-cream-faint">
          Spatial model
        </span>
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-ink-line">
        <div
          className="h-full rounded-full bg-brass transition-all duration-300"
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

function TrustRow({ className = "" }: { className?: string }) {
  return (
    <div className={`flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[11px] text-cream-faint ${className}`}>
      <span className="flex items-center gap-1.5">
        <RotateCcw size={12} className="text-brass" /> 30-day returns
      </span>
      <span className="flex items-center gap-1.5">
        <ShieldCheck size={12} className="text-brass" /> Buyer protection
      </span>
      <span className="flex items-center gap-1.5">
        <Truck size={12} className="text-brass" /> White-glove delivery
      </span>
    </div>
  );
}

/* ————————————————————————————————— main component ————————————————————————————————— */

export default function Studio() {
  const [step, setStep] = useState<Step>("upload");
  const [staged, setStaged] = useState<StagedImage[]>([]);
  const [source, setSource] = useState<Source | null>(null);
  const [analysis, setAnalysis] = useState<RoomAnalysis | null>(null);
  const [concepts, setConcepts] = useState<DesignConcept[] | null>(null);
  const [chosenStyleId, setChosenStyleId] = useState<string | null>(null);
  const [brief, setBrief] = useState<DesignBrief>({
    budget: "signature",
    accent: null,
    lifestyle: [],
    brands: [],
    maxBudget: null,
  });
  const [error, setError] = useState<string | null>(null);
  const [busyDone, setBusyDone] = useState(false);
  const photoRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const planRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const reset = () => {
    setStep("upload");
    setStaged([]);
    setSource(null);
    setAnalysis(null);
    setConcepts(null);
    setChosenStyleId(null);
    setError(null);
  };

  /* ——— staging uploads ——— */
  const stageFiles = useCallback(async (files: FileList | null, kind: UploadKind) => {
    if (!files?.length) return;
    setError(null);
    const additions: StagedImage[] = [];
    for (const file of Array.from(files).slice(0, 4)) {
      if (!file.type.startsWith("image/")) {
        setError("Please upload image files (JPEG, PNG or WebP).");
        continue;
      }
      try {
        const { dataUrl, base64 } = await fileToDownscaledJpeg(file);
        additions.push({
          id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 7)}`,
          dataUrl,
          base64,
          kind,
          label: kind === "floorplan" ? "Floor plan" : file.name,
        });
      } catch {
        setError("Couldn't read one of those images — try a different photo.");
      }
    }
    setStaged((prev) => {
      const merged = [...prev, ...additions];
      // Keep at most 4 photos + 1 floor plan.
      const photos = merged.filter((i) => i.kind === "photo").slice(0, 4);
      const plan = merged.filter((i) => i.kind === "floorplan").slice(-1);
      return [...photos, ...plan];
    });
  }, []);

  /* ——— analyze ——— */
  const startAnalysis = useCallback(async (src: Source) => {
    setSource(src);
    setAnalysis(null);
    setError(null);
    setBusyDone(false);
    setStep("analyzing");
    const started = Date.now();
    try {
      const body =
        src.kind === "sample"
          ? { sampleRoomId: src.room.id }
          : {
              images: src.images.map((i) => ({
                base64: i.base64,
                mediaType: "image/jpeg",
                kind: i.kind,
              })),
              seedKey: src.name,
            };
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { analysis?: RoomAnalysis; error?: string };
      if (!res.ok || !data.analysis) throw new Error(data.error ?? "Analysis failed");
      const minMs = 7200;
      const wait = Math.max(0, minMs - (Date.now() - started));
      setTimeout(() => setBusyDone(true), Math.max(0, wait - 500));
      setTimeout(() => {
        setAnalysis(data.analysis!);
        setStep("analysis");
      }, wait);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed — please try again.");
      setStep("upload");
    }
  }, []);

  const beginUploadAnalysis = () => {
    if (staged.length === 0) return;
    void startAnalysis({
      kind: "upload",
      images: staged,
      name: staged.map((i) => i.id).join("|"),
    });
  };

  /* ——— generate ——— */
  const startGeneration = useCallback(
    async (styleId: string) => {
      setChosenStyleId(styleId);
      setConcepts(null);
      setError(null);
      setBusyDone(false);
      setStep("generating");
      const started = Date.now();
      try {
        const res = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ styleId, analysis, brief }),
        });
        const data = (await res.json()) as { concepts?: DesignConcept[]; error?: string };
        if (!res.ok || !data.concepts) throw new Error(data.error ?? "Generation failed");
        const minMs = 4200;
        const wait = Math.max(0, minMs - (Date.now() - started));
        setTimeout(() => setBusyDone(true), Math.max(0, wait - 500));
        setTimeout(() => {
          setConcepts(data.concepts!);
          setStep("result");
        }, wait);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Generation failed — please try again.");
        setStep("styles");
      }
    },
    [analysis, brief],
  );

  const stepIndex =
    step === "upload" || step === "analyzing"
      ? 0
      : step === "analysis"
        ? 1
        : step === "styles" || step === "generating"
          ? 2
          : 3;

  const photos = staged.filter((i) => i.kind === "photo");
  const plan = staged.find((i) => i.kind === "floorplan");

  return (
    <div className="container-page py-10">
      {/* Stepper */}
      <div className="mb-10 flex flex-wrap items-center gap-3">
        {STEP_LABELS.map((s, i) => (
          <div key={s.id} className="flex items-center gap-3">
            <div
              className={`flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-semibold ${
                i === stepIndex
                  ? "border-brass bg-brass/10 text-brass-bright"
                  : i < stepIndex
                    ? "border-ink-line text-cream-dim"
                    : "border-ink-line/60 text-cream-faint"
              }`}
            >
              {i < stepIndex ? <Check size={12} /> : <span>{i + 1}</span>}
              {s.label}
            </div>
            {i < STEP_LABELS.length - 1 && (
              <span className="hidden h-px w-8 bg-ink-line sm:block" />
            )}
          </div>
        ))}
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-red-900/60 bg-red-950/40 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {/* ——— STEP: upload ——— */}
      {step === "upload" && (
        <div className="animate-fade-up">
          <h1 className="font-display text-4xl leading-tight sm:text-5xl">
            Show us your room.
          </h1>
          <p className="mt-3 max-w-2xl text-cream-dim">
            One photo is enough — more angles and a floor plan make the
            dimensions sharper. Maison reads the architecture, light,
            materials and furniture, then designs the room back to you.
          </p>

          <div className="mt-8 grid gap-6 lg:grid-cols-[1.2fr_1fr]">
            <div>
              <div
                role="button"
                tabIndex={0}
                className={`card flex min-h-[260px] cursor-pointer flex-col items-center justify-center gap-4 border-dashed p-8 text-center transition ${
                  dragOver ? "border-brass bg-brass/5" : "hover:border-brass/50"
                }`}
                onClick={() => photoRef.current?.click()}
                onKeyDown={(e) => e.key === "Enter" && photoRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  void stageFiles(e.dataTransfer.files, "photo");
                }}
              >
                <span className="flex h-16 w-16 items-center justify-center rounded-full border border-brass/40 bg-brass/10 text-brass">
                  <Upload size={24} />
                </span>
                <div>
                  <div className="text-lg font-semibold">Drop photos of your room</div>
                  <div className="mt-1 text-sm text-cream-faint">
                    or click to browse · up to 4 angles · shot from a corner works best
                  </div>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button onClick={() => cameraRef.current?.click()} className="btn-ghost !px-4 !py-2 text-xs">
                  <Camera size={14} /> Take a photo
                </button>
                <button onClick={() => photoRef.current?.click()} className="btn-ghost !px-4 !py-2 text-xs">
                  <ImagePlus size={14} /> Add more angles
                </button>
                <button onClick={() => planRef.current?.click()} className="btn-ghost !px-4 !py-2 text-xs">
                  <Map size={14} /> Add floor plan
                </button>
              </div>

              <input
                ref={photoRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  void stageFiles(e.target.files, "photo");
                  e.target.value = "";
                }}
              />
              <input
                ref={cameraRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  void stageFiles(e.target.files, "photo");
                  e.target.value = "";
                }}
              />
              <input
                ref={planRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  void stageFiles(e.target.files, "floorplan");
                  e.target.value = "";
                }}
              />

              {staged.length > 0 && (
                <div className="card mt-4 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="text-sm font-semibold">
                      {photos.length} angle{photos.length === 1 ? "" : "s"}
                      {plan ? " + floor plan" : ""} ready
                    </div>
                    <span className="text-[11px] text-cream-faint">
                      More angles → sharper dimensions
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-5">
                    {staged.map((img) => (
                      <div key={img.id} className="group relative aspect-square overflow-hidden rounded-lg border border-ink-line">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={img.dataUrl} alt={img.label} className="h-full w-full object-cover" />
                        {img.kind === "floorplan" && (
                          <span className="absolute bottom-1 left-1 rounded bg-ink/85 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-brass-bright">
                            Plan
                          </span>
                        )}
                        <button
                          onClick={() => setStaged((p) => p.filter((i) => i.id !== img.id))}
                          className="absolute right-1 top-1 rounded-full bg-ink/85 p-1 text-cream-dim opacity-0 transition group-hover:opacity-100"
                          aria-label={`Remove ${img.label}`}
                        >
                          <X size={11} />
                        </button>
                      </div>
                    ))}
                  </div>
                  <button onClick={beginUploadAnalysis} className="btn-primary mt-4 w-full">
                    <ScanLine size={15} /> Begin AI analysis
                  </button>
                </div>
              )}
            </div>

            <div>
              <div className="eyebrow mb-3">No photo handy? Try a sample room</div>
              <div className="space-y-3">
                {SAMPLE_ROOMS.map((room) => (
                  <button
                    key={room.id}
                    onClick={() => void startAnalysis({ kind: "sample", room })}
                    className="card group flex w-full items-center gap-4 p-3 text-left transition hover:border-brass/50"
                  >
                    <div className="h-20 w-32 shrink-0 overflow-hidden rounded-lg">
                      <RoomScene spec={room.spec} dated className="h-full w-full" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold">{room.name}</div>
                      <div className="text-xs text-cream-faint">{room.meta}</div>
                    </div>
                    <ArrowRight
                      size={16}
                      className="shrink-0 text-cream-faint transition group-hover:translate-x-1 group-hover:text-brass"
                    />
                  </button>
                ))}
              </div>
              <TrustRow className="mt-6 !justify-start" />
            </div>
          </div>
        </div>
      )}

      {/* ——— STEP: analyzing ——— */}
      {step === "analyzing" && source && (
        <div className="grid animate-fade-up gap-8 lg:grid-cols-[1.5fr_1fr]">
          <div>
            <div className="relative aspect-[3/2] overflow-hidden rounded-2xl border border-brass/25">
              <BeforeVisual
                source={source}
                scanning
                detections={source.kind === "sample" ? source.room.analysis.detections : undefined}
              />
            </div>
            {source.kind === "upload" && source.images.length > 1 && (
              <div className="mt-3 flex gap-2">
                {source.images.map((img) => (
                  <div key={img.id} className="h-14 w-20 overflow-hidden rounded-md border border-ink-line opacity-80">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.dataUrl} alt={img.label} className="h-full w-full object-cover" />
                  </div>
                ))}
                <div className="flex items-center text-xs text-cream-faint">
                  Cross-referencing {source.images.length} images
                </div>
              </div>
            )}
          </div>
          <div className="card p-6">
            <div className="mb-1 flex items-center gap-2 text-brass">
              <ScanLine size={17} />
              <span className="eyebrow !text-brass">Analyzing your space</span>
            </div>
            <p className="mb-5 text-sm text-cream-faint">
              Maison&apos;s vision engine is building a structured model of the
              room — the way a surveyor and a designer would, together.
            </p>
            <ScanProgress done={busyDone} />
            <div className="mt-6">
              <StageList stages={ANALYZE_STAGES} done={busyDone} />
            </div>
          </div>
        </div>
      )}

      {/* ——— STEP: analysis ——— */}
      {step === "analysis" && source && analysis && (
        <AnalysisView
          source={source}
          analysis={analysis}
          onContinue={() => setStep("styles")}
          onRestart={reset}
        />
      )}

      {/* ——— STEP: styles + brief ——— */}
      {step === "styles" && analysis && (
        <div className="animate-fade-up">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="font-display text-3xl sm:text-4xl">Set the brief. Pick a direction.</h2>
              <p className="mt-2 max-w-xl text-cream-dim">
                Budget, lifestyle and color steer every concept. Styles are
                ranked for your room&apos;s light, proportions and architecture.
              </p>
            </div>
            <button onClick={() => setStep("analysis")} className="btn-ghost !px-4 !py-2 text-xs">
              <ArrowLeft size={14} /> Back to analysis
            </button>
          </div>

          {/* Design brief */}
          <div className="card mt-7 grid gap-6 p-5 lg:grid-cols-[1.2fr_1fr_1fr]">
            <div>
              <div className="mb-2.5 text-[11px] uppercase tracking-wider text-cream-faint">Budget</div>
              <div className="grid grid-cols-3 gap-2">
                {BUDGETS.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => setBrief({ ...brief, budget: b.id })}
                    className={`rounded-xl border px-3 py-2.5 text-left transition ${
                      brief.budget === b.id
                        ? "border-brass bg-brass/10"
                        : "border-ink-line hover:border-brass/40"
                    }`}
                  >
                    <div className={`text-sm font-semibold ${brief.budget === b.id ? "text-brass-bright" : ""}`}>
                      {b.label}
                    </div>
                    <div className="mt-0.5 text-[10px] leading-tight text-cream-faint">{b.note}</div>
                  </button>
                ))}
              </div>
              <div className="mt-3 flex items-center gap-2.5">
                <label htmlFor="maxBudget" className="text-[11px] uppercase tracking-wider text-cream-faint">
                  Max total
                </label>
                <div className="flex items-center gap-1 rounded-full border border-ink-line bg-ink-soft px-3 py-1.5">
                  <span className="text-xs text-cream-faint">$</span>
                  <input
                    id="maxBudget"
                    type="number"
                    min={500}
                    step={100}
                    placeholder="no limit"
                    value={brief.maxBudget ?? ""}
                    onChange={(e) =>
                      setBrief({
                        ...brief,
                        maxBudget: e.target.value ? Math.max(0, Number(e.target.value)) : null,
                      })
                    }
                    className="w-24 bg-transparent text-xs text-cream outline-none placeholder:text-cream-faint/60"
                  />
                </div>
                <span className="hidden text-[10px] text-cream-faint sm:block">
                  Budget AI re-specifies pieces to fit
                </span>
              </div>
              <div className="mt-4">
                <div className="mb-2 text-[11px] uppercase tracking-wider text-cream-faint">Accent color</div>
                <div className="flex flex-wrap gap-2">
                  {ACCENTS.map((a) => (
                    <button
                      key={a.name}
                      onClick={() => setBrief({ ...brief, accent: a.hex })}
                      className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition ${
                        brief.accent === a.hex
                          ? "border-brass text-brass-bright"
                          : "border-ink-line text-cream-dim hover:border-brass/40"
                      }`}
                    >
                      {a.hex && (
                        <span className="h-3 w-3 rounded-full border border-black/40" style={{ background: a.hex }} />
                      )}
                      {a.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div>
              <div className="mb-2.5 text-[11px] uppercase tracking-wider text-cream-faint">Lifestyle</div>
              <div className="flex flex-wrap gap-2">
                {LIFESTYLES.map((l) => {
                  const on = brief.lifestyle.includes(l.id);
                  return (
                    <button
                      key={l.id}
                      onClick={() =>
                        setBrief({
                          ...brief,
                          lifestyle: on
                            ? brief.lifestyle.filter((x) => x !== l.id)
                            : [...brief.lifestyle, l.id],
                        })
                      }
                      className={`rounded-full border px-3 py-1.5 text-xs transition ${
                        on
                          ? "border-brass bg-brass/10 text-brass-bright"
                          : "border-ink-line text-cream-dim hover:border-brass/40"
                      }`}
                    >
                      {l.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <div className="mb-2.5 text-[11px] uppercase tracking-wider text-cream-faint">
                Preferred brands <span className="normal-case">(optional)</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {BRANDS.map((b) => {
                  const on = brief.brands.includes(b);
                  return (
                    <button
                      key={b}
                      onClick={() =>
                        setBrief({
                          ...brief,
                          brands: on
                            ? brief.brands.filter((x) => x !== b)
                            : [...brief.brands, b],
                        })
                      }
                      className={`rounded-full border px-3 py-1.5 text-xs transition ${
                        on
                          ? "border-brass bg-brass/10 text-brass-bright"
                          : "border-ink-line text-cream-dim hover:border-brass/40"
                      }`}
                    >
                      {b}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {[...STYLES]
              .sort((a, b) => {
                const sa = analysis.styleAffinity.find((x) => x.styleId === a.id)?.score ?? 0;
                const sb = analysis.styleAffinity.find((x) => x.styleId === b.id)?.score ?? 0;
                return sb - sa;
              })
              .map((style) => {
                const match = analysis.styleAffinity.find((x) => x.styleId === style.id)?.score;
                return (
                  <button
                    key={style.id}
                    onClick={() => void startGeneration(style.id)}
                    className="card group overflow-hidden text-left transition hover:-translate-y-1 hover:border-brass/60"
                  >
                    <div className="relative aspect-[3/2] overflow-hidden">
                      <RoomScene spec={style.spec} className="h-full w-full transition duration-500 group-hover:scale-105" />
                      {match !== undefined && (
                        <span className="absolute right-2.5 top-2.5 rounded-full bg-ink/85 px-2.5 py-1 text-[11px] font-bold text-brass-bright backdrop-blur">
                          {match}% match
                        </span>
                      )}
                      <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1.5 bg-gradient-to-t from-ink/90 to-transparent py-2 text-xs font-semibold text-brass-bright opacity-0 transition group-hover:opacity-100">
                        <Wand2 size={12} /> Generate my designs
                      </span>
                    </div>
                    <div className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="font-semibold">{style.name}</div>
                        <div className="flex gap-1">
                          {style.palette.map((c) => (
                            <span
                              key={c}
                              className="h-3 w-3 rounded-full border border-black/30"
                              style={{ background: c }}
                            />
                          ))}
                        </div>
                      </div>
                      <div className="mt-1 text-xs text-cream-faint">{style.tagline}</div>
                    </div>
                  </button>
                );
              })}
          </div>
        </div>
      )}

      {/* ——— STEP: generating ——— */}
      {step === "generating" && chosenStyleId && (
        <div className="grid animate-fade-up gap-8 lg:grid-cols-[1.5fr_1fr]">
          <div className="relative aspect-[3/2] overflow-hidden rounded-2xl border border-ink-line">
            <div className="absolute inset-0 animate-pulse-soft">
              <RoomScene spec={STYLE_MAP[chosenStyleId].spec} className="h-full w-full" />
            </div>
            <div className="absolute inset-0 bg-gradient-to-t from-ink/70 via-transparent to-ink/40" />
            <div className="absolute inset-x-0 h-0.5 animate-scanline bg-brass/90 shadow-[0_0_24px_4px_rgba(200,169,110,0.55)]" />
          </div>
          <div className="card p-6">
            <div className="mb-1 flex items-center gap-2 text-brass">
              <Wand2 size={17} />
              <span className="eyebrow !text-brass">
                Designing in {STYLE_MAP[chosenStyleId].name}
              </span>
            </div>
            <p className="mb-6 text-sm text-cream-faint">
              Three concepts, each fully shoppable, composed around your
              room&apos;s analysis and your brief.
            </p>
            <StageList stages={GENERATE_STAGES} done={busyDone} />
          </div>
        </div>
      )}

      {/* ——— STEP: result ——— */}
      {step === "result" && source && analysis && concepts && chosenStyleId && (
        <ResultView
          source={source}
          analysis={analysis}
          concepts={concepts}
          styleId={chosenStyleId}
          brief={brief}
          onOtherStyle={() => setStep("styles")}
          onRestart={reset}
        />
      )}
    </div>
  );
}

/* ————————————————————————————————— analysis view ————————————————————————————————— */

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card p-4">
      <div className="text-[11px] uppercase tracking-wider text-cream-faint">{label}</div>
      <div className="mt-1 font-display text-lg leading-tight text-cream">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-cream-faint">{sub}</div>}
    </div>
  );
}

function AnalysisView({
  source,
  analysis,
  onContinue,
  onRestart,
}: {
  source: Source;
  analysis: RoomAnalysis;
  onContinue: () => void;
  onRestart: () => void;
}) {
  const a = analysis;
  return (
    <div className="animate-fade-up">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow mb-2">
            {a.engine === "claude" ? "Claude vision analysis" : "Spatial analysis"}
            {" · "}
            {(a.confidence * 100).toFixed(0)}% confidence
          </div>
          <h2 className="font-display text-3xl sm:text-4xl">
            {a.roomType} · {a.dimensions.areaM2} m²
          </h2>
        </div>
        <button onClick={onRestart} className="btn-ghost !px-4 !py-2 text-xs">
          <RefreshCcw size={13} /> Different room
        </button>
      </div>

      <div className="mt-6 grid gap-8 lg:grid-cols-[1.5fr_1fr]">
        <div>
          <div className="relative aspect-[3/2] overflow-hidden rounded-2xl border border-ink-line">
            <BeforeVisual source={source} detections={a.detections} />
          </div>
          <p className="mt-4 rounded-xl border border-ink-line bg-ink-soft p-4 text-sm leading-relaxed text-cream-dim">
            <span className="font-semibold text-brass-bright">Designer&apos;s read — </span>
            {a.summary}
          </p>
          {a.engine === "demo" && source.kind === "upload" && (
            <p className="mt-3 text-xs text-cream-faint">
              Demo engine: this analysis is simulated. Set{" "}
              <code className="rounded bg-ink-panel px-1.5 py-0.5">ANTHROPIC_API_KEY</code>{" "}
              on the server and Maison reads your actual photos with Claude vision.
            </p>
          )}
        </div>

        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <Metric
              label="Dimensions"
              value={`${a.dimensions.widthM} × ${a.dimensions.depthM} m`}
              sub={`${a.dimensions.heightM} m ceilings`}
            />
            <Metric
              label="Natural light"
              value={`${a.lighting.naturalScore}/100`}
              sub={`${a.windows.count} window${a.windows.count === 1 ? "" : "s"} · ${a.windows.orientation}`}
            />
            <Metric
              label="Flooring"
              value={a.flooring.material}
              sub={`${a.flooring.tone} · ${a.flooring.condition}`}
            />
            <Metric label="Walls" value={a.walls.finish} sub={a.walls.condition} />
          </div>

          <div className="card p-4">
            <div className="mb-2.5 text-[11px] uppercase tracking-wider text-cream-faint">
              Detected palette
            </div>
            <div className="flex gap-2">
              {a.colorPalette.map((c) => (
                <div key={c.hex} className="flex-1">
                  <div className="h-10 rounded-lg border border-black/30" style={{ background: c.hex }} />
                  <div className="mt-1 truncate text-[10px] text-cream-faint">{c.name}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="card p-4">
            <div className="mb-2.5 text-[11px] uppercase tracking-wider text-cream-faint">
              Existing furniture
            </div>
            <ul className="space-y-1.5">
              {a.furniture.map((f) => (
                <li key={f.item} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-cream-dim">{f.item}</span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                      f.verdict.toLowerCase().includes("keep")
                        ? "bg-sage/15 text-sage"
                        : "bg-brass/10 text-brass"
                    }`}
                  >
                    {f.verdict}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="card p-4">
            <div className="mb-2.5 text-[11px] uppercase tracking-wider text-cream-faint">
              Design opportunities
            </div>
            <ul className="space-y-2">
              {a.opportunities.map((o) => (
                <li key={o} className="flex gap-2 text-sm text-cream-dim">
                  <Sparkles size={13} className="mt-0.5 shrink-0 text-brass" />
                  {o}
                </li>
              ))}
            </ul>
          </div>

          <button onClick={onContinue} className="btn-primary w-full">
            Set my brief & choose a style <ArrowRight size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}


/* ————————————————————————————————— result view ————————————————————————————————— */

/** Live modifications the AI designer applies on top of a generated concept. */
interface Adjustments {
  warmthDelta: number;
  budget: BudgetTier | null;
  brandFilter: string[] | null;
  swaps: Partial<Record<ProductCategory, string>>;
  childFriendly: boolean;
}

const NO_ADJUSTMENTS: Adjustments = {
  warmthDelta: 0,
  budget: null,
  brandFilter: null,
  swaps: {},
  childFriendly: false,
};

const SUGGESTIONS = [
  "Make it warmer.",
  "Replace the sofa.",
  "Make it cheaper.",
  "Use only Swiss stores.",
  "Make it more luxurious.",
  "Create a child-friendly version.",
];

function DesignerChat({
  getContext,
  onActions,
}: {
  getContext: () => AssistantContext;
  onActions: (actions: AssistantAction[]) => void;
}) {
  const [messages, setMessages] = useState<{ role: "user" | "ai"; text: string }[]>([
    {
      role: "ai",
      text: "I'm your Maison designer — tell me what to change and I'll update the room instantly.",
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  const send = async (raw: string) => {
    const text = raw.trim();
    if (!text || busy) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text }]);
    setBusy(true);
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, context: getContext() }),
      });
      const data = (await res.json()) as AssistantResponse & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Assistant unavailable");
      if (data.actions.length) onActions(data.actions);
      setMessages((m) => [...m, { role: "ai", text: data.reply }]);
    } catch {
      setMessages((m) => [
        ...m,
        { role: "ai", text: "I couldn't reach the design engine just now — try again in a moment." },
      ]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card mt-4 overflow-hidden">
      <div className="flex items-center gap-2 border-b border-ink-line px-4 py-3">
        <MessageCircle size={15} className="text-brass" />
        <span className="text-sm font-semibold">Your AI designer</span>
        <span className="ml-auto text-[10px] uppercase tracking-widest text-cream-faint">
          Live edits
        </span>
      </div>
      <div ref={listRef} className="max-h-56 space-y-2.5 overflow-y-auto px-4 py-3">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
              msg.role === "user"
                ? "ml-auto bg-brass/15 text-cream"
                : "bg-ink-soft text-cream-dim"
            }`}
          >
            {msg.text}
          </div>
        ))}
        {busy && (
          <div className="flex items-center gap-2 text-xs text-cream-faint">
            <Loader2 size={13} className="animate-spin text-brass" /> Adjusting the room…
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5 px-4 pb-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => void send(s)}
            disabled={busy}
            className="rounded-full border border-ink-line px-2.5 py-1 text-[11px] text-cream-faint transition hover:border-brass/50 hover:text-brass-bright disabled:opacity-40"
          >
            {s}
          </button>
        ))}
      </div>
      <form
        className="flex items-center gap-2 border-t border-ink-line px-3 py-2.5"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder='Try "make it warmer" or "replace the sofa"…'
          className="flex-1 bg-transparent px-1 text-sm text-cream outline-none placeholder:text-cream-faint/60"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="rounded-full bg-brass p-2 text-ink transition hover:bg-brass-bright disabled:opacity-40"
          aria-label="Send to designer"
        >
          <Send size={13} />
        </button>
      </form>
    </div>
  );
}

function ResultView({
  source,
  analysis,
  concepts,
  styleId,
  brief,
  onOtherStyle,
  onRestart,
}: {
  source: Source;
  analysis: RoomAnalysis;
  concepts: DesignConcept[];
  styleId: string;
  brief: DesignBrief;
  onOtherStyle: () => void;
  onRestart: () => void;
}) {
  const style = STYLE_MAP[styleId];
  const [active, setActive] = useState(0);
  const [accent, setAccent] = useState<string | null>(brief.accent);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [exploring, setExploring] = useState(false);
  const [adjustments, setAdjustments] = useState<Adjustments>(NO_ADJUSTMENTS);
  const addManyToCart = useMaisonStore((s) => s.addManyToCart);
  const addToCart = useMaisonStore((s) => s.addToCart);

  const concept = concepts[active];

  /** Product list = concept basket → AI adjustments (budget, brands, swaps, child-safe). */
  const products = useMemo(() => {
    let list: Product[] =
      adjustments.budget !== null
        ? buildConceptProducts(styleId, concept.variant, adjustments.budget, brief.brands)
        : concept.productIds
            .map((id) => PRODUCT_MAP[id])
            .filter((p): p is Product => Boolean(p));
    if (adjustments.brandFilter) {
      list = list.filter((p) => adjustments.brandFilter!.includes(p.brand));
    }
    list = list.map((p) => {
      const swapId = adjustments.swaps[p.category];
      const swap = swapId ? PRODUCT_MAP[swapId] : undefined;
      if (!swap) return p;
      if (adjustments.brandFilter && !adjustments.brandFilter.includes(swap.brand)) return p;
      return swap;
    });
    if (adjustments.childFriendly) {
      list = list
        .filter((p) => p.category !== "decor")
        .map((p) => {
          if (p.category === "table" && ["table-noir", "table-girder", "table-carrara"].includes(p.id)) {
            const lumi = PRODUCT_MAP["table-lumi"];
            const jura = PRODUCT_MAP["table-jura"];
            return lumi.styles.includes(styleId) ? lumi : jura;
          }
          return p;
        });
    }
    const seen = new Set<string>();
    return list.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
  }, [adjustments, concept, styleId, brief.brands]);

  const spec = useMemo(() => {
    const s = applyAccent(concept.spec, accent);
    return { ...s, warmth: Math.max(0, Math.min(1, s.warmth + adjustments.warmthDelta)) };
  }, [concept, accent, adjustments.warmthDelta]);

  const included = products.filter((p) => !excluded.has(p.id));
  const total = included.reduce((n, p) => n + p.price, 0);
  const accessories = matchingAccessories(styleId, products.map((p) => p.id));

  const applyActions = (actions: AssistantAction[]) => {
    for (const a of actions) {
      if (a.type === "set_accent") setAccent(a.hex);
    }
    setAdjustments((prev) => {
      const next: Adjustments = { ...prev, swaps: { ...prev.swaps } };
      for (const a of actions) {
        switch (a.type) {
          case "adjust_warmth":
            next.warmthDelta = Math.max(-0.6, Math.min(0.6, next.warmthDelta + a.delta));
            break;
          case "set_budget":
            next.budget = a.tier;
            next.swaps = {};
            break;
          case "restrict_brands":
            next.brandFilter = a.brands;
            break;
          case "child_friendly":
            next.childFriendly = true;
            break;
          case "swap_product": {
            const current = products.find((p) => p.category === a.category);
            if (current) {
              const swap = resolveSwap(current, styleId, a.direction, prev.brandFilter ?? []);
              if (swap) next.swaps[a.category] = swap.id;
            }
            break;
          }
        }
      }
      return next;
    });
    setExcluded(new Set());
  };

  const getContext = (): AssistantContext => ({
    styleId,
    styleName: style.name,
    budget: adjustments.budget ?? brief.budget,
    total,
    productSummary: products.map((p) => `${p.category}: ${p.name} ($${p.price}, ${p.brand})`).join("; "),
    roomSummary: analysis.summary.slice(0, 300),
  });

  const adjustmentChips: string[] = [
    adjustments.budget ? `Budget → ${adjustments.budget}` : "",
    adjustments.brandFilter ? `Brands: ${adjustments.brandFilter.join(" · ")}` : "",
    adjustments.childFriendly ? "Child-friendly" : "",
    adjustments.warmthDelta > 0 ? "Warmer light" : adjustments.warmthDelta < 0 ? "Cooler light" : "",
    Object.keys(adjustments.swaps).length
      ? `${Object.keys(adjustments.swaps).length} piece${Object.keys(adjustments.swaps).length === 1 ? "" : "s"} swapped`
      : "",
  ].filter(Boolean);

  return (
    <div className="animate-fade-up">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow mb-2">Your {style.name} redesign</div>
          <h2 className="font-display text-3xl sm:text-4xl">
            {analysis.roomType}, reimagined.
          </h2>
        </div>
        <div className="flex gap-2">
          <button onClick={onOtherStyle} className="btn-ghost !px-4 !py-2 text-xs">
            <ArrowLeft size={13} /> Try another style
          </button>
          <button onClick={onRestart} className="btn-ghost !px-4 !py-2 text-xs">
            <RefreshCcw size={13} /> New room
          </button>
        </div>
      </div>

      {/* Concept tabs */}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        {concepts.map((c, i) => (
          <button
            key={c.id}
            onClick={() => {
              setActive(i);
              setExcluded(new Set());
              setAdjustments(NO_ADJUSTMENTS);
            }}
            className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
              i === active
                ? "border-brass bg-brass/10 text-brass-bright"
                : "border-ink-line text-cream-dim hover:border-brass/40"
            }`}
          >
            Concept {i + 1} · {c.name}
          </button>
        ))}
        {adjustmentChips.length > 0 && (
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            {adjustmentChips.map((chip) => (
              <span key={chip} className="chip !border-brass/40 !text-brass-bright">
                <Sparkles size={10} /> {chip}
              </span>
            ))}
            <button
              onClick={() => {
                setAdjustments(NO_ADJUSTMENTS);
                setAccent(brief.accent);
              }}
              className="text-[11px] text-cream-faint underline-offset-2 hover:text-cream hover:underline"
            >
              reset
            </button>
          </div>
        )}
      </div>

      <div className="mt-5 grid gap-8 lg:grid-cols-[1.5fr_1fr]">
        <div>
          <BeforeAfterSlider
            className="aspect-[3/2]"
            before={<BeforeVisual source={source} />}
            after={<RoomScene spec={spec} variant={concept.variant} className="h-full w-full" />}
            beforeLabel="Your room"
            afterLabel={style.name}
          />

          <button onClick={() => setExploring(true)} className="btn-primary mt-4 w-full">
            <Orbit size={16} /> Enter your room — live 3D before & after
          </button>

          <p className="mt-4 rounded-xl border border-ink-line bg-ink-soft p-4 text-sm leading-relaxed text-cream-dim">
            <span className="font-semibold text-brass-bright">Concept note — </span>
            {concept.narrative}
          </p>

          <DesignerChat getContext={getContext} onActions={applyActions} />

          {/* Customize */}
          <div className="card mt-4 p-4">
            <div className="mb-3 text-[11px] uppercase tracking-wider text-cream-faint">
              Customize accent
            </div>
            <div className="flex flex-wrap gap-2">
              {ACCENTS.map((a) => (
                <button
                  key={a.name}
                  onClick={() => setAccent(a.hex)}
                  className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition ${
                    accent === a.hex
                      ? "border-brass text-brass-bright"
                      : "border-ink-line text-cream-dim hover:border-brass/40"
                  }`}
                >
                  {a.hex && (
                    <span className="h-3.5 w-3.5 rounded-full border border-black/40" style={{ background: a.hex }} />
                  )}
                  {a.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Shop the look */}
        <div>
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-ink-line px-5 py-4">
              <div>
                <div className="font-semibold">Shop this look</div>
                <div className="text-xs text-cream-faint">
                  {included.length} of {products.length} pieces selected
                </div>
              </div>
              <div className="text-right">
                <div className="font-display text-xl text-brass-bright">{formatPrice(total)}</div>
                <div className="text-[10px] uppercase tracking-wider text-cream-faint">Full room</div>
              </div>
            </div>
            <ul className="max-h-[380px] divide-y divide-ink-line/60 overflow-y-auto">
              {products.map((p) => {
                const on = !excluded.has(p.id);
                return (
                  <li key={p.id} className={`flex items-center gap-3 px-4 py-3 ${on ? "" : "opacity-45"}`}>
                    <button
                      onClick={() =>
                        setExcluded((prev) => {
                          const next = new Set(prev);
                          if (next.has(p.id)) next.delete(p.id);
                          else next.add(p.id);
                          return next;
                        })
                      }
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition ${
                        on ? "border-brass bg-brass text-ink" : "border-ink-line"
                      }`}
                      aria-label={on ? `Remove ${p.name} from look` : `Add ${p.name} to look`}
                    >
                      {on && <Check size={12} strokeWidth={3} />}
                    </button>
                    <div className="h-14 w-[70px] shrink-0 overflow-hidden rounded-md">
                      <ProductGlyph product={p} className="h-full w-full" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{p.name}</div>
                      <div className="text-xs text-cream-faint">
                        {p.brand} · ★ {p.rating}
                      </div>
                      <button
                        onClick={() => applyActions([{ type: "swap_product", category: p.category, direction: "different" }])}
                        className="mt-0.5 flex items-center gap-1 text-[10px] text-cream-faint transition hover:text-brass-bright"
                      >
                        <RefreshCcw size={9} /> Swap alternative
                      </button>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="text-sm font-semibold">{formatPrice(p.price)}</span>
                      <button
                        onClick={() => addToCart(p)}
                        className="text-[11px] text-brass transition hover:text-brass-bright"
                      >
                        Add
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="border-t border-ink-line p-4">
              <button
                onClick={() => addManyToCart(included)}
                disabled={included.length === 0}
                className="btn-primary w-full"
              >
                <ShoppingBag size={15} />
                Add the look · {formatPrice(total)}
              </button>
              <TrustRow className="mt-3" />
            </div>
          </div>

          {/* Shopping AI: matching accessories */}
          {accessories.length > 0 && (
            <div className="card mt-4 p-4">
              <div className="mb-3 text-[11px] uppercase tracking-wider text-cream-faint">
                Complete the look — AI picks
              </div>
              <ul className="space-y-2.5">
                {accessories.map((p) => (
                  <li key={p.id} className="flex items-center gap-3">
                    <div className="h-11 w-14 shrink-0 overflow-hidden rounded-md">
                      <ProductGlyph product={p} className="h-full w-full" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm">{p.name}</div>
                      <div className="text-[11px] text-cream-faint">{formatPrice(p.price)}</div>
                    </div>
                    <button onClick={() => addToCart(p)} className="btn-ghost !px-3 !py-1.5 text-[11px]">
                      Add
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {exploring && (
        <Immersive3D
          beforeSpec={source.kind === "sample" ? source.room.spec : datedSpecFromAnalysis(analysis)}
          afterSpec={spec}
          variant={concept.variant}
          styleName={style.name}
          beforeLabel="Your room"
          products={products}
          onSwap={(category, direction) =>
            applyActions([{ type: "swap_product", category, direction }])
          }
          onAddProduct={addToCart}
          onBuyAll={() => addManyToCart(products)}
          onClose={() => setExploring(false)}
        />
      )}
    </div>
  );
}
