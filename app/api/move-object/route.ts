import { NextRequest, NextResponse } from "next/server";
import { compositeProductIntoRoom, compositingEnabled } from "@/lib/ai/composite";
import { compositeProductIntoRoomFlux, fluxFillEnabled } from "@/lib/ai/fluxFill";
import { performRemoval, removalEnabled } from "@/lib/ai/removal";
import { checkRenderedProductIdentity } from "@/lib/ai/identityCheck";
import { isPremiumUser } from "@/lib/auth";
import { clientIp, enforceRateLimit } from "@/lib/rateLimit";
import { getCurrentUserId, getOrCreateSessionId } from "@/lib/session";
import { FREE_GENERATION_LIMIT, hasFreeGenerationsRemaining, recordGeneration } from "@/lib/usageLimits";
import { clampBox, isValidBox } from "@/lib/placementBoxes";
import type { ProductCategory } from "@/lib/types";

// sharp (used by lib/ai/composite.ts) needs the Node runtime, not edge.
export const runtime = "nodejs";

/**
 * Repositions an already-placed product: erase it from its current box
 * (lib/ai/removal.ts's tiered removal, same as /api/remove-object), then
 * re-insert the SAME product reference photo at a new box
 * (lib/ai/composite.ts's compositeProductIntoRoom/compositeProductIntoRoomFlux,
 * same as /api/composite). One user-facing action, one free-generation
 * spend — even though it's two real, separately billed provider calls
 * under the hood.
 *
 * There's no single "move" primitive on either provider, and this is the
 * same erase-then-reinsert workaround already decided as acceptable for
 * product swaps — see lib/ai/composite.ts's module doc comment and
 * docs/BLUEPRINT.md §9 item 9. Only works for objects Maison itself placed
 * (a catalog product or a web-sourced one): re-insertion needs a clean
 * product reference photo, which we have for those. An object that was
 * already physically in the customer's original photo has no such
 * reference and isn't supported here — that stays remove-only.
 */
export async function POST(req: NextRequest) {
  const openAiAvailable = compositingEnabled();
  const useFluxForAdd = !openAiAvailable && fluxFillEnabled();
  if (!removalEnabled() || (!useFluxForAdd && !openAiAvailable)) {
    return NextResponse.json(
      { error: "Moving a product isn't configured on this server yet (needs REPLICATE_API_TOKEN or OPENAI_API_KEY)." },
      { status: 501 },
    );
  }

  const sessionId = await getOrCreateSessionId();
  const limited = await enforceRateLimit({
    name: "move-object",
    sessionId,
    ip: clientIp(req),
    sessionLimit: 10,
    ipLimit: 30,
  });
  if (limited) return NextResponse.json({ error: limited.error }, { status: 429 });

  // Premium accounts bypass the freemium gate entirely — see /api/composite for the same check.
  const premium = await isPremiumUser(await getCurrentUserId());

  // Freemium gate — checked BEFORE either billed call fires, so a request
  // past the free limit never spends money.
  if (!premium && !(await hasFreeGenerationsRemaining(sessionId))) {
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
  const productImageUrl = form?.get("productImageUrl");
  const category = form?.get("category");
  if (!form || !(roomFile instanceof File) || typeof productImageUrl !== "string" || typeof category !== "string") {
    return NextResponse.json({ error: "Missing room photo, productImageUrl, or category." }, { status: 400 });
  }

  const oldCoords = ["oldBoxX", "oldBoxY", "oldBoxW", "oldBoxH"].map((k) => Number.parseFloat(String(form.get(k) ?? "")));
  const newCoords = ["newBoxX", "newBoxY", "newBoxW", "newBoxH"].map((k) => Number.parseFloat(String(form.get(k) ?? "")));
  if (!oldCoords.every(Number.isFinite) || !newCoords.every(Number.isFinite)) {
    return NextResponse.json({ error: "Missing or invalid oldBox/newBox coordinates." }, { status: 400 });
  }
  const oldBox = clampBox({ x: oldCoords[0], y: oldCoords[1], w: oldCoords[2], h: oldCoords[3] });
  const newBox = clampBox({ x: newCoords[0], y: newCoords[1], w: newCoords[2], h: newCoords[3] });
  if (!isValidBox(oldBox) || !isValidBox(newBox)) {
    return NextResponse.json({ error: "oldBox/newBox must be valid, non-degenerate boxes." }, { status: 400 });
  }

  const wallAngleRaw = Number.parseFloat(String(form.get("wallAngleDeg") ?? ""));
  const wallAngleDeg = Number.isFinite(wallAngleRaw) ? wallAngleRaw : undefined;

  const productRes = await fetch(productImageUrl);
  if (!productRes.ok) {
    return NextResponse.json({ error: `Failed to fetch the product photo: ${productRes.status}` }, { status: 502 });
  }

  const roomBuffer = Buffer.from(await roomFile.arrayBuffer());
  const productBuffer = Buffer.from(await productRes.arrayBuffer());
  const cat = category as ProductCategory;

  console.log("[maison] /api/move-object", { category: cat, oldBox, newBox, wallAngleDeg });

  try {
    const erased = await performRemoval(roomBuffer, cat, undefined, oldBox);
    const erasedBuffer = Buffer.from(erased.imageBase64, "base64");

    const result = useFluxForAdd
      ? await compositeProductIntoRoomFlux(erasedBuffer, productBuffer, cat, [], newBox, wallAngleDeg)
      : await compositeProductIntoRoom(erasedBuffer, productBuffer, cat, [], "high", newBox, wallAngleDeg);

    if (!premium) await recordGeneration(sessionId);

    const identityCheck = await checkRenderedProductIdentity(
      productBuffer,
      Buffer.from(result.imageBase64, "base64"),
      result.maskBox,
    ).catch(() => null);

    return NextResponse.json({ ...result, identityCheck });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
