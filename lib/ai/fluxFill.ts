import sharp from "sharp";
import { fetchReplicateOutput, replicateEnabled, runReplicateModel } from "./vision/replicate";
import type { SegmentationResult } from "./vision/segmentation";
import { alphaToGreyscaleMaskPng, blendWithAlpha, boxToAlphaBuffer } from "./imageMasking";
import {
  CATEGORY_PLACEMENT_HINT,
  describeProductForPrompt,
  matchingDetectionBox,
  type CompositeResult,
  type RemovalResult,
} from "./composite";
import { buildProductInsertionPrompt, buildRemovalPrompt } from "./prompts";
import { COMPOSITE_MAX_EDGE, DEFAULT_CATEGORY_BOX, clampBox, padBoxForEdit } from "../placementBoxes";
import type { Detection, DetectionBox, ProductCategory } from "../types";

/**
 * Replicate-hosted FLUX Fill compositing. compositeProductIntoRoomFlux()
 * (product insertion) is now the FALLBACK path, used by app/api/composite
 * only when OPENAI_API_KEY isn't configured — see that route for why:
 * FLUX Fill's real API — verified against multiple independent sources
 * since replicate.com returns 403 to automated fetches — is `image` +
 * `mask` + `prompt` ONLY. There is no second "reference image" input the
 * way OpenAI's multi-image edit takes a real product photo alongside the
 * room photo, so this can only describe the product in TEXT (via
 * describeProductForPrompt, same Claude-vision description composite.ts
 * already generates) — no visual anchor to the product's exact appearance.
 * A real, confirmed failure from exactly this gap: a kids' sofa's product
 * photo staged a child for scale, the text description carried that detail
 * over, and FLUX painted a child into the customer's room. (Fixed at the
 * prompt level — see NO_PEOPLE_INSTRUCTION in composite.ts, applied to both
 * providers now — but it's the clearest illustration of why a real image
 * reference beats a text description for fidelity.)
 *
 * removeExistingObjectFlux()/removeExistingObjectFluxWithMask() (below)
 * stay the PRIMARY path for erasing an existing object whenever Replicate
 * is configured — removal has no product-description step, so this
 * text-only limitation doesn't apply, and Grounded-SAM segmentation gives
 * genuinely better precision than OpenAI's box-only removal.
 *
 * (The original motivating bug for building this — "the whole room
 * changes, not just the masked area" — is fixed at the OpenAI path too now,
 * via the local blend-back guarantee in lib/ai/imageMasking.ts. Both
 * providers get that guarantee here.)
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
  /** The product's REAL size, when the supplier feed carries it — see scaleGroundingDirection in ./prompts. */
  dimensionsCm?: { l: number; w: number; h: number } | null,
  /** The room's estimated real dimensions (lib/ai/placement.ts). */
  roomDimensions?: { widthM: number; depthM: number; heightM: number } | null,
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

  const paddedBox = padBoxForEdit(maskBox);
  console.log("[vistroom] compositeProductIntoRoomFlux mask", { placementSource, maskBox, paddedBox });

  // The mask fed to the model itself stays hard-edged (no feather) — the
  // feathering that makes the seam look natural happens locally in the
  // blend-back step below, not in what we tell the model it may touch.
  const modelAlpha = await boxToAlphaBuffer(width, height, paddedBox, 0);
  const maskPng = await alphaToGreyscaleMaskPng(modelAlpha, width, height);
  const roomPng = await sharp(roomPhoto).png().toBuffer();
  const productDescription = await describeProductForPrompt(productPhoto);

  // FLUX Fill takes image + mask + prompt only — there is no second
  // reference-image input, so the product exists for this model purely as
  // the text description above. hasReferenceImage: false drops the "use the
  // product in image 2" language that would otherwise reference an input
  // this provider never received.
  const prompt = buildProductInsertionPrompt({
    category,
    productDescription,
    box: maskBox,
    explicitBox: Boolean(explicitBox),
    placementHint: CATEGORY_PLACEMENT_HINT[category],
    wallAngleDeg,
    dimensionsCm,
    roomDimensions,
    masked: true,
    hasReferenceImage: false,
  });

  const output = await runReplicateModel(modelSlug(), {
    image: `data:image/png;base64,${roomPng.toString("base64")}`,
    mask: `data:image/png;base64,${maskPng.toString("base64")}`,
    prompt,
  });

  const imageRef = extractImageRef(output);
  if (!imageRef) throw new Error("FLUX Fill returned no image output");
  const editedBuffer = await resolveOutputBuffer(imageRef);

  // No color harmonization on this path (unlike the OpenAI path in
  // lib/ai/composite.ts) — harmonizeRegion now requires a real
  // object-shaped alpha (a segmentation mask), not a box, after a
  // confirmed regression from harmonizing against a padded box (see its
  // doc comment). This fallback path doesn't do that segmentation step,
  // so it stays without harmonization rather than reproduce that bug.
  //
  // Same local guarantee as the OpenAI path — FLUX isn't trusted to leave
  // pixels outside the mask untouched either, only this time WITH feather
  // for a natural-looking blend seam.
  const blendAlpha = await boxToAlphaBuffer(width, height, paddedBox);
  const blended = await blendWithAlpha(roomPhoto, editedBuffer, width, height, blendAlpha);
  return { imageBase64: blended.toString("base64"), maskBox, placementSource };
}

async function runFluxRemovalBuffer(roomPhoto: Buffer, maskPng: Buffer, category: ProductCategory): Promise<Buffer> {
  const roomPng = await sharp(roomPhoto).png().toBuffer();
  const output = await runReplicateModel(modelSlug(), {
    image: `data:image/png;base64,${roomPng.toString("base64")}`,
    mask: `data:image/png;base64,${maskPng.toString("base64")}`,
    prompt: buildRemovalPrompt(category),
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

  const paddedBox = padBoxForEdit(box);
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
