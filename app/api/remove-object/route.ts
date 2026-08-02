import { NextRequest, NextResponse } from "next/server";
import { compositingEnabled, removeExistingObject } from "@/lib/ai/composite";
import { fluxFillEnabled, removeExistingObjectFlux, removeExistingObjectFluxWithMask } from "@/lib/ai/fluxFill";
import { segmentExistingFurniture } from "@/lib/ai/vision/segmentation";
import { locateExistingObject } from "@/lib/ai/locate";
import { aiEnabled } from "@/lib/ai/claude";
import { clampBox, isValidBox } from "@/lib/placementBoxes";
import { clientIp, enforceRateLimit } from "@/lib/rateLimit";
import { getOrCreateSessionId } from "@/lib/session";
import { FREE_GENERATION_LIMIT, hasFreeGenerationsRemaining, recordGeneration } from "@/lib/usageLimits";
import type { ProductCategory } from "@/lib/types";

// sharp (compositing) needs the Node runtime, not edge.
export const runtime = "nodejs";

/**
 * Erases an existing object already physically present in the room photo.
 * Two tiers, both real billed calls, so this only ever fires from an
 * explicit user confirmation, same discipline as /api/composite:
 *
 *   1. Grounded-SAM segmentation (lib/ai/vision/segmentation.ts) + FLUX
 *      Fill erase — pixel-precise, only when REPLICATE_API_TOKEN is
 *      configured. Falls through to tier 2 if segmentation itself doesn't
 *      find the object (model miss, not a config problem).
 *   2. A box — either already known (the room-inventory checklist) or
 *      located via Claude vision (lib/ai/locate.ts) — erased via FLUX Fill
 *      when Replicate is configured, or the original OpenAI path
 *      otherwise. This is the ENTIRE removal pipeline when
 *      REPLICATE_API_TOKEN isn't set — nothing regresses for a setup that
 *      hasn't added it yet.
 */
export async function POST(req: NextRequest) {
  if (!aiEnabled()) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured on the server." }, { status: 501 });
  }
  const useFlux = fluxFillEnabled();
  if (!useFlux && !compositingEnabled()) {
    return NextResponse.json(
      { error: "Removal isn't configured on this server yet (needs REPLICATE_API_TOKEN or OPENAI_API_KEY)." },
      { status: 501 },
    );
  }

  const sessionId = await getOrCreateSessionId();
  const limited = await enforceRateLimit({
    name: "remove-object",
    sessionId,
    ip: clientIp(req),
    sessionLimit: 10,
    ipLimit: 30,
  });
  if (limited) return NextResponse.json({ error: limited.error }, { status: 429 });

  // Freemium gate — checked BEFORE the billed removal call fires, so a
  // request past the free limit never spends money.
  if (!(await hasFreeGenerationsRemaining(sessionId))) {
    return NextResponse.json(
      {
        error: `You've used your ${FREE_GENERATION_LIMIT} free room generation. Upgrade to Pro for unlimited access.`,
        code: "FREE_LIMIT_REACHED",
      },
      { status: 402 },
    );
  }

  const form = await req.formData().catch(() => null);
  const roomFile = form?.get("room");
  const category = form?.get("category");
  if (!form || !(roomFile instanceof File) || typeof category !== "string") {
    return NextResponse.json({ error: "Missing room photo or category." }, { status: 400 });
  }

  // A specific inventory description ("gray fabric sofa") is a far better
  // segmentation text prompt than the generic category label — optional,
  // only present when the removal came from the room-inventory checklist.
  const descriptionField = form.get("description");
  const description = typeof descriptionField === "string" && descriptionField.trim() ? descriptionField.trim() : undefined;

  const roomBuffer = Buffer.from(await roomFile.arrayBuffer());

  // When the caller already knows exactly where the object is (the room
  // inventory checklist), skip the blind locate-by-category vision call —
  // cheaper and more accurate than re-guessing. All four fields must be
  // explicitly present, not just individually valid numbers — a missing
  // field would otherwise coerce to 0 and look like a (degenerate) box.
  const boxFields = ["boxX", "boxY", "boxW", "boxH"].map((k) => form.get(k));
  const hasKnownBox = boxFields.every((v) => v !== null);
  const knownBox = hasKnownBox
    ? { x: Number(boxFields[0]), y: Number(boxFields[1]), w: Number(boxFields[2]), h: Number(boxFields[3]) }
    : null;

  try {
    // Tier 1: pixel-precise segmentation, only when Replicate is configured.
    if (useFlux) {
      const seg = await segmentExistingFurniture(roomBuffer, category as ProductCategory, description);
      if (seg) {
        const result = await removeExistingObjectFluxWithMask(roomBuffer, seg, category as ProductCategory);
        await recordGeneration(sessionId);
        return NextResponse.json({ imageBase64: result.imageBase64, removedBox: seg.box, maskSource: "segmentation" });
      }
      // Segmentation didn't find the object (a model miss, not a config
      // problem) — fall through to the box tier below, still on FLUX.
    }

    // Tier 2: a box, either already known or Claude-vision-located.
    let box = knownBox && isValidBox(knownBox) ? clampBox(knownBox) : null;
    if (!box) {
      const located = await locateExistingObject(roomBuffer, category as ProductCategory);
      if (!located) {
        return NextResponse.json(
          { error: `No existing ${category} was found in this photo to remove.` },
          { status: 404 },
        );
      }
      box = located.box;
    }

    const result = useFlux
      ? await removeExistingObjectFlux(roomBuffer, box, category as ProductCategory)
      : await removeExistingObject(roomBuffer, box, category as ProductCategory);

    // The render succeeded — this is the actual "one free generation" spend (see /api/composite for why it's recorded here, not in the versions-persistence route).
    await recordGeneration(sessionId);
    return NextResponse.json({ imageBase64: result.imageBase64, removedBox: box, maskSource: "box" });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
