import { MODEL, compositingEnabled } from "./composite";

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
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 4000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function generateImageWithRetry(
  prompt: string,
  quality: "low" | "medium" | "high",
  size: "1024x1024" | "1536x1024" | "1024x1536",
): Promise<Buffer> {
  if (!compositingEnabled()) throw new Error("OPENAI_API_KEY not configured");

  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: MODEL, prompt, quality, size, n: 1 }),
    });

    if (res.ok) {
      const body = (await res.json()) as { data?: { b64_json?: string }[] };
      const b64 = body.data?.[0]?.b64_json;
      if (!b64) throw new Error("OpenAI response had no image data");
      return Buffer.from(b64, "base64");
    }

    const errText = await res.text();
    lastError = new Error(`OpenAI image generation failed: ${res.status} ${errText}`);
    if (res.status < 500 || attempt === MAX_ATTEMPTS) throw lastError;
    console.warn(`  OpenAI image generation failed with ${res.status} (attempt ${attempt}/${MAX_ATTEMPTS}), retrying in ${RETRY_DELAY_MS / 1000}s...`);
    await sleep(RETRY_DELAY_MS);
  }
  throw lastError ?? new Error("OpenAI image generation failed");
}
