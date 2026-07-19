import { clampBox } from "./placementBoxes";
import type { DetectionBox } from "./types";

/**
 * Browser-only image helpers (window.Image) shared by the placement UIs.
 * Do not import from server code.
 */

/**
 * Reads a product photo's real width:height ratio without a network
 * re-fetch (browser cache handles it). VidaXL product photos are studio
 * shots on a near-white background with uneven padding around the actual
 * product — the raw image canvas's ratio isn't the product's real shape,
 * it's "product + whatever margin that particular photo happened to have".
 * Trims the background first so callers (reshapeBoxToAspectRatio) get the
 * product's actual visual footprint instead.
 */
export function loadImageAspectRatio(url: string): Promise<number> {
  return loadImage(url, true).catch(() => loadImage(url, false));
}

function loadImage(url: string, withCors: boolean): Promise<number> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    if (withCors) img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        resolve(trimmedAspectRatio(img));
      } catch {
        // Canvas access blocked (no CORS headers from the image host) — the
        // untrimmed ratio is still a usable, if less precise, fallback.
        resolve(img.naturalWidth / img.naturalHeight);
      }
    };
    img.onerror = () => reject(new Error("Failed to load product image"));
    img.src = url;
  });
}

/** Near-white background threshold (0–255 per channel) below which a pixel counts as "the product". */
const BACKGROUND_THRESHOLD = 245;

function trimmedAspectRatio(img: HTMLImageElement): number {
  const { naturalWidth: width, naturalHeight: height } = img;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return width / height;
  ctx.drawImage(img, 0, 0);
  const { data } = ctx.getImageData(0, 0, width, height); // throws if the canvas is CORS-tainted

  let minX = width, minY = height, maxX = 0, maxY = 0, found = false;
  const step = 2; // sampling every other pixel is plenty for a bounding box and keeps this fast
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 4;
      if (data[i] < BACKGROUND_THRESHOLD || data[i + 1] < BACKGROUND_THRESHOLD || data[i + 2] < BACKGROUND_THRESHOLD) {
        found = true;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (!found || maxX <= minX || maxY <= minY) return width / height;
  return (maxX - minX) / (maxY - minY);
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
