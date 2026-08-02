import sharp from "sharp";
import { fetchReplicateOutput, replicateEnabled, runReplicateModel } from "./replicate";
import { COMPOSITE_MAX_EDGE } from "../composite";
import { clampBox } from "../../placementBoxes";
import type { DetectionBox, ProductCategory } from "../../types";

/**
 * Text-prompted detection + pixel-precise mask of an object already
 * physically in a room photo — the segmentation half of "remove that
 * sofa": Claude vision (lib/ai/locate.ts) can only estimate a rectangular
 * bounding box, which erases/repaints some surrounding wall or floor along
 * with the object. This gets the object's actual silhouette instead.
 *
 * Model: schananas/grounded_sam (Grounding DINO + SAM). The user asked for
 * "Grounded-SAM-2" specifically, but Replicate's own site returns 403 to
 * automated fetches, so its exact schema couldn't be verified directly —
 * what IS verified, via multiple independent sources converging on the
 * same field names (search results + the model's own GitHub repo name,
 * schananas/grounded_sam_replicate), is schananas/grounded_sam's input/
 * output shape below. That's what this ships against. If a specific
 * Grounded-SAM-2 hosting is preferred once you can browse Replicate
 * directly, REPLICATE_SEGMENTATION_MODEL overrides the default with no
 * code change — same "env var, not hardcoded" pattern used for every
 * Replicate model in this app, precisely because this kind of drift is
 * expected.
 */

const DEFAULT_MODEL = "schananas/grounded_sam";

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
  /**
   * Single-channel 0-255 alpha buffer, row-major (index = y*width+x),
   * exactly width×height. 255 = the detected object (the region an
   * inpaint should edit), 0 = everything else. Matches
   * lib/ai/imageMasking.ts's internal convention directly — hand it to
   * blendWithAlpha() or either alphaTo*MaskPng() converter as-is.
   */
  alpha: Buffer;
  width: number;
  height: number;
}

function extractMaskRefs(output: unknown): string[] {
  if (Array.isArray(output)) return output.filter((v): v is string => typeof v === "string");
  if (typeof output === "string") return [output];
  return [];
}

async function resolveMaskBuffer(ref: string): Promise<Buffer> {
  if (ref.startsWith("data:")) {
    const base64 = ref.split(",")[1] ?? "";
    return Buffer.from(base64, "base64");
  }
  return fetchReplicateOutput(ref);
}

/** Scans a full-resolution alpha buffer for its bright-pixel bounding box — the model doesn't return one, only the mask itself. */
function boundingBoxFromAlpha(alpha: Buffer, width: number, height: number): DetectionBox | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  const threshold = 128;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (alpha[y * width + x] > threshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX || maxY < minY) return null;
  return clampBox({
    x: minX / width,
    y: minY / height,
    w: (maxX - minX + 1) / width,
    h: (maxY - minY + 1) / height,
  });
}

/**
 * `descriptionHint` (e.g. "gray fabric sofa" from the room-inventory
 * checklist) is a far better text prompt than the generic category label
 * when one's available — falls back to CATEGORY_LABELS otherwise. Returns
 * null (never throws past its own try/catch) on any failure — every
 * caller in this app treats a vision-provider miss as "this specific
 * capability is unavailable this turn," not a hard error, same as
 * lib/ai/locate.ts's existing degrade-gracefully behavior.
 */
export async function segmentExistingFurniture(
  roomPhoto: Buffer,
  category: ProductCategory,
  descriptionHint?: string,
): Promise<SegmentationResult | null> {
  if (!replicateEnabled()) return null;
  const prompt = descriptionHint?.trim() || CATEGORY_LABELS[category];
  try {
    // Same resize bound every removal-pipeline function applies to the same
    // raw input (lib/ai/composite.ts, lib/ai/fluxFill.ts) — deterministic
    // for identical input bytes, so the alpha buffer returned here lines up
    // with whatever those functions independently resize the same room
    // photo to, with no need to thread a pre-resized buffer between them.
    const resized = await sharp(roomPhoto)
      .rotate()
      .resize(COMPOSITE_MAX_EDGE, COMPOSITE_MAX_EDGE, { fit: "inside", withoutEnlargement: true })
      .toBuffer();
    const meta = await sharp(resized).metadata();
    const width = meta.width ?? 1024;
    const height = meta.height ?? 1024;
    const jpeg = await sharp(resized).jpeg({ quality: 90 }).toBuffer();
    const dataUri = `data:image/jpeg;base64,${jpeg.toString("base64")}`;

    const output = await runReplicateModel(modelSlug(), {
      image: dataUri,
      mask_prompt: prompt,
      negative_mask_prompt: "",
      // Small positive dilation so the mask covers a few pixels beyond the
      // object's exact silhouette — gives the inpaint step room to blend
      // shadows/contact edges, same reasoning as the padded box used for
      // the box-based fallback, but via the model's own native dilation
      // (its documented purpose) instead of expanding a rectangle we don't
      // have here.
      adjustment_factor: 6,
    });

    const refs = extractMaskRefs(output);
    if (refs.length === 0) {
      console.log(`[maison] segmentation: model returned no mask for "${prompt}"`);
      return null;
    }

    const maskBuffer = await resolveMaskBuffer(refs[0]);
    // Match the room photo's own resolution exactly — the model's mask
    // dimensions aren't guaranteed to equal the input's.
    const alpha = await sharp(maskBuffer).resize(width, height).greyscale().raw().toBuffer();

    const box = boundingBoxFromAlpha(alpha, width, height);
    if (!box) {
      console.log(`[maison] segmentation: mask returned but empty for "${prompt}"`);
      return null;
    }

    return { box, alpha, width, height };
  } catch (err) {
    console.error(`[maison] segmentation failed for "${prompt}", falling back to box-based removal:`, err);
    return null;
  }
}
