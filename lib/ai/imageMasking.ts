import sharp from "sharp";
import type { DetectionBox } from "../types";

/**
 * Shared masking/blending primitives for every masked-image-edit provider
 * this app uses (OpenAI's images/edits in lib/ai/composite.ts, Replicate's
 * FLUX Fill in lib/ai/fluxFill.ts). One implementation, not two copies with
 * two independent bug surfaces — this exact file was split out of
 * composite.ts after a real, confirmed bug (a `.blur()` call silently
 * expanding a single-channel mask buffer to 3 channels, corrupting the
 * blend) was found and fixed there; duplicating that logic per-provider
 * would mean re-finding it twice.
 */

/** OpenAI images/edits mask convention: alpha 255 = keep original as-is, alpha 0 = region the model may edit. */
export async function buildMaskPng(width: number, height: number, box: DetectionBox): Promise<Buffer> {
  const channels = 4;
  const pixels = Buffer.alloc(width * height * channels, 255); // opaque everywhere = "keep as-is"

  const x0 = Math.max(0, Math.round(box.x * width));
  const y0 = Math.max(0, Math.round(box.y * height));
  const x1 = Math.min(width, Math.round((box.x + box.w) * width));
  const y1 = Math.min(height, Math.round((box.y + box.h) * height));

  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      pixels[(y * width + x) * channels + 3] = 0; // alpha 0 = "edit this region"
    }
  }

  return sharp(pixels, { raw: { width, height, channels } }).png().toBuffer();
}

/**
 * Builds a feathered single-channel "where editing is allowed" alpha buffer
 * (0-255, one byte per pixel, row-major — index i = y*width+x) from a
 * rectangular box: 255 inside the box, 0 outside, blurred so the boundary
 * is a soft falloff rather than a hard rectangle that would look pasted-in.
 *
 * .greyscale() is load-bearing, not cosmetic: sharp silently expands a
 * single-channel raw buffer to 3 channels through .blur() otherwise, which
 * shifts every index in blendWithAlpha() below and silently corrupts the
 * blend — confirmed by testing before this was caught; without it, the
 * "edited" region falls back to 100% original pixels with no error.
 *
 * featherPx <= 0 means an intentionally hard edge (e.g. the mask sent to a
 * model itself, as opposed to the local blend-back step) — skip .blur()
 * entirely in that case rather than calling it with 0, which sharp rejects
 * outright ("Expected number between 0.3 and 1000 for sigma").
 */
export async function boxToAlphaBuffer(width: number, height: number, box: DetectionBox, featherPx = 16): Promise<Buffer> {
  const maskRaw = Buffer.alloc(width * height, 0);
  const x0 = Math.max(0, Math.round(box.x * width));
  const y0 = Math.max(0, Math.round(box.y * height));
  const x1 = Math.min(width, Math.round((box.x + box.w) * width));
  const y1 = Math.min(height, Math.round((box.y + box.h) * height));
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      maskRaw[y * width + x] = 255;
    }
  }
  if (featherPx <= 0) return maskRaw;
  return sharp(maskRaw, { raw: { width, height, channels: 1 } }).blur(featherPx).greyscale().raw().toBuffer();
}

/**
 * The actual guarantee: no masked-edit provider (OpenAI's gpt-image,
 * Replicate's FLUX Fill) is trusted to leave pixels outside the mask
 * byte-identical to the input — a confirmed, reproducible complaint on
 * gpt-image was the whole photo coming back with subtly different color
 * grading, wall texture, or grain. This enforces it locally instead of
 * hoping the model behaves: only pixels where `alpha` is bright are allowed
 * to come from `edited`; everywhere else is forced back to `original`,
 * regardless of what the model did to the rest of the canvas.
 *
 * `alpha` must already be sized width×height, single channel, 0-255 — see
 * boxToAlphaBuffer() for the common rectangular case, or pass a real
 * segmentation mask's own alpha channel directly for pixel-precise edits.
 */
export async function blendWithAlpha(
  original: Buffer,
  edited: Buffer,
  width: number,
  height: number,
  alpha: Buffer,
): Promise<Buffer> {
  const [originalRgba, editedRgba] = await Promise.all([
    sharp(original).ensureAlpha().raw().toBuffer(),
    sharp(edited).resize(width, height).ensureAlpha().raw().toBuffer(),
  ]);

  const out = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const a = alpha[i] / 255;
    const base = i * 4;
    out[base] = Math.round(editedRgba[base] * a + originalRgba[base] * (1 - a));
    out[base + 1] = Math.round(editedRgba[base + 1] * a + originalRgba[base + 1] * (1 - a));
    out[base + 2] = Math.round(editedRgba[base + 2] * a + originalRgba[base + 2] * (1 - a));
    out[base + 3] = 255;
  }

  return sharp(out, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

/** Convenience wrapper for the common case — a rectangular placement/removal box rather than a real segmentation mask. */
export async function blendEditedRegion(
  original: Buffer,
  edited: Buffer,
  width: number,
  height: number,
  box: DetectionBox,
): Promise<Buffer> {
  const alpha = await boxToAlphaBuffer(width, height, box);
  return blendWithAlpha(original, edited, width, height, alpha);
}

/**
 * Two providers, two opposite mask conventions for the same underlying
 * "region to edit" concept — both take a generic 0-255 alpha buffer where
 * 255 = editable region (matching blendWithAlpha's convention, and what
 * lib/ai/vision/segmentation.ts's real object masks already use) and
 * produce whatever byte format that provider's API actually wants.
 */

/** OpenAI images/edits: RGBA PNG, alpha 0 = editable region, alpha 255 = keep as-is (inverted from our internal convention). */
export async function alphaToOpenAiMaskPng(alpha: Buffer, width: number, height: number): Promise<Buffer> {
  const channels = 4;
  const pixels = Buffer.alloc(width * height * channels, 255);
  for (let i = 0; i < width * height; i++) {
    pixels[i * channels + 3] = 255 - alpha[i];
  }
  return sharp(pixels, { raw: { width, height, channels } }).png().toBuffer();
}

/** FLUX Fill (and most Stable-Diffusion-style inpainting models): plain greyscale PNG, white = editable region, black = keep as-is — same polarity as our internal convention, no inversion needed. */
export async function alphaToGreyscaleMaskPng(alpha: Buffer, width: number, height: number): Promise<Buffer> {
  return sharp(alpha, { raw: { width, height, channels: 1 } }).png().toBuffer();
}
