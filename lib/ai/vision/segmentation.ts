import sharp from "sharp";
import { fetchReplicateOutput, replicateEnabled, runReplicateModel } from "./replicate";
import type { DetectionBox, ProductCategory } from "../../types";

/**
 * Text-prompted detection + mask of an EXISTING object already in a room
 * photo — the missing piece for "remove that sofa" / "move the chair"
 * (Phase 1's compositing only ever adds a new product into an empty
 * region; docs/BLUEPRINT.md's honest critique called out that this app
 * couldn't touch furniture already in the photo). Uses a Replicate-hosted
 * grounded-segmentation model (a Grounding DINO + SAM 2 style pipeline):
 * given the photo and a text label, it returns the best-matching object's
 * mask and bounding box.
 *
 * REPLICATE_SEGMENTATION_MODEL picks the exact `owner/name` slug — verify
 * the one you want on replicate.com; the default below is a reasonable
 * starting point, not a guarantee it's still the best/available option by
 * the time you read this.
 */

const DEFAULT_MODEL = "zsxkib/grounded-sam-2";

function modelSlug(): string {
  return process.env.REPLICATE_SEGMENTATION_MODEL || DEFAULT_MODEL;
}

const CATEGORY_LABELS: Record<ProductCategory, string> = {
  sofa: "sofa, couch, sectional",
  chair: "chair, armchair",
  table: "table, desk, coffee table",
  lighting: "lamp, floor lamp, pendant light",
  rug: "rug, carpet",
  art: "wall art, painting, poster, mirror",
  plant: "plant, potted plant",
  storage: "cabinet, shelf, sideboard, wardrobe, bookcase",
  decor: "vase, decor object",
  textile: "cushion, curtain, throw blanket",
};

export interface SegmentationResult {
  box: DetectionBox;
  /** Raw mask bytes as returned by the model (PNG, same pixel dimensions as the input photo) — white/opaque marks the detected object. */
  mask: Buffer;
  confidence: number;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

interface RawDetection {
  box: [number, number, number, number];
  mask: string;
  score: number;
}

/**
 * Replicate output shapes vary by model/version — this isn't a contract
 * the way our own API routes are, so validate defensively rather than
 * trusting a fixed schema (the same lesson lib/productSearch.ts learned
 * the hard way from an LLM tool call).
 */
function parseDetections(output: unknown): RawDetection[] {
  if (!Array.isArray(output)) return [];
  const items: RawDetection[] = [];
  for (const item of output) {
    if (typeof item !== "object" || item === null) continue;
    const o = item as Record<string, unknown>;
    const box = o.box ?? o.bbox;
    const mask = o.mask ?? o.mask_url ?? o.segmentation;
    const score = o.score ?? o.confidence;
    if (Array.isArray(box) && box.length === 4 && box.every(isFiniteNumber) && typeof mask === "string") {
      items.push({ box: box as [number, number, number, number], mask, score: isFiniteNumber(score) ? score : 0.5 });
    }
  }
  return items;
}

async function resolveMaskBuffer(mask: string): Promise<Buffer> {
  if (mask.startsWith("data:")) {
    const base64 = mask.split(",")[1] ?? "";
    return Buffer.from(base64, "base64");
  }
  return fetchReplicateOutput(mask);
}

export async function segmentExistingFurniture(
  roomPhoto: Buffer,
  category: ProductCategory,
): Promise<SegmentationResult | null> {
  if (!replicateEnabled()) return null;
  try {
    const { width = 1024, height = 1024 } = await sharp(roomPhoto).metadata();
    const jpeg = await sharp(roomPhoto).rotate().jpeg({ quality: 90 }).toBuffer();
    const dataUri = `data:image/jpeg;base64,${jpeg.toString("base64")}`;

    const output = await runReplicateModel(modelSlug(), {
      image: dataUri,
      query: CATEGORY_LABELS[category],
      box_threshold: 0.3,
      text_threshold: 0.25,
    });

    const detections = parseDetections(output);
    if (detections.length === 0) return null;

    const best = detections.reduce((a, b) => (b.score > a.score ? b : a));
    const [x0, y0, x1, y1] = best.box;
    // Some models return normalized 0–1 coords, others pixel coords — infer from magnitude.
    const normalized = x1 <= 1 && y1 <= 1;
    const box: DetectionBox = normalized
      ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
      : { x: x0 / width, y: y0 / height, w: (x1 - x0) / width, h: (y1 - y0) / height };

    const mask = await resolveMaskBuffer(best.mask);
    return { box, mask, confidence: best.score };
  } catch (err) {
    console.error("[maison] segmentation failed, existing-object removal unavailable this turn:", err);
    return null;
  }
}
