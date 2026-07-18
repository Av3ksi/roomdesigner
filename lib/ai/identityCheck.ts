import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";
import { MODEL, aiEnabled } from "./claude";
import type { DetectionBox } from "../types";

/**
 * Phase 2's "Product identity QA" gate (docs/BLUEPRINT.md's honest critique
 * of the prototype called this out as missing). After a masked composite
 * render, ask Claude vision to compare the rendered region against the
 * actual product photo — image-editing models occasionally substitute a
 * different object entirely (this was flagged, unconfirmed, once already
 * in this app's own testing: a rendered console/shelf where a sofa should
 * have been). Degrades exactly like the rest of lib/ai: any failure here
 * just skips the check (returns null) rather than blocking a render the
 * user already paid for.
 */

export interface IdentityCheckResult {
  pass: boolean;
  note: string;
}

const IDENTITY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["pass", "note"],
  properties: {
    pass: { type: "boolean" },
    note: { type: "string" },
  },
} as const;

const IDENTITY_SYSTEM = `You are a quality-control reviewer for Maison, an AI interior design platform. You are shown two images: (1) the real product photo a customer picked from the catalog, and (2) a cropped region from a photo-composite render that was supposed to place THAT exact product into a room photo.

Your only job: does the cropped render actually show the same product — same category, same rough shape/proportions, same dominant color and material — or did the image-generation step substitute a different, wrong object? This class of model occasionally hallucinates a completely different item (e.g. a low console table where a sofa should be) instead of the product it was shown. Minor differences from lighting, camera angle, shadow, or a tight crop are normal and should still pass. Only fail when the object is clearly a different kind or form of furniture than the product photo — not for stylistic rendering differences.

Return pass=true/false and one short, plain, customer-friendly sentence explaining your reasoning (shown as a warning banner only when pass=false).`;

async function toJpegBase64(buffer: Buffer): Promise<string> {
  const jpeg = await sharp(buffer).rotate().jpeg({ quality: 85 }).toBuffer();
  return jpeg.toString("base64");
}

/** Crops the region the product was composited into, padded so a tall/wide object isn't cut off before review. */
async function cropRegion(imageBuffer: Buffer, box: DetectionBox): Promise<Buffer> {
  const { width = 1024, height = 1024 } = await sharp(imageBuffer).metadata();
  const pad = 0.08;
  const x0 = Math.max(0, Math.round((box.x - pad) * width));
  const y0 = Math.max(0, Math.round((box.y - pad) * height));
  const x1 = Math.min(width, Math.round((box.x + box.w + pad) * width));
  const y1 = Math.min(height, Math.round((box.y + box.h + pad) * height));
  return sharp(imageBuffer)
    .extract({ left: x0, top: y0, width: Math.max(1, x1 - x0), height: Math.max(1, y1 - y0) })
    .toBuffer();
}

export async function checkRenderedProductIdentity(
  productPhoto: Buffer,
  renderedImage: Buffer,
  maskBox: DetectionBox,
): Promise<IdentityCheckResult | null> {
  if (!aiEnabled()) return null;
  try {
    const [productJpeg, cropJpeg] = await Promise.all([
      toJpegBase64(productPhoto),
      cropRegion(renderedImage, maskBox).then(toJpegBase64),
    ]);

    const response = await new Anthropic().messages.create({
      model: MODEL,
      max_tokens: 2048,
      thinking: { type: "adaptive" },
      system: IDENTITY_SYSTEM,
      output_config: {
        format: { type: "json_schema", schema: IDENTITY_SCHEMA as unknown as Record<string, unknown> },
      },
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Product photo (what the customer picked):" },
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: productJpeg } },
            { type: "text", text: "Cropped region from the rendered composite:" },
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: cropJpeg } },
          ],
        },
      ],
    });

    if (response.stop_reason === "refusal") return null;
    const text = response.content.find((b) => b.type === "text")?.text;
    if (!text) return null;
    const parsed = JSON.parse(text) as Record<string, unknown>;
    if (typeof parsed.pass !== "boolean" || typeof parsed.note !== "string") return null;
    return { pass: parsed.pass, note: parsed.note };
  } catch (err) {
    console.error("[maison] identity check failed, skipping:", err);
    return null;
  }
}
