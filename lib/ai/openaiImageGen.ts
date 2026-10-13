import { MODEL, compositingEnabled } from "./openaiConfig";

/**
 * Shared retrying wrapper around OpenAI's text-to-image generations
 * endpoint (not the edits endpoint every compositing call elsewhere in
 * this app uses) — factored out of lib/ai/generateRoom.ts so
 * lib/ai/posterArt.ts doesn't duplicate the retry logic.
 *
 * 5xx here is almost always an infra-level failure in front of OpenAI's
 * own API (a Cloudflare 520 in particular — confirmed real, repeatedly,
 * against api.openai.com in one real session), not a rejection of the
 * request, so it's worth a couple of short retries before giving up. 4xx
 * (bad key, bad request, content policy) won't fix itself on retry —
 * fail fast.
 */
/**
 * Sized against a real measured failure rate, not a guess. On one real
 * (bad) network, api.openai.com returned a Cloudflare 520 for roughly 3 of
 * every 4 image requests — measured across 8 calls via
 * scripts/openai-matrix.ts, with identical parameters both succeeding and
 * failing on different attempts, which is what rules out a request-shape
 * cause. At a 75% per-attempt failure rate, 3 attempts still lose ~42% of
 * the time; 6 attempts with backoff cut that to ~18%, and 8 to ~10%.
 *
 * Retrying is cheap: a 520 means no image was produced, so the failed
 * attempt isn't billed. The cost of an extra attempt is seconds, while
 * the cost of giving up is a wasted room (its base photo and placement
 * call are already paid for by the time compositing runs).
 */
const MAX_ATTEMPTS = 8;
const BASE_RETRY_DELAY_MS = 2000;
const MAX_RETRY_DELAY_MS = 30_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Exponential backoff with jitter, so a flaky path gets progressively more room to recover. */
export function retryDelayMs(attempt: number): number {
  const exponential = Math.min(BASE_RETRY_DELAY_MS * 2 ** (attempt - 1), MAX_RETRY_DELAY_MS);
  return Math.round(exponential * (0.75 + Math.random() * 0.5));
}

export const IMAGE_MAX_ATTEMPTS = MAX_ATTEMPTS;

/**
 * Same retry discipline for the /images/edits endpoint, which every
 * compositing call uses. This matters more than the generations retry:
 * by the time a composite runs, the room's base photo and its placement
 * analysis have already been paid for, so giving up on a transient 520
 * here throws away work that cost real money — the failure mode that
 * made a flaky network so expensive in practice.
 *
 * The FormData is re-sent as-is on each attempt; its parts are in-memory
 * Blobs rather than streams, so it stays valid across retries.
 */
export async function postImageEditWithRetry(form: FormData, label: string): Promise<Response> {
  if (!compositingEnabled()) throw new Error("OPENAI_API_KEY not configured");

  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let res: Response;
    try {
      res = await fetch("https://api.openai.com/v1/images/edits", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        body: form,
      });
    } catch (err) {
      lastError = new Error(`OpenAI image edit failed (${label}): ${err instanceof Error ? err.message : err}`);
      if (attempt === MAX_ATTEMPTS) throw lastError;
      const delay = retryDelayMs(attempt);
      console.warn(`  OpenAI connection failed on ${label} (attempt ${attempt}/${MAX_ATTEMPTS}), retrying in ${Math.round(delay / 1000)}s...`);
      await sleep(delay);
      continue;
    }

    if (res.ok) {
      if (attempt > 1) console.log(`  ${label} succeeded on attempt ${attempt}.`);
      return res;
    }

    const errText = await res.text();
    const isHtml = errText.trimStart().startsWith("<");
    lastError = new Error(
      `OpenAI image edit failed (${label}): ${res.status}${isHtml ? " (Cloudflare error page — upstream/network issue, not a rejected request)" : ` ${errText}`}`,
    );
    if (res.status < 500 || attempt === MAX_ATTEMPTS) throw lastError;
    const delay = retryDelayMs(attempt);
    console.warn(`  ${label} failed with ${res.status} (attempt ${attempt}/${MAX_ATTEMPTS}), retrying in ${Math.round(delay / 1000)}s...`);
    await sleep(delay);
  }
  throw lastError ?? new Error(`OpenAI image edit failed (${label})`);
}

export async function generateImageWithRetry(
  prompt: string,
  quality: "low" | "medium" | "high",
  size: "1024x1024" | "1536x1024" | "1024x1536",
): Promise<Buffer> {
  if (!compositingEnabled()) throw new Error("OPENAI_API_KEY not configured");

  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let res: Response;
    try {
      res = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model: MODEL, prompt, quality, size, n: 1 }),
      });
    } catch (err) {
      // A dropped connection on an unreliable path throws rather than
      // returning a status, and is exactly as retryable as a 5xx.
      lastError = new Error(`OpenAI image generation failed: ${err instanceof Error ? err.message : err}`);
      if (attempt === MAX_ATTEMPTS) throw lastError;
      const delay = retryDelayMs(attempt);
      console.warn(`  OpenAI connection failed (attempt ${attempt}/${MAX_ATTEMPTS}), retrying in ${Math.round(delay / 1000)}s...`);
      await sleep(delay);
      continue;
    }

    if (res.ok) {
      const body = (await res.json()) as { data?: { b64_json?: string }[] };
      const b64 = body.data?.[0]?.b64_json;
      if (!b64) throw new Error("OpenAI response had no image data");
      if (attempt > 1) console.log(`  Succeeded on attempt ${attempt}.`);
      return Buffer.from(b64, "base64");
    }

    const errText = await res.text();
    // Cloudflare's HTML error pages are thousands of characters and drown
    // the console — the status is the only part that carries information.
    const isHtml = errText.trimStart().startsWith("<");
    lastError = new Error(
      `OpenAI image generation failed: ${res.status}${isHtml ? " (Cloudflare error page — upstream/network issue, not a rejected request)" : ` ${errText}`}`,
    );
    if (res.status < 500 || attempt === MAX_ATTEMPTS) throw lastError;
    const delay = retryDelayMs(attempt);
    console.warn(`  OpenAI image generation failed with ${res.status} (attempt ${attempt}/${MAX_ATTEMPTS}), retrying in ${Math.round(delay / 1000)}s...`);
    await sleep(delay);
  }
  throw lastError ?? new Error("OpenAI image generation failed");
}
