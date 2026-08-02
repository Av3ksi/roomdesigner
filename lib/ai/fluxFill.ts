import sharp from "sharp";
import { fetchReplicateOutput, replicateEnabled, runReplicateModel } from "./vision/replicate";
import type { SegmentationResult } from "./vision/segmentation";
import { alphaToGreyscaleMaskPng, blendWithAlpha, boxToAlphaBuffer } from "./imageMasking";
import {
  CATEGORY_PLACEMENT_HINT,
  COMPOSITE_MAX_EDGE,
  MASK_PADDING,
  describeProductForPrompt,
  matchingDetectionBox,
  type CompositeResult,
  type RemovalResult,
} from "./composite";
import { DEFAULT_CATEGORY_BOX, clampBox } from "../placementBoxes";
import type { Detection, DetectionBox, ProductCategory } from "../types";

/**
 * Replicate-hosted FLUX Fill compositing — the new primary path for
 * "add this product to the room," replacing lib/ai/composite.ts's
 * compositeProductIntoRoom() (OpenAI gpt-image) in the live flow. That
 * function stays in place, fully working, deliberately unused — a fallback
 * if this needs to be rolled back, not dead code to delete.
 *
 * IMPORTANT, found while building this (report before assuming, as asked):
 * FLUX Fill's real API — verified against multiple independent sources
 * since replicate.com returns 403 to automated fetches — is `image` +
 * `mask` + `prompt` ONLY. There is no second "reference image" input the
 * way OpenAI's multi-image edit took a real product photo alongside the
 * room photo. That means this function can only describe the product in
 * TEXT (via describeProductForPrompt, same Claude-vision description
 * composite.ts already generates) — it has no visual anchor to the real
 * product photo's exact appearance the way the OpenAI path at least
 * attempted. This is a genuine capability tradeoff, not an oversight: if
 * exact visual product fidelity from a reference photo matters more than
 * whatever FLUX's own inpainting quality buys you, that's a real reason to
 * keep using the OpenAI path for now. (Separately: the original motivating
 * bug for this switch — "the whole room changes, not just the masked area"
 * — is now fixed at the OpenAI path too, via the local blend-back guarantee
 * in lib/ai/imageMasking.ts. Both providers get that guarantee here.)
 */

export function fluxFillEnabled(): boolean {
  return replicateEnabled();
}

const DEFAULT_MODEL = "black-forest-labs/flux-fill-pro";

function modelSlug(): string {
  return process.env.REPLICATE_FLUX_MODEL || DEFAULT_MODEL;
}

function extractImageRef(output: unknown): string | null {
  if (typeof output === "string") return output;
  if (Array.isArray(output)) {
    const first = output.find((v) => typeof v === "string");
    return typeof first === "string" ? first : null;
  }
  return null;
}

async function resolveOutputBuffer(ref: string): Promise<Buffer> {
  if (ref.startsWith("data:")) {
    const base64 = ref.split(",")[1] ?? "";
    return Buffer.from(base64, "base64");
  }
  return fetchReplicateOutput(ref);
}

export async function compositeProductIntoRoomFlux(
  roomPhotoInput: Buffer,
  productPhoto: Buffer,
  category: ProductCategory,
  detections: Detection[] = [],
  explicitBox?: DetectionBox,
  /** Estimated angle of the wall/floor plane the box sits against — see lib/ai/placement.ts. 0 or undefined = no rotation hint. */
  wallAngleDeg?: number,
): Promise<CompositeResult> {
  if (!fluxFillEnabled()) throw new Error("REPLICATE_API_TOKEN not configured");

  const roomPhoto = await sharp(roomPhotoInput)
    .rotate()
    .resize(COMPOSITE_MAX_EDGE, COMPOSITE_MAX_EDGE, { fit: "inside", withoutEnlargement: true })
    .toBuffer();
  const meta = await sharp(roomPhoto).metadata();
  const width = meta.width ?? 1024;
  const height = meta.height ?? 1024;

  const detectedBox = explicitBox ? null : matchingDetectionBox(category, detections);
  const maskBox = explicitBox ? clampBox(explicitBox) : detectedBox ?? DEFAULT_CATEGORY_BOX[category];
  const placementSource: CompositeResult["placementSource"] = explicitBox ? "explicit" : detectedBox ? "detection" : "default";

  const paddedBox = clampBox({
    x: maskBox.x - MASK_PADDING,
    y: maskBox.y - MASK_PADDING,
    w: maskBox.w + MASK_PADDING * 2,
    h: maskBox.h + MASK_PADDING * 2,
  });
  console.log("[maison] compositeProductIntoRoomFlux mask", { placementSource, maskBox, paddedBox });

  // The mask fed to the model itself stays hard-edged (no feather) — the
  // feathering that makes the seam look natural happens locally in the
  // blend-back step below, not in what we tell the model it may touch.
  const modelAlpha = await boxToAlphaBuffer(width, height, paddedBox, 0);
  const maskPng = await alphaToGreyscaleMaskPng(modelAlpha, width, height);
  const roomPng = await sharp(roomPhoto).png().toBuffer();
  const productDescription = await describeProductForPrompt(productPhoto);

  const wallAngleInstruction =
    wallAngleDeg && Math.abs(wallAngleDeg) > 2
      ? ` The wall or floor plane behind this position recedes at approximately ${Math.round(wallAngleDeg)}° from the camera ` +
        `(${wallAngleDeg > 0 ? "receding away to the right" : "receding away to the left"}, matching this photo's actual ` +
        "vanishing lines) — rotate the product so its parallel edges align exactly with that plane."
      : wallAngleDeg === 0
        ? " The wall behind this position faces the camera directly — keep the product's front face parallel to the camera plane."
        : "";

  const prompt =
    `A real ${category}${productDescription ? `: ${productDescription}` : ""}, composited naturally into this room photo ` +
    "at the masked location — matching the room's real perspective, scale, and lighting, with a realistic contact shadow " +
    "where it touches the floor or wall. " +
    (explicitBox
      ? "The masked region marks the exact intended position — fit the product naturally within it."
      : `Place it realistically the way it would actually sit in a lived-in room: ${CATEGORY_PLACEMENT_HINT[category]}.`) +
    wallAngleInstruction;

  const output = await runReplicateModel(modelSlug(), {
    image: `data:image/png;base64,${roomPng.toString("base64")}`,
    mask: `data:image/png;base64,${maskPng.toString("base64")}`,
    prompt,
  });

  const imageRef = extractImageRef(output);
  if (!imageRef) throw new Error("FLUX Fill returned no image output");
  const editedBuffer = await resolveOutputBuffer(imageRef);

  // Same local guarantee as the OpenAI path — FLUX isn't trusted to leave
  // pixels outside the mask untouched either, only this time WITH feather
  // for a natural-looking blend seam.
  const blendAlpha = await boxToAlphaBuffer(width, height, paddedBox);
  const blended = await blendWithAlpha(roomPhoto, editedBuffer, width, height, blendAlpha);
  return { imageBase64: blended.toString("base64"), maskBox, placementSource };
}

