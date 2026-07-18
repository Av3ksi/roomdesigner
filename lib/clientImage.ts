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

/** Converts a base64 PNG (an /api/composite result) into a File usable as the next edit's base image. */
export function base64PngToFile(base64: string, filename: string): File {
  const bytes = atob(base64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new File([arr], filename, { type: "image/png" });
}
