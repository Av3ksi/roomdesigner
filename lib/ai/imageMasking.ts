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

/**
 * OpenAI images/edits mask convention: alpha 255 = keep original as-is,
 * alpha 0 = region the model may edit.
 *
 * featherPx softens the boundary instead of a hard rectangle cutout — a
 * real, reported "pasted-on" look at the edge, even after this app's own
 * local blend-back (which is feathered separately, see boxToAlphaBuffer)
 * — because the mask OpenAI itself sees when generating was still a hard
 * 0/255 edge, giving its own inpainting nothing to feather against. Built
 * on boxToAlphaBuffer + alphaToOpenAiMaskPng (already correct, already
 * used by the FLUX path) rather than a third hand-rolled implementation of
 * the same "blur a single-channel alpha buffer safely" logic.
 */
export async function buildMaskPng(width: number, height: number, box: DetectionBox, featherPx = 6): Promise<Buffer> {
  const alpha = await boxToAlphaBuffer(width, height, box, featherPx);
  return alphaToOpenAiMaskPng(alpha, width, height);
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
  return featherAlpha(maskRaw, width, height, featherPx);
}

/**
 * Blurs an EXISTING single-channel 0-255 alpha buffer for a soft edge —
 * split out of boxToAlphaBuffer so a real object-shaped alpha buffer (a
 * segmentation mask, not a rectangle — see lib/ai/vision/segmentation.ts)
 * can get the exact same safe feathering without a third hand-rolled copy
 * of this logic. .greyscale() after .blur() is load-bearing, not
 * cosmetic — see boxToAlphaBuffer's doc comment above for the confirmed
 * bug this guards against. featherPx <= 0 returns the input unchanged
 * (an intentionally hard edge) rather than calling .blur(0), which sharp
 * rejects outright.
 */
export async function featherAlpha(alpha: Buffer, width: number, height: number, featherPx: number): Promise<Buffer> {
  if (featherPx <= 0) return alpha;
  return sharp(alpha, { raw: { width, height, channels: 1 } }).blur(featherPx).greyscale().raw().toBuffer();
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
 * Post-composite color/tone harmonization — even with a good mask, a
 * masked edit can come back with a subtly different color grading,
 * exposure or white balance than the rest of the room photo. This is a
 * known limitation of generative inpainting itself, not something a mask
 * alone fixes — it's why tools like Photoshop's Generative Fill ship a
 * separate "Harmonize" pass rather than relying on the fill step alone.
 *
 * REQUIRES a real object-shaped alpha (a segmentation mask, e.g. from
 * lib/ai/vision/segmentation.ts) — not a rectangular box. A first version
 * of this function took a box and computed ONE statistic for everything
 * inside it; a real, confirmed regression from that: the box contains
 * BOTH the product AND slices of wall/floor also inside the padded
 * region, so one blanket "average color" doesn't represent either well,
 * and applying it uniformly produced a visible flat-colored wash across
 * the whole box — worse than doing nothing. Only pixels where `alpha` is
 * bright (>128) count as "the product" for computing its own statistics;
 * only pixels clearly outside any dilated/feathered edge (<32) count as
 * "context". If you don't have a real object mask, don't call this at
 * all — a caller with only a box should skip harmonization entirely
 * rather than pass a box-shaped alpha in, which reproduces the same bug.
 *
 * Shifts the product's own per-channel mean/stddev toward a sample of the
 * room photo's OWN pixels immediately around it — a simplified, RGB-space
 * version of classic Reinhard color transfer (not full LAB-space, to keep
 * this dependency-free and easy to verify). The correction is applied
 * per-pixel, weighted by that pixel's own alpha value and `strength`
 * together, so a feathered edge gets a gentler correction than the solid
 * interior — composes cleanly with a subsequent blendWithAlpha() call
 * using the same alpha, rather than fighting it at the boundary.
 */
export async function harmonizeRegion(
  original: Buffer,
  edited: Buffer,
  width: number,
  height: number,
  alpha: Buffer,
  strength = 0.6,
): Promise<Buffer> {
  const [originalRgba, editedRgba] = await Promise.all([
    sharp(original).ensureAlpha().raw().toBuffer(),
    sharp(edited).resize(width, height).ensureAlpha().raw().toBuffer(),
  ]);

  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (alpha[y * width + x] > 128) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX || maxY < minY) return edited; // nothing bright in the mask — nothing to harmonize

  // Context ring anchored to the object's own real extent (not a generic
  // padded box) — a room can have very different lighting across it (a
  // sunlit window vs. a shaded corner), so the immediate surroundings are
  // the relevant reference, not a global average.
  const ringMargin = Math.max(8, Math.round(Math.min(maxX - minX, maxY - minY) * 0.25));
  const rx0 = Math.max(0, minX - ringMargin);
  const ry0 = Math.max(0, minY - ringMargin);
  const rx1 = Math.min(width, maxX + ringMargin);
  const ry1 = Math.min(height, maxY + ringMargin);

  const contextSum = [0, 0, 0];
  const contextSumSq = [0, 0, 0];
  let contextCount = 0;
  const editedSum = [0, 0, 0];
  const editedSumSq = [0, 0, 0];
  let editedCount = 0;

  for (let y = ry0; y < ry1; y++) {
    for (let x = rx0; x < rx1; x++) {
      const i = y * width + x;
      const a = alpha[i];
      const base = i * 4;
      if (a > 128) {
        for (let c = 0; c < 3; c++) {
          const v = editedRgba[base + c];
          editedSum[c] += v;
          editedSumSq[c] += v * v;
        }
        editedCount++;
      } else if (a < 32) {
        for (let c = 0; c < 3; c++) {
          const v = originalRgba[base + c];
          contextSum[c] += v;
          contextSumSq[c] += v * v;
        }
        contextCount++;
      }
      // 32 <= a <= 128 (the feathered transition) counts toward neither —
      // ambiguous whether it's "product" or "background" in either image.
    }
  }
  if (contextCount === 0 || editedCount === 0) return edited;

  const contextMean = [0, 0, 0];
  const contextStd = [0, 0, 0];
  const editedMean = [0, 0, 0];
  const editedStd = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    contextMean[c] = contextSum[c] / contextCount;
    contextStd[c] = Math.sqrt(Math.max(0, contextSumSq[c] / contextCount - contextMean[c] ** 2)) || 1;
    editedMean[c] = editedSum[c] / editedCount;
    editedStd[c] = Math.sqrt(Math.max(0, editedSumSq[c] / editedCount - editedMean[c] ** 2)) || 1;
  }

  const out = Buffer.from(editedRgba);
  for (let i = 0; i < width * height; i++) {
    const a = alpha[i];
    if (a === 0) continue; // blendWithAlpha will use 100% original here anyway
    const weight = (a / 255) * strength;
    const base = i * 4;
    for (let c = 0; c < 3; c++) {
      const v = editedRgba[base + c];
      const ratio = contextStd[c] / editedStd[c];
      const fullyMatched = (v - editedMean[c]) * ratio + contextMean[c];
      const corrected = v * (1 - weight) + fullyMatched * weight;
      out[base + c] = Math.max(0, Math.min(255, Math.round(corrected)));
    }
  }

  return sharp(out, { raw: { width, height, channels: 4 } }).png().toBuffer();
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
