"use client";

import { AlertTriangle, Bookmark, Check, Eraser, Loader2, MapPin, Plus, Ruler, Search, Send, Sparkles, Trash2, Upload, X } from "lucide-react";
import Link from "next/link";
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
import UpgradeModal from "@/components/UpgradeModal";
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

/** A real product the agent found on the open web (not our catalog) — always has a real photo, shown as clearly sourced from another retailer. */
interface WebProductInfo {
  name: string;
  url: string;
  retailer: string;
  priceText: string | null;
  imageUrl: string;
}

interface AddWebProposal {
  kind: "add-web";
  webProduct: WebProductInfo;
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

type EditProposal = AddProposal | AddWebProposal | RemoveProposal;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

type PlacedObject =
  | { box: DetectionBox; kind: "catalog"; product: Product }
  | { box: DetectionBox; kind: "web"; webProduct: WebProductInfo };

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
  const [thinkingSeconds, setThinkingSeconds] = useState(0);
  const [generating, setGenerating] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [identityWarning, setIdentityWarning] = useState<string | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [rehydrating, setRehydrating] = useState(false);
  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalogResults, setCatalogResults] = useState<Product[]>([]);
  const [catalogSearching, setCatalogSearching] = useState(false);
  const [showCatalogPanel, setShowCatalogPanel] = useState(false);
  // Freemium gate — null while unknown (not yet fetched), else the number of
  // free AI generations left on this anonymous session. Purely a UX hint:
  // the server enforces the real limit on every /api/composite and
  // /api/remove-object call regardless of what the client thinks.
  const [usageRemaining, setUsageRemaining] = useState<number | null>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  // "Save to my collection" — a private bookmark of the current render,
  // separate from the free-generation gate above (saving costs nothing).
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveTitle, setSaveTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
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

  // Ticks while waiting on a chat reply so the loading text can be honest
  // about how long it's actually been — a message that might involve a real
  // web search can take up to a minute, and a bare "Designing…" for that
  // long reads as broken without a running clock.
  useEffect(() => {
    if (!thinking) {
      setThinkingSeconds(0);
      return;
    }
    const start = Date.now();
    const id = setInterval(() => setThinkingSeconds(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(id);
  }, [thinking]);

  // On mount: how many free generations this session has left, so the UI
  // can show the paywall proactively instead of only after a wasted click.
  useEffect(() => {
    fetch("/api/usage")
      .then((res) => res.json())
      .then((data) => setUsageRemaining(typeof data.remaining === "number" ? data.remaining : null))
      .catch(() => {
        // Unknown is fine — the server still enforces the limit either way.
      });
  }, []);

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
    if (p.kind !== "add" && p.kind !== "add-web") return;
    setActiveProposalIndex(index);
    setAdjustLoading(true);
    const imageUrl = p.kind === "add" ? p.product.imageUrl : p.webProduct.imageUrl;
    let box = p.box;
    if (imageUrl) {
      try {
        box = reshapeBoxToAspectRatio(box, await loadImageAspectRatio(imageUrl));
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

  /** Bookmarks the current render into "my collection" (/my-rooms) — private, no login required, free (no OpenAI call). */
  async function saveToCollection() {
    const current = versions[currentVersion];
    if (!current?.imageBase64 || current.objects.length === 0) return;
    setSaving(true);
    setSaveError(null);
    try {
      const catalogObjects = current.objects.filter((o) => o.kind === "catalog");
      const webObjects = current.objects.filter((o) => o.kind === "web");
      const productIds = catalogObjects.map((o) => o.product.id);
      const itemBoxes = Object.fromEntries(catalogObjects.map((o) => [o.product.id, o.box]));
      const externals = webObjects.map((o) => ({
        name: o.webProduct.name,
        url: o.webProduct.url,
        retailer: o.webProduct.retailer,
        priceText: o.webProduct.priceText,
        box: o.box,
      }));
      const totalPrice = catalogObjects.reduce((sum, o) => sum + o.product.price, 0);

      const res = await fetch("/api/finished-rooms/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: saveTitle.trim() || undefined,
          heroImageBase64: current.imageBase64,
          productIds,
          itemBoxes,
          externals,
          totalPrice,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `Save failed: ${res.status}`);

      setSaveOpen(false);
      setSaveTitle("");
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 4000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
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
    if (usageRemaining === 0) {
      setShowUpgradeModal(true);
      return;
    }
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
        // A specific inventory description ("gray fabric sofa") is a much
        // better text prompt for segmentation than the generic category
        // label — see lib/ai/vision/segmentation.ts's descriptionHint param.
        if (proposal.description) form.append("description", proposal.description);
        if (proposal.box) {
          form.append("boxX", String(proposal.box.x));
          form.append("boxY", String(proposal.box.y));
          form.append("boxW", String(proposal.box.w));
          form.append("boxH", String(proposal.box.h));
        }

        const res = await fetch("/api/remove-object", { method: "POST", body: form });
        const body = await res.json();
        if (res.status === 402) {
          setUsageRemaining(0);
          setShowUpgradeModal(true);
          return;
        }
        if (!res.ok) throw new Error(body.error ?? `Removal failed: ${res.status}`);

        setUsageRemaining((r) => (r !== null ? Math.max(0, r - 1) : r));
        commitVersion(body.imageBase64, `V${versions.length} · Removed ${proposal.description ?? proposal.category}`, prevObjects);
        setProposals((p) => p.filter((_, i) => i !== index));
        return;
      }

      // Fit the box to the item's real shape before rendering — unless the
      // placement adjuster already gave us one.
      const imageUrl = proposal.kind === "add" ? proposal.product.imageUrl ?? "" : proposal.webProduct.imageUrl;
      let box = overrideBox ?? proposal.box;
      if (!overrideBox && imageUrl) {
        try {
          box = reshapeBoxToAspectRatio(box, await loadImageAspectRatio(imageUrl));
        } catch {
          // un-reshaped box still works
        }
      }

      const form = new FormData();
      form.append("room", baseFile);
      form.append("productImageUrl", imageUrl);
      form.append("category", proposal.category);
      form.append("boxX", String(box.x));
      form.append("boxY", String(box.y));
      form.append("boxW", String(box.w));
      form.append("boxH", String(box.h));
      form.append("wallAngleDeg", String(proposal.wallAngleDeg));

      const res = await fetch("/api/composite", { method: "POST", body: form });
      const body = await res.json();
      if (res.status === 402) {
        setUsageRemaining(0);
        setShowUpgradeModal(true);
        return;
      }
      if (!res.ok) throw new Error(body.error ?? `Render failed: ${res.status}`);

      setUsageRemaining((r) => (r !== null ? Math.max(0, r - 1) : r));
      const newObject: PlacedObject =
        proposal.kind === "add"
          ? { box: body.maskBox, kind: "catalog", product: proposal.product }
          : { box: body.maskBox, kind: "web", webProduct: proposal.webProduct };
      const label = proposal.kind === "add" ? proposal.product.name : proposal.webProduct.name;

      // Re-adding the same product (e.g. retrying a placement) renders into
      // the same masked region, visually replacing whatever was there — but
      // prevObjects is otherwise a pure append-only log, so without this the
      // hotspot bookkeeping would keep the stale entry around too. Two
      // PlacedObjects for the same product then share the same React key
      // (RoomHotspots keys by product id) — a real, confirmed duplicate-key
      // warning from exactly this. Drop the old entry for this product/URL
      // before appending the new one.
      const isSameProduct = (o: PlacedObject) =>
        proposal.kind === "add"
          ? o.kind === "catalog" && o.product.id === proposal.product.id
          : o.kind === "web" && o.webProduct.url === proposal.webProduct.url;
      const dedupedPrevObjects = prevObjects.filter((o) => !isSameProduct(o));

      commitVersion(body.imageBase64, `V${versions.length} · ${label.slice(0, 24)}`, [...dedupedPrevObjects, newObject]);
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

  const activeProposal = activeProposalIndex !== null ? proposals[activeProposalIndex] : null;
  const activeAddProposal = activeProposal?.kind === "add" || activeProposal?.kind === "add-web" ? activeProposal : null;
  const activeName = activeAddProposal ? (activeAddProposal.kind === "add" ? activeAddProposal.product.name : activeAddProposal.webProduct.name) : "";

  return (
    <>
      {showUpgradeModal && <UpgradeModal onClose={() => setShowUpgradeModal(false)} />}
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
            {thinking && (
              <div className="flex items-center gap-2 text-xs text-cream-faint">
                <Loader2 size={12} className="animate-spin text-brass" />
                {thinkingSeconds < 8
                  ? "Designing…"
                  : thinkingSeconds < 20
                    ? `Still thinking… (${thinkingSeconds}s)`
                    : `Finding something specific can take up to ~100s — hang tight (${thinkingSeconds}s)…`}
              </div>
            )}

            {usageRemaining === 0 && (
              <button
                onClick={() => setShowUpgradeModal(true)}
                className="flex w-full items-center justify-between gap-2 rounded-lg border border-brass/30 bg-brass/5 p-3 text-left text-xs text-cream-dim"
              >
                <span>You&apos;ve used your free room generation.</span>
                <span className="shrink-0 font-semibold text-brass-bright">Upgrade to Pro →</span>
              </button>
            )}

            {proposals.map((p, i) => (
              <div
                key={i}
                className={`rounded-xl border p-3 ${
                  p.kind === "add-web" ? "border-rose-400/25 bg-rose-400/5" : "border-brass/30 bg-brass/5"
                }`}
              >
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
                ) : p.kind === "add-web" ? (
                  <div className="flex items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.webProduct.imageUrl} alt={p.webProduct.name} className="h-14 w-14 rounded-lg object-cover" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">{p.webProduct.name}</div>
                      <div className="text-xs text-rose-300">
                        {p.webProduct.priceText ?? "See price"} · from {p.webProduct.retailer}, not sold by Maison
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm font-semibold">Remove {p.description ?? `existing ${p.category}`}</div>
                )}
                {p.rationale && <div className="mt-2 text-xs text-cream-dim">{p.rationale}</div>}
                {p.kind === "add" || p.kind === "add-web" ? (
                  <button
                    onClick={() => openPlacementPreview(i)}
                    disabled={generating !== null || !roomFile || activeProposalIndex === i}
                    className={`mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold disabled:opacity-40 ${
                      p.kind === "add-web" ? "bg-rose-400/90 text-ink" : "bg-brass text-ink"
                    }`}
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
          {roomFile && (
            <div className="flex justify-end">
              <button
                onClick={() => {
                  if (window.confirm("Clear this room and start a new one? Unsaved renders and chat will be lost.")) {
                    onRoomFileChange(null);
                  }
                }}
                className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium text-cream-faint transition hover:text-brass-bright"
              >
                <Trash2 size={12} /> Clear board
              </button>
            </div>
          )}
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
            ) : activeAddProposal && canvasSrc ? (
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
                        {activeAddProposal.category}
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
                    <span className="font-semibold text-cream">{activeName}</span> where it actually belongs.
                  </div>
                  <button onClick={cancelPlacementPreview} className="btn-ghost !px-3.5 !py-1.5 !text-xs">
                    Cancel
                  </button>
                  <button
                    onClick={() =>
                      adjustedBox && activeProposalIndex !== null && generateProposal(activeAddProposal, activeProposalIndex, adjustedBox)
                    }
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
                  items={(version?.objects ?? []).map((obj, i): HotspotItem => {
                    if (obj.kind === "web") {
                      return {
                        id: `web-${i}`,
                        name: obj.webProduct.name,
                        box: obj.box,
                        priceLabel: obj.webProduct.priceText ?? "See price",
                        kind: "external",
                        url: obj.webProduct.url,
                        retailer: obj.webProduct.retailer,
                      };
                    }
                    return {
                      id: obj.product.id,
                      name: obj.product.name,
                      box: obj.box,
                      priceLabel: formatChf(obj.product.price),
                      kind: "catalog",
                    };
                  })}
                  onAction={(id) => {
                    const obj = version?.objects.find((o) => o.kind !== "web" && o.product.id === id);
                    if (obj && obj.kind !== "web") addToCart(obj.product);
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

          {version && version.objects.length > 0 && (
            <div className="relative">
              {savedFlash ? (
                <div className="flex items-center justify-between gap-2 rounded-lg border border-brass/30 bg-brass/5 px-3.5 py-2.5 text-xs text-cream-dim">
                  <span className="flex items-center gap-1.5">
                    <Check size={13} className="text-brass" /> Saved to your collection.
                  </span>
                  <Link href="/my-rooms" className="shrink-0 font-semibold text-brass-bright hover:underline">
                    View →
                  </Link>
                </div>
              ) : (
                <button
                  onClick={() => setSaveOpen((v) => !v)}
                  className="btn-ghost w-full justify-center !text-xs"
                >
                  <Bookmark size={13} />
                  Save to my collection
                </button>
              )}
              {saveOpen && (
                <>
                  <button className="fixed inset-0 z-10 cursor-default" onClick={() => setSaveOpen(false)} aria-label="Close" />
                  <div className="absolute bottom-full left-0 z-20 mb-2 w-full rounded-xl border border-ink-line bg-ink-soft p-3 shadow-2xl">
                    <div className="mb-1.5 text-[10px] uppercase tracking-widest text-cream-faint">Save privately — publish later if you want</div>
                    <div className="flex gap-1.5">
                      <input
                        value={saveTitle}
                        onChange={(e) => setSaveTitle(e.target.value)}
                        placeholder="Name this room (optional)"
                        className="min-w-0 flex-1 rounded-lg border border-ink-line bg-ink-panel px-2.5 py-2 text-xs outline-none placeholder:text-cream-faint/60 focus:border-brass/50"
                      />
                      <button
                        onClick={saveToCollection}
                        disabled={saving}
                        className="rounded-lg bg-brass px-3 py-2 text-xs font-semibold text-ink disabled:opacity-50"
                      >
                        {saving ? <Loader2 size={13} className="animate-spin" /> : "Save"}
                      </button>
                    </div>
                    {saveError && <p className="mt-1.5 text-[11px] text-rose-300">{saveError}</p>}
                  </div>
                </>
              )}
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
    </>
  );
}
