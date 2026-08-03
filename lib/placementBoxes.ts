import type { DetectionBox, ProductCategory } from "./types";

/**
 * Real photos (a phone camera shot, easily 4000×3000+) are far larger than
 * an image-edit API needs — sending one uncompressed is slow to upload,
 * slower for the model to process, and risks silently hitting whatever
 * size/dimension limit the API enforces. Downscaling first is standard
 * practice, and every compositing/removal/segmentation function that
 * independently resizes the same raw input applies this exact bound —
 * deterministic for identical input bytes, so their outputs line up
 * without threading a pre-resized buffer between them. Lives here (not in
 * lib/ai/composite.ts, where it originated) specifically so
 * lib/ai/vision/segmentation.ts can import it without segmentation.ts and
 * composite.ts importing each other — composite.ts started importing
 * segmentExistingFurniture too once segmentation-refined blending was
 * added, which would've been a real circular import otherwise.
 */
export const COMPOSITE_MAX_EDGE = 2048;

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

/** Plain-English position for a box's center — a soft hint in a text prompt, not a coordinate. */
export function describeRoughLocation(box: DetectionBox): string {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const h = cx < 0.4 ? "left" : cx > 0.6 ? "right" : "center";
  const v = cy < 0.4 ? "upper" : cy > 0.6 ? "lower" : "middle";
  return `${v} ${h}`;
}

/**
 * Fraction of the smaller box's area that's covered by the intersection —
 * used to tell "this is a replacement for what's already there" apart from
 * "this is a second, distinct item elsewhere in the room." A real,
 * confirmed failure: asking for "another sofa" after already placing one
 * rendered a SECOND full sofa crammed in next to the first — two different
 * catalog products, so the existing exact-product dedup never caught it,
 * but their placement boxes overlapped heavily. Physical objects that
 * overlap this much can't both really be there; the newer one replaces
 * the older one.
 */
export function boxOverlapRatio(a: DetectionBox, b: DetectionBox): number {
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.w, b.x + b.w);
  const y1 = Math.min(a.y + a.h, b.y + b.h);
  const interArea = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  const smallerArea = Math.min(a.w * a.h, b.w * b.h);
  return smallerArea > 0 ? interArea / smallerArea : 0;
}

/**
 * Padding added around a placement box before it becomes an edit mask —
 * gives the model room to blend shadows/contact edges rather than a hard,
 * silhouette-exact boundary. A real, confirmed failure: a flat,
 * size-independent padding constant gave a wide corner sofa (spanning
 * ~30%+ of the frame) proportionally far LESS legroom than a small decor
 * item gets — and the app's own local blend-back guarantee (see
 * lib/ai/imageMasking.ts) enforces the padded boundary with zero
 * tolerance, so anything the model painted past it isn't softened, it's
 * discarded outright. Visually that reads as the object being amputated
 * at a hard edge. Padding now scales with the box's own size (12% of its
 * width/height per axis) with `flatPadding` as a floor, so a wide item
 * automatically gets more room than a small one instead of the same flat
 * amount either way.
 */
export function padBoxForEdit(box: DetectionBox, flatPadding = 0.04, proportional = 0.12): DetectionBox {
  const padX = Math.max(flatPadding, box.w * proportional);
  const padY = Math.max(flatPadding, box.h * proportional);
  return clampBox({
    x: box.x - padX,
    y: box.y - padY,
    w: box.w + padX * 2,
    h: box.h + padY * 2,
  });
}

/** The smallest box that contains every input box — used to build one combined edit mask covering several placement spots at once. */
export function unionBox(boxes: DetectionBox[]): DetectionBox {
  const x0 = Math.min(...boxes.map((b) => b.x));
  const y0 = Math.min(...boxes.map((b) => b.y));
  const x1 = Math.max(...boxes.map((b) => b.x + b.w));
  const y1 = Math.max(...boxes.map((b) => b.y + b.h));
  return clampBox({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
}
