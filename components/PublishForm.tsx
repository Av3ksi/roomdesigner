"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Loader2, Search, Upload, X } from "lucide-react";
import { fileToDownscaledJpeg } from "@/lib/clientImage";
import { formatPrice } from "@/lib/products";
import { STYLES } from "@/lib/styles";

interface PickedProduct {
  id: string;
  name: string;
  brand: string;
  price: number;
  imageUrl: string | null;
}

export default function PublishForm() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [styleTags, setStyleTags] = useState<string[]>([]);

  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<PickedProduct[]>([]);
  const [picked, setPicked] = useState<PickedProduct[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onPhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { dataUrl, base64 } = await fileToDownscaledJpeg(file);
      setPhotoDataUrl(dataUrl);
      setPhotoBase64(base64);
    } catch {
      setError("Couldn't read that image — try a different file.");
    }
  }

  async function runSearch(q: string) {
    setQuery(q);
    if (!q.trim()) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(`/api/products/search?q=${encodeURIComponent(q)}`);
      const body = await res.json();
      setResults(Array.isArray(body.products) ? body.products : []);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  function addProduct(p: PickedProduct) {
    if (picked.some((existing) => existing.id === p.id)) return;
    setPicked((prev) => [...prev, p]);
  }

  function removeProduct(id: string) {
    setPicked((prev) => prev.filter((p) => p.id !== id));
  }

  function toggleStyleTag(name: string) {
    setStyleTags((prev) => (prev.includes(name) ? prev.filter((t) => t !== name) : [...prev, name]));
  }

  const total = picked.reduce((sum, p) => sum + p.price, 0);

  async function submit() {
    if (!photoBase64) return setError("Upload a photo of your room.");
    if (!title.trim()) return setError("Give your room a title.");
    if (picked.length === 0) return setError("Tag at least one product used in this room.");

    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          styleTags,
          photoBase64,
          productIds: picked.map((p) => p.id),
        }),
      });
      const responseBody = await res.json();
      if (!res.ok) throw new Error(responseBody.error ?? "Something went wrong.");
      router.push(`/looks/${responseBody.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-10 grid gap-8 lg:grid-cols-[1.1fr_1fr]">
      <div className="space-y-6">
        {/* Photo */}
        <div>
          <label className="mb-2 block text-sm font-semibold">Room photo</label>
          <input ref={fileInputRef} type="file" accept="image/*" onChange={onPhotoChange} className="hidden" />
          {photoDataUrl ? (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="group relative block w-full overflow-hidden rounded-xl border border-ink-line"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photoDataUrl} alt="Your room" className="aspect-[4/3] w-full object-cover" />
              <div className="absolute inset-0 flex items-center justify-center bg-ink/0 opacity-0 transition group-hover:bg-ink/50 group-hover:opacity-100">
                <span className="text-sm font-semibold text-cream">Change photo</span>
              </div>
            </button>
          ) : (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-ink-line text-cream-faint transition hover:border-brass/40 hover:text-brass-bright"
            >
              <Upload size={22} />
              <span className="text-sm">Upload a photo</span>
            </button>
          )}
        </div>

        {/* Title / description */}
        <div>
          <label className="mb-1.5 block text-sm font-semibold">Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Our Scandinavian living room"
            className="w-full rounded-lg border border-ink-line bg-ink-panel px-3.5 py-2.5 text-sm outline-none placeholder:text-cream-faint focus:border-brass/50"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-semibold">Description (optional)</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="What were you going for? Anything worth mentioning about the space."
            className="w-full resize-none rounded-lg border border-ink-line bg-ink-panel px-3.5 py-2.5 text-sm outline-none placeholder:text-cream-faint focus:border-brass/50"
          />
        </div>

        {/* Style tags */}
        <div>
          <label className="mb-2 block text-sm font-semibold">Style (optional)</label>
          <div className="flex flex-wrap gap-1.5">
            {STYLES.map((s) => (
              <button
                key={s.id}
                onClick={() => toggleStyleTag(s.name)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  styleTags.includes(s.name)
                    ? "border-brass bg-brass/10 text-brass-bright"
                    : "border-ink-line text-cream-dim hover:border-brass/40"
                }`}
              >
                {s.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-semibold">Tag the products you used</label>
          <div className="relative">
            <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-cream-faint" />
            <input
              value={query}
              onChange={(e) => runSearch(e.target.value)}
              placeholder="Search our catalog…"
              className="w-full rounded-lg border border-ink-line bg-ink-panel py-2.5 pl-9 pr-3.5 text-sm outline-none placeholder:text-cream-faint focus:border-brass/50"
            />
          </div>
          {query && (
            <div className="mt-2 max-h-64 overflow-y-auto rounded-xl border border-ink-line bg-ink-panel">
              {searching ? (
                <div className="flex items-center justify-center gap-2 p-4 text-xs text-cream-faint">
                  <Loader2 size={14} className="animate-spin" /> Searching…
                </div>
              ) : results.length === 0 ? (
                <div className="p-4 text-xs text-cream-faint">No matches.</div>
              ) : (
                <ul className="divide-y divide-ink-line/60">
                  {results.map((p) => (
                    <li key={p.id}>
                      <button
                        onClick={() => addProduct(p)}
                        disabled={picked.some((existing) => existing.id === p.id)}
                        className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition hover:bg-ink-soft disabled:opacity-40"
                      >
                        {p.imageUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.imageUrl} alt={p.name} className="h-10 w-10 shrink-0 rounded-md object-cover" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm">{p.name}</div>
                          <div className="text-xs text-cream-faint">{p.brand}</div>
                        </div>
                        <div className="text-xs font-semibold">{formatPrice(p.price)}</div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-ink-line bg-ink-panel p-4">
          <div className="mb-3 flex items-center justify-between text-sm">
            <span className="font-semibold">Tagged pieces · {picked.length}</span>
            <span className="text-brass-bright">{formatPrice(total)}</span>
          </div>
          {picked.length === 0 ? (
            <p className="text-xs text-cream-faint">Search above and add every piece shown in your photo.</p>
          ) : (
            <ul className="space-y-2">
              {picked.map((p) => (
                <li key={p.id} className="flex items-center gap-3">
                  {p.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.imageUrl} alt={p.name} className="h-10 w-10 shrink-0 rounded-md object-cover" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm">{p.name}</div>
                    <div className="text-xs text-cream-faint">{formatPrice(p.price)}</div>
                  </div>
                  <button onClick={() => removeProduct(p.id)} className="text-cream-faint hover:text-red-400" aria-label={`Remove ${p.name}`}>
                    <X size={15} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {error && <p className="text-sm text-rose-300">{error}</p>}
        <button onClick={submit} disabled={submitting} className="btn-primary w-full justify-center disabled:opacity-50">
          {submitting ? "Publishing…" : "Publish for inspiration"}
        </button>
        <p className="text-center text-[11px] text-cream-faint">
          Your room joins Complete Rooms publicly, tagged with your name hidden — just the room and products.
        </p>
      </div>
    </div>
  );
}
