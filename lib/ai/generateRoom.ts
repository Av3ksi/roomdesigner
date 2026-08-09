import type { DesignStyle } from "../types";
import { MODEL, compositingEnabled } from "./composite";

/**
 * Generates a photorealistic EMPTY room photo from scratch — OpenAI's
 * text-to-image generations endpoint, not the edits endpoint every other
 * compositing call in this app uses. Built for scripts/generate-looks.ts,
 * which has no real customer photo to start from (unlike the curated-look
 * script, where a human supplies one). Only ever used for autonomously
 * generated showroom content, never presented as a real customer's room —
 * the base is fictional, but the products composited into it afterward via
 * composeSceneWithProducts are the same real catalog items either way.
 *
 * quality defaults to "high" — this is permanent public showroom content
 * (/looks), not a one-off customer preview, and the base room's own
 * lighting sets the ceiling for how good the final composite can look:
 * compositeSceneWithProducts matches ITS lighting to whatever this step
 * produces, so a flat or muddy base room caps every render built on it.
 */
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 4000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function generateBaseRoomPhoto(
  style: DesignStyle,
  quality: "low" | "medium" | "high" = "high",
): Promise<Buffer> {
  if (!compositingEnabled()) throw new Error("OPENAI_API_KEY not configured");

  const prompt =
    "You are shooting for a design magazine's cover feature. Photograph an EMPTY, unfurnished living room " +
    `in true ${style.name} style (${style.tagline}): ${style.description} Dominant colours: ` +
    `${style.palette.join(", ")}. ` +
    "Real architecture only — walls, windows, flooring, ceiling — on a wide lens with generous depth of " +
    "field, shot like the finest real-estate or architectural-digest photography. Light the room as a " +
    "professional would light this shoot: soft, directional natural daylight pouring through the windows as " +
    "the key light, warm ambient bounce off the walls and ceiling as fill, gentle golden-hour warmth in the " +
    "highlights, soft realistic shadows with no harsh flatness and no blown-out windows. Crisp architectural " +
    "detail, true material texture on every visible surface, natural film-like colour grading — not a CGI " +
    "render, not an oversaturated HDR image. The room must be completely EMPTY: no furniture, no rugs, no " +
    "wall art, no plants, no decor, no people — just the bare architectural shell with beautiful light, " +
    "ready to be furnished.";

  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: MODEL, prompt, quality, size: "1536x1024", n: 1 }),
    });

    if (res.ok) {
      const body = (await res.json()) as { data?: { b64_json?: string }[] };
      const b64 = body.data?.[0]?.b64_json;
      if (!b64) throw new Error("OpenAI response had no image data");
      return Buffer.from(b64, "base64");
    }

    // 5xx here is almost always an infra-level failure in front of OpenAI's
    // own API (a Cloudflare 520 in particular — confirmed real, repeatedly,
    // against api.openai.com), not a real rejection of the request. Worth
    // a couple of short retries before giving up. 4xx (bad key, bad
    // request, content policy) won't fix itself on retry — fail fast.
    const errText = await res.text();
    lastError = new Error(`OpenAI image generation failed: ${res.status} ${errText}`);
    if (res.status < 500 || attempt === MAX_ATTEMPTS) throw lastError;
    console.warn(`  OpenAI image generation failed with ${res.status} (attempt ${attempt}/${MAX_ATTEMPTS}), retrying in ${RETRY_DELAY_MS / 1000}s...`);
    await sleep(RETRY_DELAY_MS);
  }
  throw lastError ?? new Error("OpenAI image generation failed");
}
