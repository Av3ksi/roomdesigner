import { compositingEnabled, removeExistingObject } from "./composite";
import { fluxFillEnabled, removeExistingObjectFlux, removeExistingObjectFluxWithMask } from "./fluxFill";
import { segmentExistingFurniture } from "./vision/segmentation";
import { locateExistingObject } from "./locate";
import { clampBox, isValidBox } from "../placementBoxes";
import type { DetectionBox, ProductCategory } from "../types";

/**
 * Tiered erase of an object already physically present in a room photo —
 * extracted from /api/remove-object so /api/move-object (erase at the old
 * spot, then re-insert the same product at a new one, as one user-facing
 * action) can reuse the exact same fallback chain instead of a second copy
 * drifting out of sync with it.
 *
 *   1. Grounded-SAM segmentation (lib/ai/vision/segmentation.ts) + FLUX Fill
 *      erase — pixel-precise, only when REPLICATE_API_TOKEN is configured.
 *      Falls through to tier 2 when segmentation itself doesn't find the
 *      object (a model miss, not a config problem).
 *   2. A box — either already known (caller has one) or Claude-vision
 *      -located — erased via FLUX Fill when Replicate is configured, or the
 *      OpenAI path otherwise. This is the ENTIRE removal pipeline when
 *      REPLICATE_API_TOKEN isn't set.
 */

export function removalEnabled(): boolean {
  return fluxFillEnabled() || compositingEnabled();
}

export interface RemovalOutcome {
  imageBase64: string;
  removedBox: DetectionBox;
  maskSource: "segmentation" | "box";
}

export async function performRemoval(
  roomBuffer: Buffer,
  category: ProductCategory,
  description: string | undefined,
  knownBox: DetectionBox | null,
): Promise<RemovalOutcome> {
  const useFlux = fluxFillEnabled();
  if (!useFlux && !compositingEnabled()) {
    throw new Error("Removal isn't configured on this server yet (needs REPLICATE_API_TOKEN or OPENAI_API_KEY).");
  }

  if (useFlux) {
    const seg = await segmentExistingFurniture(roomBuffer, category, description);
    if (seg) {
      const result = await removeExistingObjectFluxWithMask(roomBuffer, seg, category);
      return { imageBase64: result.imageBase64, removedBox: seg.box, maskSource: "segmentation" };
    }
    // Segmentation didn't find the object (a model miss, not a config
    // problem) — fall through to the box tier below, still on FLUX.
  }

  let box = knownBox && isValidBox(knownBox) ? clampBox(knownBox) : null;
  if (!box) {
    const located = await locateExistingObject(roomBuffer, category);
    if (!located) throw new Error(`No existing ${category} was found in this photo to remove.`);
    box = located.box;
  }

  const result = useFlux
    ? await removeExistingObjectFlux(roomBuffer, box, category)
    : await removeExistingObject(roomBuffer, box, category);
  return { imageBase64: result.imageBase64, removedBox: box, maskSource: "box" };
}
