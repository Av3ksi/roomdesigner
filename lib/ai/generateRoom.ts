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
 */
export async function generateBaseRoomPhoto(style: DesignStyle): Promise<Buffer> {
  if (!compositingEnabled()) throw new Error("OPENAI_API_KEY not configured");

  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      prompt:
        `A wide-angle, photorealistic interior photograph of an EMPTY, unfurnished living room shot in true ` +
        `${style.name} style (${style.tagline}): ${style.description} Dominant colors: ${style.palette.join(", ")}. ` +
        "Real architecture — walls, windows, flooring, ceiling, natural daylight — shot like real estate or interior " +
        "photography on a wide lens with plenty of open floor space. The room must be completely EMPTY: no " +
        "furniture, no rugs, no wall art, no plants, no decor, no people — just the bare architectural shell, ready " +
        "to be furnished.",
      quality: "medium",
      size: "1536x1024",
      n: 1,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI image generation failed: ${res.status} ${errText}`);
  }

  const body = (await res.json()) as { data?: { b64_json?: string }[] };
  const b64 = body.data?.[0]?.b64_json;
  if (!b64) throw new Error("OpenAI response had no image data");
  return Buffer.from(b64, "base64");
}
