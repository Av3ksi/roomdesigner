/**
 * Thin adapters over the image APIs we might use, behind one interface, so
 * they can be measured against each other on equal terms — and later
 * swapped into the pipeline without touching call sites.
 *
 * WHY THIS EXISTS: one masked composite against OpenAI takes 70-140s of
 * wall clock, and that is the single worst number in the product. Before
 * rewriting the pipeline around a different provider, the question "is
 * another one actually faster for OUR two operations" needs an answer with
 * numbers behind it (scripts/bench-image-providers.ts).
 *
 * THE TWO OPERATIONS ARE NOT EQUALLY PORTABLE, and this is the thing to
 * understand before reading any benchmark result:
 *
 *   textToImage  — every provider does this. It is how the empty base room
 *                  is made. Roughly 1 call per room.
 *   editWithMask — OpenAI's /images/edits takes an explicit mask: an alpha
 *                  channel marking which pixels may change. That is what
 *                  keeps a composite from repainting the whole room, and
 *                  it is what the expensive call actually is.
 *
 * Gemini and xAI expose image editing (if at all) as prompt-driven
 * image-to-image with NO mask parameter. So a like-for-like swap of the
 * expensive call is not available: the mask would have to be replaced by
 * prompt instructions, which is a quality question, not just a speed one.
 * `supportsMask` records this per provider, and the benchmark reports it
 * alongside the timings so a fast number is never read as a drop-in win.
 *
 * Endpoints and model ids are declared as constants because they move.
 * When one is wrong the adapter surfaces the API's own error text verbatim
 * rather than guessing, so it is obvious which line to correct.
 */

export type ProviderId = "openai" | "gemini" | "xai";

export interface ImageResult {
  /** Raw image bytes. */
  buffer: Buffer;
  /** Milliseconds until response HEADERS arrived — essentially the model's own work. */
  ttfbMs: number;
  /** Milliseconds until the body finished downloading — TTFB plus transfer. */
  totalMs: number;
  bytes: number;
}

export interface ImageProvider {
  id: ProviderId;
  label: string;
  /** Env var holding this provider's key. Never printed. */
  envVar: string;
  model: string;
  /** True only where the API accepts an explicit edit mask. See the module doc. */
  supportsMask: boolean;
  enabled(): boolean;
  textToImage(prompt: string, size: ImageSize): Promise<ImageResult>;
  /**
   * Edit `image` under `prompt`. `mask` is honoured only where
   * supportsMask is true; elsewhere it is ignored and the edit is
   * prompt-constrained, which the benchmark labels in its output.
   */
  editImage(prompt: string, image: Buffer, mask?: Buffer): Promise<ImageResult>;
}

export type ImageSize = "1024x1024" | "1536x1024";

/**
 * One fetch, timed in two parts. The split matters on a slow uplink: TTFB
 * is the provider generating, the remainder is the image coming down. A
 * previous debugging session lost hours to conflating the two — the same
 * request "took 20s" on a connection whose TCP handshake was 90ms.
 */
async function timedFetch(url: string, init: RequestInit): Promise<{ res: Response; body: ArrayBuffer; ttfbMs: number; totalMs: number }> {
  const started = Date.now();
  const res = await fetch(url, init);
  const ttfbMs = Date.now() - started;
  const body = await res.arrayBuffer();
  return { res, body, ttfbMs, totalMs: Date.now() - started };
}

function decodeError(body: ArrayBuffer, status: number): Error {
  const text = new TextDecoder().decode(body).slice(0, 400);
  return new Error(`HTTP ${status}: ${text || "(empty body)"}`);
}

/* ————— OpenAI ————— */

const OPENAI_MODEL = "gpt-image-1.5";

export const openaiProvider: ImageProvider = {
  id: "openai",
  label: "OpenAI gpt-image-1.5",
  envVar: "OPENAI_API_KEY",
  model: OPENAI_MODEL,
  supportsMask: true,
  enabled: () => Boolean(process.env.OPENAI_API_KEY),

  async textToImage(prompt, size) {
    const { res, body, ttfbMs, totalMs } = await timedFetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: OPENAI_MODEL, prompt, size, quality: "high", n: 1 }),
    });
    if (!res.ok) throw decodeError(body, res.status);
    const json = JSON.parse(new TextDecoder().decode(body));
    const b64 = json?.data?.[0]?.b64_json;
    if (typeof b64 !== "string") throw new Error("no image in response");
    const buffer = Buffer.from(b64, "base64");
    return { buffer, ttfbMs, totalMs, bytes: buffer.length };
  },

  async editImage(prompt, image, mask) {
    const form = new FormData();
    form.append("model", OPENAI_MODEL);
    form.append("prompt", prompt);
    form.append("quality", "high");
    form.append("image", new Blob([new Uint8Array(image)], { type: "image/png" }), "room.png");
    if (mask) form.append("mask", new Blob([new Uint8Array(mask)], { type: "image/png" }), "mask.png");
    const { res, body, ttfbMs, totalMs } = await timedFetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: form,
    });
    if (!res.ok) throw decodeError(body, res.status);
    const json = JSON.parse(new TextDecoder().decode(body));
    const b64 = json?.data?.[0]?.b64_json;
    if (typeof b64 !== "string") throw new Error("no image in response");
    const buffer = Buffer.from(b64, "base64");
    return { buffer, ttfbMs, totalMs, bytes: buffer.length };
  },
};

