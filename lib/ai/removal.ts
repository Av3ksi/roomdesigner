import { compositingEnabled, removeExistingObject } from "./composite";
import { fluxFillEnabled, removeExistingObjectFlux, removeExistingObjectFluxWithMask } from "./fluxFill";
import { segmentExistingFurniture } from "./vision/segmentation";
import { locateExistingObject } from "./locate";
import { checkRemovalSuccess, type IdentityCheckResult } from "./identityCheck";
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
 *   2. A box — either already known (caller has one) or Claude-vision
 *      -located — erased via FLUX Fill, still on Replicate.
 *   3. The same box erased via OpenAI. This is the ENTIRE pipeline when
 *      REPLICATE_API_TOKEN isn't set, AND the safety net when Replicate is
 *      set but unusable.
 *
 * That last point was a real, confirmed outage: with a Replicate balance
 * under $5, prediction creation is throttled to a BURST OF ONE. Tier 1
 * needs two calls back to back (segment, then fill), so the second was
 * rejected with a 429 every single time and removal returned a 500 —
 * despite OpenAI being configured and perfectly able to do the job. The
 * provider chain was written as "use Replicate if present" rather than
 * "prefer Replicate, fall back", so any Replicate problem (throttling, an
 * outage, an expired token, an empty balance) took the whole feature down
 * instead of degrading to a slightly less precise mask. Every Replicate
 * call is now wrapped so a failure costs precision, not the render.
 */

export function removalEnabled(): boolean {
  return fluxFillEnabled() || compositingEnabled();
}

export interface RemovalOutcome {
  imageBase64: string;
  removedBox: DetectionBox;
  maskSource: "segmentation" | "box";
  /** Whether the target object is actually gone from the result — see lib/ai/identityCheck.ts's checkRemovalSuccess. Null when the check itself couldn't run (e.g. ANTHROPIC_API_KEY unset). */
  removalCheck: IdentityCheckResult | null;
}

/** Replicate reports a throttled account with an explicit 429 — worth naming in logs, since the fix is topping up a balance rather than debugging the app. */
function describeProviderFailure(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (message.includes("429")) {
    return `${message} — Replicate is rate-limiting this account (its burst limit drops to 1 request/minute below $5 credit).`;
  }
  return message;
}

export async function performRemoval(
  roomBuffer: Buffer,
  category: ProductCategory,
  description: string | undefined,
  knownBox: DetectionBox | null,
): Promise<RemovalOutcome> {
  const useFlux = fluxFillEnabled();
  const openAiAvailable = compositingEnabled();
  if (!useFlux && !openAiAvailable) {
    throw new Error("Removal isn't configured on this server yet (needs REPLICATE_API_TOKEN or OPENAI_API_KEY).");
  }

  const withCheck = async (
    imageBase64: string,
    removedBox: DetectionBox,
    maskSource: RemovalOutcome["maskSource"],
  ): Promise<RemovalOutcome> => ({
    imageBase64,
    removedBox,
    maskSource,
    removalCheck: await checkRemovalSuccess(roomBuffer, Buffer.from(imageBase64, "base64"), category, description),
  });

  // Resolves the fallback box WITHOUT touching Replicate — locateExistingObject
  // is a Claude call, so it stays available even when Replicate is down.
  const resolveBox = async (): Promise<DetectionBox> => {
    if (knownBox && isValidBox(knownBox)) return clampBox(knownBox);
    const located = await locateExistingObject(roomBuffer, category);
    if (!located) throw new Error(`No existing ${category} was found in this photo to remove.`);
    return located.box;
  };

  if (useFlux) {
    try {
      // Tier 1 — pixel-precise. segmentExistingFurniture returns null on a
      // genuine model miss (the object isn't findable), which is different
      // from it throwing, and falls through to the box tiers either way.
      const seg = await segmentExistingFurniture(roomBuffer, category, description);
      if (seg) {
        const result = await removeExistingObjectFluxWithMask(roomBuffer, seg, category);
        return await withCheck(result.imageBase64, seg.box, "segmentation");
      }
      // Tier 2 — box-based, still on FLUX.
      const box = await resolveBox();
      const result = await removeExistingObjectFlux(roomBuffer, box, category);
      return await withCheck(result.imageBase64, box, "box");
    } catch (err) {
      // A "nothing to remove" verdict is a real answer about the photo, not
      // a provider fault — retrying it on OpenAI would just burn a paid call
      // to reach the same conclusion.
      const message = err instanceof Error ? err.message : String(err);
      if (message.startsWith("No existing ")) throw err;

      if (!openAiAvailable) {
        throw new Error(
          `Removal failed and there's no fallback provider configured (set OPENAI_API_KEY). ${describeProviderFailure(err)}`,
        );
      }
      console.warn(`[vistroom] Replicate removal failed, falling back to OpenAI: ${describeProviderFailure(err)}`);
    }
  }

  // Tier 3 — OpenAI. Reached when Replicate isn't configured at all, or when
  // it was and failed above.
  const box = await resolveBox();
  const result = await removeExistingObject(roomBuffer, box, category, description);
  return await withCheck(result.imageBase64, box, "box");
}