const REMOVAL_PROMPT = (category: ProductCategory) =>
  `Remove the ${category} from the masked region entirely. Fill in what would realistically be behind it — ` +
  "matching the existing floor, wall, and lighting exactly, as if the object was never there.";

async function runFluxRemovalBuffer(roomPhoto: Buffer, maskPng: Buffer, category: ProductCategory): Promise<Buffer> {
  const roomPng = await sharp(roomPhoto).png().toBuffer();
  const output = await runReplicateModel(modelSlug(), {
    image: `data:image/png;base64,${roomPng.toString("base64")}`,
    mask: `data:image/png;base64,${maskPng.toString("base64")}`,
    prompt: REMOVAL_PROMPT(category),
  });
  const imageRef = extractImageRef(output);
  if (!imageRef) throw new Error("FLUX Fill returned no image output");
  return resolveOutputBuffer(imageRef);
}

/**
 * Box-based removal — the fallback tier when Grounded-SAM segmentation
 * (below) doesn't find the object, or when the caller already has a known
 * box (the room-inventory checklist) and skipping segmentation entirely is
 * fine. Mirrors lib/ai/composite.ts's removeExistingObject() exactly, just
 * FLUX-Fill-backed instead of OpenAI-backed.
 */
export async function removeExistingObjectFlux(
  roomPhotoInput: Buffer,
  box: DetectionBox,
  category: ProductCategory,
): Promise<RemovalResult> {
  if (!fluxFillEnabled()) throw new Error("REPLICATE_API_TOKEN not configured");

  const roomPhoto = await sharp(roomPhotoInput)
    .rotate()
    .resize(COMPOSITE_MAX_EDGE, COMPOSITE_MAX_EDGE, { fit: "inside", withoutEnlargement: true })
    .toBuffer();
  const meta = await sharp(roomPhoto).metadata();
  const width = meta.width ?? 1024;
  const height = meta.height ?? 1024;

  const paddedBox = clampBox({
    x: box.x - MASK_PADDING,
    y: box.y - MASK_PADDING,
    w: box.w + MASK_PADDING * 2,
    h: box.h + MASK_PADDING * 2,
  });
  const modelAlpha = await boxToAlphaBuffer(width, height, paddedBox, 0);
  const maskPng = await alphaToGreyscaleMaskPng(modelAlpha, width, height);

  const editedBuffer = await runFluxRemovalBuffer(roomPhoto, maskPng, category);

  const blendAlpha = await boxToAlphaBuffer(width, height, paddedBox);
  const blended = await blendWithAlpha(roomPhoto, editedBuffer, width, height, blendAlpha);
  return { imageBase64: blended.toString("base64") };
}

/**
 * Pixel-precise removal using a real Grounded-SAM mask instead of a
 * rectangular box — the primary tier when segmentation succeeds. `seg`
 * must have been computed against the SAME room photo bytes this receives
 * (segmentExistingFurniture and this function independently apply the
 * identical resize, so their dimensions line up without threading a
 * pre-resized buffer between the two).
 */
export async function removeExistingObjectFluxWithMask(
  roomPhotoInput: Buffer,
  seg: SegmentationResult,
  category: ProductCategory,
): Promise<RemovalResult> {
  if (!fluxFillEnabled()) throw new Error("REPLICATE_API_TOKEN not configured");

  const roomPhoto = await sharp(roomPhotoInput)
    .rotate()
    .resize(COMPOSITE_MAX_EDGE, COMPOSITE_MAX_EDGE, { fit: "inside", withoutEnlargement: true })
    .toBuffer();

  const maskPng = await alphaToGreyscaleMaskPng(seg.alpha, seg.width, seg.height);
  const editedBuffer = await runFluxRemovalBuffer(roomPhoto, maskPng, category);

  // seg.alpha already has its own model-driven dilation (adjustment_factor)
  // instead of the box padding used elsewhere — feed it straight into the
  // blend guarantee too, rather than re-deriving a box from it.
  const blended = await blendWithAlpha(roomPhoto, editedBuffer, seg.width, seg.height, seg.alpha);
  return { imageBase64: blended.toString("base64") };
}
