import { clampBox } from "./placementBoxes";
import type { DetectionBox } from "./types";

/**
 * Browser-only image helpers (window.Image) shared by the placement UIs.
 * Do not import from server code.
 */

/** Reads a product photo's real width:height ratio without a network re-fetch (browser cache handles it). */
export function loadImageAspectRatio(url: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => resolve(img.naturalWidth / img.naturalHeight);
    img.onerror = () => reject(new Error("Failed to load product image"));
    img.src = url;
  });
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
