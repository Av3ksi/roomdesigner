"use client";

import { AlertTriangle, Eraser, Loader2, MapPin, Plus, Ruler, Search, Send, Sparkles, Upload, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  base64PngToFile,
  base64ToFile,
  detectImageMimeFromBase64,
  loadImageAspectRatio,
  reshapeBoxToAspectRatio,
} from "@/lib/clientImage";
import { clampBox, DEFAULT_CATEGORY_BOX, describeRoughLocation } from "@/lib/placementBoxes";
import RoomHotspots, { type HotspotItem } from "@/components/RoomHotspots";
import { useMaisonStore } from "@/lib/store";
import type { DetectionBox, Product, ProductCategory } from "@/lib/types";

const ROOM_ID_STORAGE_KEY = "maison_room_id";
const MAX_EXTRA_PHOTOS = 4;

function formatChf(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "CHF", maximumFractionDigits: 0 });
}

interface Constraint {
  kind: string;
  description: string;
}

interface AddProposal {
  kind: "add";
  product: Product;
  category: string;
  box: DetectionBox;
  wallAngleDeg: number;
  rationale: string;
}

/** Removing something already physically in the room photo (Phase 2) — no product, nothing to buy. */
interface RemoveProposal {
  kind: "remove";
  category: string;
  rationale: string;
  /** A specific item name, when this came from the room-inventory checklist rather than a chat guess. */
  description?: string;
  /** Exact detected box, when known — lets removal skip a blind re-locate. */
  box?: DetectionBox;
  /** Index into `inventory`, when this came from the checklist — lets the checkbox toggle back off. */
  inventoryIndex?: number;
}

type EditProposal = AddProposal | RemoveProposal;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface PlacedObject {
  box: DetectionBox;
  product: Product;
}

interface RoomVersion {
  /** Base64 PNG for generated versions; null for version 0 (the original photo, shown via objectURL). */
  imageBase64: string | null;
  objects: PlacedObject[];
  label: string;
}

interface PersistedRoomApi {
  id: string;
  originalPhotoBase64: string;
  roomContext: unknown;
  messages: { role: "user" | "assistant"; content: string }[];
  constraints: Constraint[];
  versions: { imageBase64: string; label: string; objects: PlacedObject[] }[];
}

/** Every real object the upload kickoff found already in the room — the "what's changeable" checklist. */
interface InventoryItem {
  box: DetectionBox;
  description: string;
  category: ProductCategory;
}

/** roomContext is kept opaque client-side (round-tripped, not imported from the server-only lib/ai/designer.ts) — this is just the slice the catalog-add panel needs to read. */
interface ClientRoomContext {
  placements?: Record<string, { box: DetectionBox; wallAngleDeg: number }>;
}

type UploadStage = "empty" | "staging" | "analyzing" | "ready";