/* ————— Google Gemini ("Nano Banana") ————— */

/**
 * Gemini's image model, nicknamed Nano Banana. Same endpoint for both
 * operations: an edit is just a generate call that happens to include an
 * input image part. There is no mask parameter — see the module doc for
 * why that matters more than the latency number.
 */
const GEMINI_MODEL = "gemini-2.5-flash-image";
const GEMINI_ENDPOINT = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

function geminiImageFrom(json: unknown): Buffer {
  const parts = (json as { candidates?: { content?: { parts?: unknown[] } }[] })?.candidates?.[0]?.content?.parts ?? [];
  for (const part of parts) {
    const inline = (part as { inlineData?: { data?: string }; inline_data?: { data?: string } });
    const data = inline.inlineData?.data ?? inline.inline_data?.data;
    if (typeof data === "string") return Buffer.from(data, "base64");
  }
  throw new Error("no inline image data in response");
}

export const geminiProvider: ImageProvider = {
  id: "gemini",
  label: "Gemini 2.5 Flash Image (Nano Banana)",
  envVar: "GEMINI_API_KEY",
  model: GEMINI_MODEL,
  supportsMask: false,
  enabled: () => Boolean(process.env.GEMINI_API_KEY),

  async textToImage(prompt) {
    const { res, body, ttfbMs, totalMs } = await timedFetch(GEMINI_ENDPOINT(GEMINI_MODEL), {
      method: "POST",
      headers: { "x-goog-api-key": String(process.env.GEMINI_API_KEY), "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });
    if (!res.ok) throw decodeError(body, res.status);
    const buffer = geminiImageFrom(JSON.parse(new TextDecoder().decode(body)));
    return { buffer, ttfbMs, totalMs, bytes: buffer.length };
  },

  async editImage(prompt, image) {
    // The mask argument is deliberately unused: this API has no mask
    // parameter, so accepting one and silently ignoring it would make the
    // benchmark compare two different operations.
    const { res, body, ttfbMs, totalMs } = await timedFetch(GEMINI_ENDPOINT(GEMINI_MODEL), {
      method: "POST",
      headers: { "x-goog-api-key": String(process.env.GEMINI_API_KEY), "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: "image/png", data: image.toString("base64") } }] }],
      }),
    });
    if (!res.ok) throw decodeError(body, res.status);
    const buffer = geminiImageFrom(JSON.parse(new TextDecoder().decode(body)));
    return { buffer, ttfbMs, totalMs, bytes: buffer.length };
  },
};

/* ————— xAI Grok ————— */

/**
 * Grok's image endpoint is OpenAI-shaped, which makes the text-to-image
 * call nearly identical. Whether it exposes an EDIT endpoint at all is the
 * open question the benchmark answers empirically rather than by
 * assertion: editImage below calls the OpenAI-shaped /images/edits path,
 * and if xAI does not implement it the adapter surfaces that 404 verbatim.
 * A missing capability is a result, not a benchmark failure.
 */
const XAI_MODEL = "grok-2-image-1212";

export const xaiProvider: ImageProvider = {
  id: "xai",
  label: "xAI grok-2-image",
  envVar: "XAI_API_KEY",
  model: XAI_MODEL,
  supportsMask: false,
  enabled: () => Boolean(process.env.XAI_API_KEY),

  async textToImage(prompt) {
    const { res, body, ttfbMs, totalMs } = await timedFetch("https://api.x.ai/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.XAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: XAI_MODEL, prompt, n: 1, response_format: "b64_json" }),
    });
    if (!res.ok) throw decodeError(body, res.status);
    const json = JSON.parse(new TextDecoder().decode(body));
    const b64 = json?.data?.[0]?.b64_json;
    if (typeof b64 !== "string") throw new Error("no image in response");
    const buffer = Buffer.from(b64, "base64");
    return { buffer, ttfbMs, totalMs, bytes: buffer.length };
  },

  async editImage(prompt, image) {
    const form = new FormData();
    form.append("model", XAI_MODEL);
    form.append("prompt", prompt);
    form.append("image", new Blob([new Uint8Array(image)], { type: "image/png" }), "room.png");
    const { res, body, ttfbMs, totalMs } = await timedFetch("https://api.x.ai/v1/images/edits", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.XAI_API_KEY}` },
      body: form,
    });
    if (!res.ok) throw decodeError(body, res.status);
    const json = JSON.parse(new TextDecoder().decode(body));
    const b64 = json?.data?.[0]?.b64_json;
    if (typeof b64 !== "string") throw new Error("no image in response");
    const buffer = Buffer.from(b64, "base64");
    return { buffer, ttfbMs, totalMs, bytes: buffer.length };
  },
};

export const IMAGE_PROVIDERS: ImageProvider[] = [openaiProvider, geminiProvider, xaiProvider];
