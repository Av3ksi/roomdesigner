import { clampBox } from "./placementBoxes";
import type { DetectionBox } from "./types";

/**
 * Browser-only image helpers (window.Image) shared by the placement UIs.
 * Do not import from server code.
 */

/**
 * Reads a product photo's real (padding-trimmed) width:height ratio via
 * the server (app/api/products/aspect-ratio) rather than a browser canvas.
 * VidaXL product photos are studio shots on a near-white background with
 * uneven padding around the actual product — the raw file's ratio isn't
 * the product's real shape. A canvas-based trim was tried first but needs
 * the image host to send CORS headers for pixel access to work at all; a
 * real, confirmed failure showed vidaXL's image host doesn't send them, so
 * it silently fell back to the untrimmed (near-square, padded) ratio —
 * which made a wide sofa's placement box come out square, and the model
 * had to squeeze the sofa to fit it. A server-to-server fetch (sharp's
 * trim(), see lib/ai/composite.ts's productAspectRatio) has no such
 * restriction, so that box-warping failure mode is now structurally
 * impossible rather than something to catch case-by-case.
 */
export async function loadImageAspectRatio(url: string): Promise<number> {
  const res = await fetch(`/api/products/aspect-ratio?url=${encodeURIComponent(url)}`);
  if (!res.ok) throw new Error("Failed to read product image aspect ratio");
  const { aspectRatio } = (await res.json()) as { aspectRatio: number };
  if (typeof aspectRatio !== "number" || !Number.isFinite(aspectRatio) || aspectRatio <= 0) {
    throw new Error("Invalid aspect ratio returned");
  }
  return aspectRatio;
}

/**
 * Placement boxes only know the category, not whether this specific product
 * is a tall wardrobe or a low sideboard. Reshape to the product's actual
 * proportions: keep the suggested width (footprint estimate) and the floor
 * contact point (bottom edge) fixed, recompute height from the real ratio.
 */
export function reshapeBoxToAspectRatio(box: DetectionBox, aspectRatio: number): DetectionBox {
  const bottom = box.y + box.h;
  const h = box.w / aspectRatio;
  return clampBox({ x: box.x, y: bottom - h, w: box.w, h });
}

function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const bytes = atob(base64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return arr;
}

/** Converts a base64 PNG (an /api/composite result) into a File usable as the next edit's base image. */
export function base64PngToFile(base64: string, filename: string): File {
  return new File([base64ToBytes(base64)], filename, { type: "image/png" });
}

/** Converts an arbitrary base64 image (any format) into a File with the given mime type. */
export function base64ToFile(base64: string, filename: string, mime: string): File {
  return new File([base64ToBytes(base64)], filename, { type: mime });
}

/** Sniffs the real format from a base64 payload's leading bytes — rehydrated rooms only have the base64, not a Content-Type. */
export function detectImageMimeFromBase64(base64: string): string {
  if (base64.startsWith("iVBORw0KGgo")) return "image/png";
  if (base64.startsWith("UklGR")) return "image/webp";
  return "image/jpeg";
}

/**
 * Downscales an arbitrary upload to a reasonable size before it goes
 * anywhere (an AI edit endpoint, or straight into Postgres as base64) — a
 * phone photo can be 10+ MB, far more than any of these need.
 */
export async function fileToDownscaledJpeg(file: File, maxDimension = 1568): Promise<{ dataUrl: string; base64: string }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
  return { dataUrl, base64: dataUrl.split(",")[1] ?? "" };
}