export default function Designer() {
  const [roomFile, setRoomFile] = useState<File | null>(null);
  const [roomPreviewUrl, setRoomPreviewUrl] = useState<string | null>(null);
  const [uploadStage, setUploadStage] = useState<UploadStage>("empty");
  const [extraPhotoFiles, setExtraPhotoFiles] = useState<File[]>([]);
  const [extraPhotoPreviewUrls, setExtraPhotoPreviewUrls] = useState<string[]>([]);
  const [floorplanFile, setFloorplanFile] = useState<File | null>(null);
  const [floorplanPreviewUrl, setFloorplanPreviewUrl] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [constraints, setConstraints] = useState<Constraint[]>([]);
  const [roomContext, setRoomContext] = useState<unknown>(null);
  const [proposals, setProposals] = useState<EditProposal[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [checkedRemovals, setCheckedRemovals] = useState<Set<number>>(new Set());
  const [versions, setVersions] = useState<RoomVersion[]>([]);
  const [currentVersion, setCurrentVersion] = useState(0);
  const [thinking, setThinking] = useState(false);
  const [generating, setGenerating] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [identityWarning, setIdentityWarning] = useState<string | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [rehydrating, setRehydrating] = useState(false);
  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalogResults, setCatalogResults] = useState<Product[]>([]);
  const [catalogSearching, setCatalogSearching] = useState(false);
  const [showCatalogPanel, setShowCatalogPanel] = useState(false);
  // Placement adjuster ("ruler") — every add-proposal previews its box on the
  // real photo, draggable/resizable, before the render actually fires. A bad
  // AI-guessed box (floating mid-air, wrong spot) gets caught here instead
  // of wasting a paid render.
  const [activeProposalIndex, setActiveProposalIndex] = useState<number | null>(null);
  const [adjustedBox, setAdjustedBox] = useState<DetectionBox | null>(null);
  const [adjustLoading, setAdjustLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ mode: "move" | "resize"; startX: number; startY: number; box: DetectionBox; rect: DOMRect } | null>(null);
  const addToCart = useMaisonStore((s) => s.addToCart);

  // On mount: if a room was persisted last visit (DB-backed sessions only),
  // fetch its full state back so a refresh doesn't lose the conversation.
  useEffect(() => {
    const storedId = typeof window !== "undefined" ? localStorage.getItem(ROOM_ID_STORAGE_KEY) : null;
    if (!storedId) return;
    setRehydrating(true);
    (async () => {
      try {
        const res = await fetch(`/api/rooms/${storedId}`);
        if (!res.ok) throw new Error("Room not found");
        const { room }: { room: PersistedRoomApi } = await res.json();
        const mime = detectImageMimeFromBase64(room.originalPhotoBase64);
        setRoomFile(base64ToFile(room.originalPhotoBase64, "room", mime));
        setRoomPreviewUrl(`data:${mime};base64,${room.originalPhotoBase64}`);
        setRoomId(room.id);
        setMessages(room.messages.map((m) => ({ role: m.role, content: m.content })));
        setConstraints(room.constraints);
        setRoomContext(room.roomContext);
        const restored: RoomVersion[] = [
          { imageBase64: null, objects: [], label: "Original" },
          ...room.versions.map((v) => ({ imageBase64: v.imageBase64, objects: v.objects, label: v.label })),
        ];
        setVersions(restored);
        setCurrentVersion(restored.length - 1);
        setUploadStage("ready");
      } catch {
        localStorage.removeItem(ROOM_ID_STORAGE_KEY);
      } finally {
        setRehydrating(false);
      }
    })();
  }, []);

  /** Picking a primary photo starts a fresh room and moves to the staging step (add angles/floor plan, then analyze) — never straight into the chat view. */
  function onRoomFileChange(file: File | null) {
    setRoomFile(file);
    if (roomPreviewUrl) URL.revokeObjectURL(roomPreviewUrl);
    setRoomPreviewUrl(file ? URL.createObjectURL(file) : null);
    setVersions(file ? [{ imageBase64: null, objects: [], label: "Original" }] : []);
    setCurrentVersion(0);
    setProposals([]);
    setInventory([]);
    setCheckedRemovals(new Set());
    setRoomContext(null); // placement analysis is per-photo
    setError(null);
    setIdentityWarning(null);
    setMessages([]);
    setConstraints([]);
    extraPhotoPreviewUrls.forEach((u) => URL.revokeObjectURL(u));
    setExtraPhotoFiles([]);
    setExtraPhotoPreviewUrls([]);
    if (floorplanPreviewUrl) URL.revokeObjectURL(floorplanPreviewUrl);
    setFloorplanFile(null);
    setFloorplanPreviewUrl(null);
    // A manually uploaded photo always starts a fresh room, never appends to a restored one.
    setRoomId(null);
    if (typeof window !== "undefined") localStorage.removeItem(ROOM_ID_STORAGE_KEY);
    setUploadStage(file ? "staging" : "empty");
  }

  function addExtraPhoto(file: File) {
    if (extraPhotoFiles.length >= MAX_EXTRA_PHOTOS) return;
    setExtraPhotoFiles((prev) => [...prev, file]);
    setExtraPhotoPreviewUrls((prev) => [...prev, URL.createObjectURL(file)]);
  }

  function removeExtraPhoto(index: number) {
    setExtraPhotoPreviewUrls((prev) => {
      URL.revokeObjectURL(prev[index]);
      return prev.filter((_, i) => i !== index);
    });
    setExtraPhotoFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function onFloorplanChange(file: File | null) {
    if (floorplanPreviewUrl) URL.revokeObjectURL(floorplanPreviewUrl);
    setFloorplanFile(file);
    setFloorplanPreviewUrl(file ? URL.createObjectURL(file) : null);
  }

  /** Fires once, right after staging: inventories the existing room and proactively proposes a few catalog additions — no prompting required for either. */
  async function analyzeRoom() {
    if (!roomFile) return;
    setUploadStage("analyzing");
    setError(null);
    try {
      const form = new FormData();
      form.append("room", roomFile);
      extraPhotoFiles.forEach((f) => form.append("extraPhotos", f));
      if (floorplanFile) form.append("floorplan", floorplanFile);

      const res = await fetch("/api/designer/kickoff", { method: "POST", body: form });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `Request failed: ${res.status}`);

      setMessages([{ role: "assistant", content: body.reply }]);
      setProposals(body.proposals ?? []);
      setConstraints(body.constraints ?? []);
      setRoomContext(body.roomContext ?? null);
      setInventory(body.inventory ?? []);
      if (body.roomId) {
        setRoomId(body.roomId);
        if (typeof window !== "undefined") localStorage.setItem(ROOM_ID_STORAGE_KEY, body.roomId);
      }
      setUploadStage("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setUploadStage("staging");
    }
  }

  /** Checking an inventory item queues a precise remove proposal (exact detected box); unchecking withdraws it. */
  function toggleRemoval(index: number) {
    const item = inventory[index];
    setCheckedRemovals((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
        setProposals((p) => p.filter((prop) => !(prop.kind === "remove" && prop.inventoryIndex === index)));
      } else {
        next.add(index);
        const proposal: RemoveProposal = {
          kind: "remove",
          category: item.category,
          description: item.description,
          box: item.box,
          inventoryIndex: index,
          rationale: "You marked this for removal.",
        };
        setProposals((p) => [...p, proposal]);
      }
      return next;
    });
  }

  async function searchCatalog(q: string) {
    setCatalogQuery(q);
    if (!q.trim()) {
      setCatalogResults([]);
      return;
    }
    setCatalogSearching(true);
    try {
      const res = await fetch(`/api/products/search?q=${encodeURIComponent(q)}`);
      const body = await res.json();
      setCatalogResults(Array.isArray(body.products) ? body.products : []);
    } catch {
      setCatalogResults([]);
    } finally {
      setCatalogSearching(false);
    }
  }

  /** Adds a specific catalog product directly, skipping the chat/agent loop — the box comes from the room's known placement analysis when available. */
  function addFromCatalog(product: Product) {
    const rc = roomContext as ClientRoomContext | null;
    const placed = rc?.placements?.[product.category];
    const proposal: AddProposal = {
      kind: "add",
      product,
      category: product.category,
      box: placed?.box ?? DEFAULT_CATEGORY_BOX[product.category],
      wallAngleDeg: placed?.wallAngleDeg ?? 0,
      rationale: "Added from the catalog.",
    };
    setProposals((p) => [...p, proposal]);
    setCatalogQuery("");
    setCatalogResults([]);
  }

  /** Opens the placement adjuster for an add-proposal: shows its box on the real photo, draggable/resizable, before any render fires. */
  async function openPlacementPreview(index: number) {
    const p = proposals[index];
    if (p.kind !== "add") return;
    setActiveProposalIndex(index);
    setAdjustLoading(true);
    let box = p.box;
    if (p.product.imageUrl) {
      try {
        box = reshapeBoxToAspectRatio(box, await loadImageAspectRatio(p.product.imageUrl));
      } catch {
        // un-reshaped box still works as a starting point
      }
    }
    setAdjustedBox(box);
    setAdjustLoading(false);
  }

  function cancelPlacementPreview() {
    setActiveProposalIndex(null);
    setAdjustedBox(null);
  }

  function onBoxPointerDown(e: React.PointerEvent, mode: "move" | "resize") {
    if (!adjustedBox || !overlayRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { mode, startX: e.clientX, startY: e.clientY, box: adjustedBox, rect: overlayRef.current.getBoundingClientRect() };
    overlayRef.current.setPointerCapture(e.pointerId);
  }

  function onOverlayPointerMove(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    const dx = (e.clientX - d.startX) / d.rect.width;
    const dy = (e.clientY - d.startY) / d.rect.height;
    setAdjustedBox(
      clampBox(d.mode === "move" ? { ...d.box, x: d.box.x + dx, y: d.box.y + dy } : { ...d.box, w: d.box.w + dx, h: d.box.h + dy }),
    );
  }

  function onOverlayPointerUp() {
    dragRef.current = null;
  }

  /** Wipes the conversation only — the room photo, versions and any pending checklist/inventory stay untouched. */
  function clearChat() {
    setMessages([]);
    setProposals([]);
    setInput("");
    setError(null);
    setIdentityWarning(null);
    if (roomId) {
      fetch(`/api/rooms/${roomId}/messages`, { method: "DELETE" }).catch(() => {
        // Chat is already cleared client-side — a persistence hiccup here isn't worth surfacing.
      });
    }
  }

  async function sendMessage() {
    const text = input.trim();
    if (!text || thinking) return;
    setInput("");
    setError(null);
    setThinking(true);
    const nextMessages: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(nextMessages);

    try {
      const form = new FormData();
      form.append("message", text);
      form.append("history", JSON.stringify(messages));
      form.append("constraints", JSON.stringify(constraints));
      form.append("roomContext", JSON.stringify(roomContext));
      if (roomFile) form.append("room", roomFile);
      if (roomId) form.append("roomId", roomId);

      const res = await fetch("/api/designer", { method: "POST", body: form });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `Request failed: ${res.status}`);

      setMessages([...nextMessages, { role: "assistant", content: body.reply }]);
      setProposals(body.proposals ?? []);
      setConstraints(body.constraints ?? []);
      setRoomContext(body.roomContext ?? null);
      if (body.roomId && body.roomId !== roomId) {
        setRoomId(body.roomId);
        if (typeof window !== "undefined") localStorage.setItem(ROOM_ID_STORAGE_KEY, body.roomId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setMessages(nextMessages); // keep the user's message; the reply failed
    } finally {
      setThinking(false);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
  }

  /** Appends a new rendered version and (best-effort) persists it — shared by both the add and remove flows. */
  function commitVersion(imageBase64: string, label: string, objects: PlacedObject[]) {
    const next: RoomVersion = { imageBase64, objects, label };
    setVersions((v) => [...v, next]);
    setCurrentVersion(versions.length); // index of the new version
    if (roomId) {
      fetch(`/api/rooms/${roomId}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: next.imageBase64, label: next.label, objects: next.objects }),
      }).catch(() => {
        // The render already succeeded and is visible — a persistence hiccup here isn't worth surfacing.
      });
    }
  }

  /**
   * The explicit money moment: one confirmed proposal = one billed render
   * call. For "add" proposals, `overrideBox` is the (possibly hand-dragged)
   * box from the placement adjuster — when given, it's already reshaped to
   * the product's real aspect ratio and positioned by the user, so skip the
   * automatic reshape below.
   */
  async function generateProposal(proposal: EditProposal, index: number, overrideBox?: DetectionBox) {
    if (!roomFile || generating !== null) return;
    setGenerating(index);
    setError(null);
    setIdentityWarning(null);

    try {
      // Base image: latest generated version so edits stack, else the original photo.
      const latest = versions[versions.length - 1];
      const baseFile = latest?.imageBase64 ? base64PngToFile(latest.imageBase64, "version.png") : roomFile;
      const prevObjects = latest?.objects ?? [];

      if (proposal.kind === "remove") {
        const form = new FormData();
        form.append("room", baseFile);
        form.append("category", proposal.category);
        if (proposal.box) {
          form.append("boxX", String(proposal.box.x));
          form.append("boxY", String(proposal.box.y));
          form.append("boxW", String(proposal.box.w));
          form.append("boxH", String(proposal.box.h));
        }

        const res = await fetch("/api/remove-object", { method: "POST", body: form });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? `Removal failed: ${res.status}`);

        commitVersion(body.imageBase64, `V${versions.length} · Removed ${proposal.description ?? proposal.category}`, prevObjects);
        setProposals((p) => p.filter((_, i) => i !== index));
        return;
      }

      // Fit the box to the product's real shape before rendering — unless
      // the placement adjuster already gave us one.
      let box = overrideBox ?? proposal.box;
      if (!overrideBox && proposal.product.imageUrl) {
        try {
          box = reshapeBoxToAspectRatio(box, await loadImageAspectRatio(proposal.product.imageUrl));
        } catch {
          // un-reshaped box still works
        }
      }

      const form = new FormData();
      form.append("room", baseFile);
      form.append("productImageUrl", proposal.product.imageUrl ?? "");
      form.append("category", proposal.category);
      form.append("boxX", String(box.x));
      form.append("boxY", String(box.y));
      form.append("boxW", String(box.w));
      form.append("boxH", String(box.h));
      form.append("wallAngleDeg", String(proposal.wallAngleDeg));

      const res = await fetch("/api/composite", { method: "POST", body: form });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `Render failed: ${res.status}`);

      commitVersion(
        body.imageBase64,
        `V${versions.length} · ${proposal.product.name.slice(0, 24)}`,
        [...prevObjects, { box: body.maskBox, product: proposal.product }],
      );
      setProposals((p) => p.filter((_, i) => i !== index));
      if (activeProposalIndex === index) {
        setActiveProposalIndex(null);
        setAdjustedBox(null);
      }
      if (body.identityCheck && body.identityCheck.pass === false) {
        setIdentityWarning(body.identityCheck.note);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(null);
    }
  }

  const version = versions[currentVersion];
  const canvasSrc = version?.imageBase64 ? `data:image/png;base64,${version.imageBase64}` : roomPreviewUrl;

  return (
    <div className="container-page py-10">
      <div className="max-w-2xl">
        <div className="eyebrow mb-3">Designer</div>
        <h1 className="font-display text-4xl leading-tight sm:text-5xl">Talk to your room.</h1>
        <p className="mt-4 text-cream-dim">
          Upload a room photo — extra angles and a floor plan help but aren&apos;t required. The AI
          designer will tell you what&apos;s already there, suggest a few pieces to make it more
          stylish, and take it from there: check items to remove, add straight from the catalog, or
          just say what you want. Each proposal renders only when you confirm it (~$0.01 per render).
        </p>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[420px_1fr]">
        {/* Chat rail */}
        <div className="card flex h-[640px] flex-col p-0">
          {messages.length > 0 && (
            <div className="flex items-center justify-end border-b border-ink-line px-4 py-2">
              <button
                onClick={clearChat}
                className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium text-cream-faint transition hover:text-brass-bright"
              >
                <Eraser size={12} /> Clear chat
              </button>
            </div>
          )}
          <div className="flex-1 space-y-4 overflow-y-auto p-5">
            {messages.length === 0 && uploadStage !== "analyzing" && (
              <div className="text-sm text-cream-faint">
                {roomFile
                  ? 'Try: "Richte mir das Zimmer skandinavisch ein" · "Add a sofa and a floor lamp under CHF 800" · "Only oak wood."'
                  : "Upload a room photo to start."}
              </div>
            )}

            {uploadStage === "analyzing" && (
              <div className="flex items-center gap-2 text-sm text-cream-faint">
                <Loader2 size={14} className="animate-spin text-brass" />
                Looking at your room — finding what&apos;s there and a few pieces worth adding…
              </div>
            )}

            {inventory.length > 0 && (
              <div className="rounded-xl border border-ink-line bg-ink-panel p-3.5">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-cream-faint">Already in your room</div>
                <div className="space-y-0.5">
                  {inventory.map((item, i) => (
                    <label
                      key={i}
                      className="flex cursor-pointer items-start gap-2.5 rounded-lg px-1.5 py-1.5 transition hover:bg-ink-soft"
                    >
                      <input
                        type="checkbox"
                        checked={checkedRemovals.has(i)}
                        onChange={() => toggleRemoval(i)}
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-brass"
                      />
                      <span className="flex-1 text-xs text-cream-dim">
                        {item.description}{" "}
                        <span className="inline-flex items-center gap-0.5 text-cream-faint">
                          <MapPin size={9} /> {describeRoughLocation(item.box)}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
                <p className="mt-2 text-[10px] text-cream-faint">Check anything you&apos;d like to remove or replace.</p>
              </div>
            )}

            {messages.map((m, i) => (
              <div
                key={i}
                className={`max-w-[90%] rounded-2xl px-4 py-2.5 text-sm ${
                  m.role === "user" ? "ml-auto bg-brass/15 text-cream" : "bg-ink-panel text-cream-dim"
                }`}
              >
                {m.content}
              </div>
            ))}
            {thinking && <div className="text-xs text-cream-faint">Designing…</div>}

            {proposals.map((p, i) => (
              <div key={i} className="rounded-xl border border-brass/30 bg-brass/5 p-3">
                {p.kind === "add" ? (
                  <div className="flex items-center gap-3">
                    {p.product.imageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.product.imageUrl} alt={p.product.name} className="h-14 w-14 rounded-lg object-cover" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">{p.product.name}</div>
                      <div className="text-xs text-cream-faint">
                        {formatChf(p.product.price)} · {p.category}
                        {p.product.dimensionsCm ? ` · ${p.product.dimensionsCm.l}cm wide` : ""}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm font-semibold">Remove {p.description ?? `existing ${p.category}`}</div>
                )}
                {p.rationale && <div className="mt-2 text-xs text-cream-dim">{p.rationale}</div>}
                {p.kind === "add" ? (
                  <button
                    onClick={() => openPlacementPreview(i)}
                    disabled={generating !== null || !roomFile || activeProposalIndex === i}
                    className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-full bg-brass px-4 py-2 text-xs font-semibold text-ink disabled:opacity-40"
                  >
                    <Ruler size={13} />
                    {activeProposalIndex === i ? "Adjusting…" : "Preview placement"}
                  </button>
                ) : (
                  <button
                    onClick={() => generateProposal(p, i)}
                    disabled={generating !== null || !roomFile}
                    className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-full bg-brass px-4 py-2 text-xs font-semibold text-ink disabled:opacity-40"
                  >
                    <Sparkles size={13} />
                    {generating === i ? "Rendering (~15-60s)…" : "Remove from room (~$0.02)"}
                  </button>
                )}
              </div>
            ))}

            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-xs text-red-300">
                <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                {error}
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {constraints.length > 0 && (
            <div className="flex flex-wrap gap-1.5 border-t border-ink-line px-5 py-2.5">
              {constraints.map((c, i) => (
                <span key={i} className="chip !text-[9px]">
                  {c.description}
                </span>
              ))}
            </div>
          )}

          {showCatalogPanel && (
            <div className="border-t border-ink-line p-4">
              <div className="relative">
                <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-cream-faint" />
                <input
                  value={catalogQuery}
                  onChange={(e) => searchCatalog(e.target.value)}
                  placeholder="Search the catalog to add directly…"
                  autoFocus
                  className="w-full rounded-full border border-ink-line bg-ink-panel py-2 pl-8 pr-3 text-xs outline-none placeholder:text-cream-faint focus:border-brass/50"
                />
              </div>
              {catalogQuery && (
                <div className="mt-2 max-h-52 overflow-y-auto rounded-lg border border-ink-line">
                  {catalogSearching ? (
                    <div className="flex items-center justify-center gap-2 p-3 text-xs text-cream-faint">
                      <Loader2 size={12} className="animate-spin" /> Searching…
                    </div>
                  ) : catalogResults.length === 0 ? (
                    <div className="p-3 text-xs text-cream-faint">No matches.</div>
                  ) : (
                    <ul className="divide-y divide-ink-line/60">
                      {catalogResults.map((p) => (
                        <li key={p.id}>
                          <button
                            onClick={() => addFromCatalog(p)}
                            className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition hover:bg-ink-panel"
                          >
                            {p.imageUrl && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={p.imageUrl} alt={p.name} className="h-9 w-9 shrink-0 rounded-md object-cover" />
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-xs">{p.name}</div>
                              <div className="text-[10px] text-cream-faint">{formatChf(p.price)}</div>
                            </div>
                            <Plus size={13} className="shrink-0 text-brass" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="flex items-center gap-2 border-t border-ink-line p-4">
            <button
              onClick={() => setShowCatalogPanel((v) => !v)}
              disabled={!roomFile}
              aria-label="Add a product from the catalog"
              title="Add from catalog"
              className={`shrink-0 rounded-full border p-2.5 transition disabled:opacity-40 ${
                showCatalogPanel ? "border-brass text-brass-bright" : "border-ink-line text-cream-dim hover:border-brass/40"
              }`}
            >
              {showCatalogPanel ? <X size={16} /> : <Plus size={16} />}
            </button>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
              placeholder={roomFile ? "Tell the designer what you want…" : "Upload a photo first"}
              disabled={!roomFile || thinking}
              className="flex-1 rounded-full border border-ink-line bg-ink-panel px-4 py-2.5 text-sm outline-none placeholder:text-cream-faint focus:border-brass/50 disabled:opacity-50"
            />
            <button
              onClick={sendMessage}
              disabled={!roomFile || thinking || !input.trim()}
              className="rounded-full bg-brass p-2.5 text-ink disabled:opacity-40"
              aria-label="Send"
            >
              <Send size={16} />
            </button>
          </div>
        </div>

        {/* Canvas + filmstrip */}
        <div className="space-y-4">
          {identityWarning && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              <div>
                <span className="font-semibold">This render may not match the product you picked.</span>{" "}
                {identityWarning}
              </div>
            </div>
          )}
          <div className="card relative flex min-h-[420px] items-center justify-center overflow-hidden bg-ink-panel p-0">
            {rehydrating && !canvasSrc ? (
              <div className="p-16 text-center text-sm text-cream-faint">Restoring your room…</div>
            ) : uploadStage === "staging" ? (
              <div className="w-full p-6">
                <div className="flex gap-4">
                  <div className="relative h-32 w-40 shrink-0 overflow-hidden rounded-lg border border-brass/40">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={roomPreviewUrl ?? ""} alt="Your room" className="h-full w-full object-cover" />
                    <span className="absolute left-1.5 top-1.5 rounded-full bg-ink/80 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-brass-bright">
                      Primary
                    </span>
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-semibold">Your room</div>
                    <p className="mt-1 text-xs text-cream-faint">
                      This photo is what gets edited. Add more angles or a floor plan below — optional, but the more
                      you give, the better the analysis.
                    </p>
                    <label className="mt-2 inline-block cursor-pointer text-xs font-semibold text-brass hover:underline">
                      Change photo
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="hidden"
                        onChange={(e) => onRoomFileChange(e.target.files?.[0] ?? null)}
                      />
                    </label>
                  </div>
                </div>

                <div className="mt-5">
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-cream-faint">
                    Extra angles (optional)
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {extraPhotoPreviewUrls.map((url, i) => (
                      <div key={i} className="group relative h-16 w-20 overflow-hidden rounded-lg border border-ink-line">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt={`Angle ${i + 1}`} className="h-full w-full object-cover" />
                        <button
                          onClick={() => removeExtraPhoto(i)}
                          className="absolute right-1 top-1 rounded-full bg-ink/80 p-0.5 text-cream opacity-0 transition group-hover:opacity-100"
                          aria-label="Remove photo"
                        >
                          <X size={11} />
                        </button>
                      </div>
                    ))}
                    {extraPhotoFiles.length < MAX_EXTRA_PHOTOS && (
                      <label className="flex h-16 w-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-ink-line text-cream-faint transition hover:border-brass/40 hover:text-brass-bright">
                        <Plus size={16} />
                        <span className="text-[9px]">Add angle</span>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) addExtraPhoto(f);
                            e.target.value = "";
                          }}
                        />
                      </label>
                    )}
                  </div>
                </div>

                <div className="mt-5">
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-cream-faint">
                    Floor plan (optional)
                  </div>
                  {floorplanPreviewUrl ? (
                    <div className="group relative inline-block h-16 w-20 overflow-hidden rounded-lg border border-ink-line">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={floorplanPreviewUrl} alt="Floor plan" className="h-full w-full object-cover" />
                      <button
                        onClick={() => onFloorplanChange(null)}
                        className="absolute right-1 top-1 rounded-full bg-ink/80 p-0.5 text-cream opacity-0 transition group-hover:opacity-100"
                        aria-label="Remove floor plan"
                      >
                        <X size={11} />
                      </button>
                    </div>
                  ) : (
                    <label className="flex h-16 w-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-ink-line text-cream-faint transition hover:border-brass/40 hover:text-brass-bright">
                      <Plus size={16} />
                      <span className="text-[9px]">Add plan</span>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="hidden"
                        onChange={(e) => onFloorplanChange(e.target.files?.[0] ?? null)}
                      />
                    </label>
                  )}
                </div>

                <button onClick={analyzeRoom} className="btn-primary mt-6 w-full justify-center">
                  <Sparkles size={15} /> Analyze my room
                </button>
              </div>
            ) : activeProposalIndex !== null && proposals[activeProposalIndex]?.kind === "add" && canvasSrc ? (
              <div className="w-full">
                <div
                  ref={overlayRef}
                  onPointerMove={onOverlayPointerMove}
                  onPointerUp={onOverlayPointerUp}
                  className="relative touch-none select-none overflow-hidden"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={canvasSrc} alt="Room" draggable={false} className="w-full" />
                  {adjustedBox && !adjustLoading && (
                    <div
                      onPointerDown={(e) => onBoxPointerDown(e, "move")}
                      style={{
                        left: `${adjustedBox.x * 100}%`,
                        top: `${adjustedBox.y * 100}%`,
                        width: `${adjustedBox.w * 100}%`,
                        height: `${adjustedBox.h * 100}%`,
                      }}
                      className="absolute cursor-move rounded-md border-2 border-brass-bright/80 bg-brass/15"
                    >
                      <span className="absolute -top-5 left-0 rounded bg-ink/80 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-brass-bright backdrop-blur">
                        {(proposals[activeProposalIndex] as AddProposal).category}
                      </span>
                      <span
                        onPointerDown={(e) => onBoxPointerDown(e, "resize")}
                        className="absolute -bottom-1.5 -right-1.5 h-4 w-4 cursor-nwse-resize rounded-sm border border-ink bg-brass-bright"
                      />
                    </div>
                  )}
                  {adjustLoading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-ink/40">
                      <Loader2 size={20} className="animate-spin text-brass" />
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-3 border-t border-ink-line p-4">
                  <Ruler size={15} className="shrink-0 text-brass" />
                  <div className="min-w-0 flex-1 text-xs text-cream-dim">
                    Drag to move, corner handle to resize — position{" "}
                    <span className="font-semibold text-cream">{(proposals[activeProposalIndex] as AddProposal).product.name}</span>{" "}
                    where it actually belongs.
                  </div>
                  <button onClick={cancelPlacementPreview} className="btn-ghost !px-3.5 !py-1.5 !text-xs">
                    Cancel
                  </button>
                  <button
                    onClick={() => adjustedBox && generateProposal(proposals[activeProposalIndex]!, activeProposalIndex, adjustedBox)}
                    disabled={generating !== null || !adjustedBox || adjustLoading}
                    className="btn-primary !px-4 !py-1.5 !text-xs disabled:opacity-40"
                  >
                    <Sparkles size={13} />
                    {generating === activeProposalIndex ? "Rendering (~15-60s)…" : "Place in room (~$0.01)"}
                  </button>
                </div>
              </div>
            ) : canvasSrc ? (
              <div className="relative w-full">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={canvasSrc} alt="Room" className="w-full" />
                <RoomHotspots
                  items={(version?.objects ?? []).map(
                    (obj): HotspotItem => ({
                      id: obj.product.id,
                      name: obj.product.name,
                      box: obj.box,
                      priceLabel: formatChf(obj.product.price),
                      kind: "catalog",
                    }),
                  )}
                  onAction={(id) => {
                    const obj = version?.objects.find((o) => o.product.id === id);
                    if (obj) addToCart(obj.product);
                  }}
                />
              </div>
            ) : (
              <label className="flex cursor-pointer flex-col items-center gap-3 p-16 text-center text-sm text-cream-faint">
                <Upload size={22} className="text-brass" />
                Click to upload a real room photo
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => onRoomFileChange(e.target.files?.[0] ?? null)}
                />
              </label>
            )}
          </div>

          {versions.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {versions.map((v, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setCurrentVersion(i);
                    setIdentityWarning(null);
                  }}
                  className={`shrink-0 overflow-hidden rounded-lg border text-left transition ${
                    i === currentVersion ? "border-brass ring-1 ring-brass" : "border-ink-line hover:border-brass/40"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={v.imageBase64 ? `data:image/png;base64,${v.imageBase64}` : roomPreviewUrl ?? ""}
                    alt={v.label}
                    className="h-16 w-24 object-cover"
                  />
                  <div className="truncate px-1.5 py-0.5 text-[9px] text-cream-faint">{v.label}</div>
                </button>
              ))}
            </div>
          )}

          <div className="text-[10px] text-cream-faint">
            Rooms persist across visits when the server has a database configured. The designer can
            add catalog products and remove furniture already in the photo (removal isn't
            pixel-precise yet, so a little surrounding wall or floor may get repainted too).
          </div>
        </div>
      </div>
    </div>
  );
}
