import type { DetectionBox, ProductCategory } from "./types";

/**
 * Client-safe placement data shared by the compositing pipeline (server)
 * and the placement UI (client) — deliberately no sharp/SDK imports here.
 *
 * These are the context-blind fallback boxes, tuned for a typical
 * eye-level living-room photo. Real placement comes from either a Claude
 * vision suggestion (lib/ai/placement.ts) or the user dragging the box on
 * their actual photo; these only apply when neither has happened yet.
 */
export const DEFAULT_CATEGORY_BOX: Record<ProductCategory, DetectionBox> = {
  sofa: { x: 0.28, y: 0.52, w: 0.46, h: 0.3 },
  chair: { x: 0.06, y: 0.5, w: 0.2, h: 0.28 },
  table: { x: 0.38, y: 0.72, w: 0.22, h: 0.14 },
  lighting: { x: 0.82, y: 0.3, w: 0.12, h: 0.45 },
  rug: { x: 0.22, y: 0.8, w: 0.56, h: 0.16 },
  art: { x: 0.36, y: 0.14, w: 0.3, h: 0.22 },
  plant: { x: 0.86, y: 0.42, w: 0.12, h: 0.38 },
  storage: { x: 0.02, y: 0.3, w: 0.18, h: 0.4 },
  decor: { x: 0.42, y: 0.66, w: 0.1, h: 0.1 },
  textile: { x: 0.32, y: 0.58, w: 0.14, h: 0.1 },
};

export const MIN_BOX_SIZE = 0.05;

/** Clamps a box to stay fully inside the image with a sane minimum size. */
export function clampBox(box: DetectionBox): DetectionBox {
  const w = Math.min(1, Math.max(MIN_BOX_SIZE, box.w));
  const h = Math.min(1, Math.max(MIN_BOX_SIZE, box.h));
  return {
    w,
    h,
    x: Math.min(1 - w, Math.max(0, box.x)),
    y: Math.min(1 - h, Math.max(0, box.y)),
  };
}

export function isValidBox(box: unknown): box is DetectionBox {
  if (typeof box !== "object" || box === null) return false;
  const b = box as Record<string, unknown>;
  return ["x", "y", "w", "h"].every((k) => typeof b[k] === "number" && Number.isFinite(b[k] as number));
}
