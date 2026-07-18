"use client";

import { AlertTriangle, ArrowUpRight, Send, Sparkles, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  base64PngToFile,
  base64ToFile,
  detectImageMimeFromBase64,
  loadImageAspectRatio,
  reshapeBoxToAspectRatio,
} from "@/lib/clientImage";
import type { DetectionBox, Product } from "@/lib/types";

const ROOM_ID_STORAGE_KEY = "maison_room_id";

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

export default function Designer() {
  const [roomFile, setRoomFile] = useState<File | null>(null);
  const [roomPreviewUrl, setRoomPreviewUrl] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [constraints, setConstraints] = useState<Constraint[]>([]);
  const [roomContext, setRoomContext] = useState<unknown>(null);
  const [proposals, setProposals] = useState<EditProposal[]>([]);
  const [versions, setVersions] = useState<RoomVersion[]>([]);
  const [currentVersion, setCurrentVersion] = useState(0);
  const [thinking, setThinking] = useState(false);
  const [generating, setGenerating] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [identityWarning, setIdentityWarning] = useState<string | null>(null);
  const [openHotspot, setOpenHotspot] = useState<number | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [rehydrating, setRehydrating] = useState(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

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
      } catch {
        localStorage.removeItem(ROOM_ID_STORAGE_KEY);
      } finally {
        setRehydrating(false);
      }
    })();
  }, []);

  function onRoomFileChange(file: File | null) {
    setRoomFile(file);
    if (roomPreviewUrl) URL.revokeObjectURL(roomPreviewUrl);
    setRoomPreviewUrl(file ? URL.createObjectURL(file) : null);
    setVersions(file ? [{ imageBase64: null, objects: [], label: "Original" }] : []);
    setCurrentVersion(0);
    setProposals([]);
    setRoomContext(null); // placement analysis is per-photo
    setError(null);
    setIdentityWarning(null);
    setMessages([]);
    setConstraints([]);
    // A manually uploaded photo always starts a fresh room, never appends to a restored one.
    setRoomId(null);
    if (typeof window !== "undefined") localStorage.removeItem(ROOM_ID_STORAGE_KEY);
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

  /** The explicit money moment: one confirmed proposal = one billed render call. */
  async function generateProposal(proposal: EditProposal, index: number) {
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

        const res = await fetch("/api/remove-object", { method: "POST", body: form });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? `Removal failed: ${res.status}`);

        commitVersion(body.imageBase64, `V${versions.length} · Removed ${proposal.category}`, prevObjects);
        setProposals((p) => p.filter((_, i) => i !== index));
        return;
      }

      // Fit the box to the product's real shape before rendering.
      let box = proposal.box;
      if (proposal.product.imageUrl) {
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
          Upload a room photo and just say what you want — the AI designer searches the real
          supplier catalog, plans placements against your room's geometry, and proposes edits.
          Each proposal renders only when you confirm it (~$0.01 per render).
        </p>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[420px_1fr]">
        {/* Chat rail */}
        <div className="card flex h-[640px] flex-col p-0">
          <div className="flex-1 space-y-4 overflow-y-auto p-5">
            {messages.length === 0 && (
              <div className="text-sm text-cream-faint">
                {roomFile
                  ? 'Try: "Richte mir das Zimmer skandinavisch ein" · "Add a sofa and a floor lamp under CHF 800" · "Only oak wood."'
                  : "Upload a room photo to start."}
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
                  <div className="text-sm font-semibold">Remove existing {p.category}</div>
                )}
                {p.rationale && <div className="mt-2 text-xs text-cream-dim">{p.rationale}</div>}
                <button
                  onClick={() => generateProposal(p, i)}
                  disabled={generating !== null || !roomFile}
                  className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-full bg-brass px-4 py-2 text-xs font-semibold text-ink disabled:opacity-40"
                >
                  <Sparkles size={13} />
                  {generating === i
                    ? "Rendering (~15-60s)…"
                    : p.kind === "add"
                      ? "Place in room (~$0.01)"
                      : "Remove from room (~$0.02)"}
                </button>
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

          <div className="flex items-center gap-2 border-t border-ink-line p-4">
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
            ) : canvasSrc ? (
              <div className="relative w-full">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={canvasSrc} alt="Room" className="w-full" />
                {version?.objects.map((obj, i) => (
                  <button
                    key={i}
                    onClick={() => setOpenHotspot(openHotspot === i ? null : i)}
                    style={{
                      left: `${obj.box.x * 100}%`,
                      top: `${obj.box.y * 100}%`,
                      width: `${obj.box.w * 100}%`,
                      height: `${obj.box.h * 100}%`,
                    }}
                    className="absolute rounded-md border-2 border-brass-bright/60 bg-brass/5 transition hover:bg-brass/15"
                    aria-label={`View ${obj.product.name}`}
                  />
                ))}
                {openHotspot !== null && version?.objects[openHotspot] && (
                  <div
                    style={{
                      left: `${Math.min(version.objects[openHotspot].box.x * 100, 70)}%`,
                      top: `${(version.objects[openHotspot].box.y + version.objects[openHotspot].box.h) * 100}%`,
                    }}
                    className="absolute z-10 mt-2 w-60 rounded-lg border border-ink-line bg-ink p-3 shadow-xl"
                  >
                    <div className="text-sm font-semibold">{version.objects[openHotspot].product.name}</div>
                    <div className="mt-1.5 font-display text-lg text-brass-bright">
                      {formatChf(version.objects[openHotspot].product.price)}
                    </div>
                    {version.objects[openHotspot].product.productUrl && (
                      <a
                        href={version.objects[openHotspot].product.productUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 flex items-center gap-1 text-xs font-semibold text-brass hover:underline"
                      >
                        View product <ArrowUpRight size={12} />
                      </a>
                    )}
                  </div>
                )}
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
                    setOpenHotspot(null);
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
            add catalog products and, where its object-detection step is available, remove furniture
            already in the photo — it will say so honestly if either isn't available right now.
          </div>
        </div>
      </div>
    </div>
  );
}
