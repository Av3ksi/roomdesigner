import { NextRequest, NextResponse } from "next/server";
import { compositeProductIntoRoom, compositingEnabled } from "@/lib/ai/composite";
import { compositeProductIntoRoomFlux, fluxFillEnabled } from "@/lib/ai/fluxFill";
import { checkRenderedProductIdentity } from "@/lib/ai/identityCheck";
import { clientIp, enforceRateLimit } from "@/lib/rateLimit";
import { getOrCreateSessionId } from "@/lib/session";
import { FREE_GENERATION_LIMIT, hasFreeGenerationsRemaining, recordGeneration } from "@/lib/usageLimits";
import type { ProductCategory } from "@/lib/types";

// sharp (used by lib/ai/composite.ts) needs the Node runtime, not edge.
export const runtime = "nodejs";

/**
 * Every call here is a real, billed OpenAI request — this route only ever
 * fires from an explicit "Generate" button click in CompositePreview, never
 * automatically. No caching, no retries-on-mount, no polling.
 */
export async function POST(req: NextRequest) {
  // OpenAI is the primary path for adding a product: gpt-image-1.5 sees the
  // ACTUAL product reference photo, while FLUX Fill (lib/ai/fluxFill.ts) can
  // only work from a text description of it — a real, confirmed failure had
  // that description carry over an incidental detail from the product photo
  // (a child staged on a kids' sofa for scale) straight into the render.
  // Both paths now carry the same "pixels outside the mask stay untouched"
  // guarantee (lib/ai/imageMasking.ts), so that's no longer a reason to
  // prefer FLUX here. FLUX Fill is used automatically only when
  // OPENAI_API_KEY isn't configured — unlike removal (/api/remove-object),
  // where FLUX + Grounded-SAM segmentation stays primary since erasing
  // something has no text-description fidelity gap to begin with.
  const openAiAvailable = compositingEnabled();
  const useFlux = !openAiAvailable && fluxFillEnabled();
  if (!useFlux && !openAiAvailable) {
    return NextResponse.json(
      { error: "Compositing isn't configured on this server yet (needs REPLICATE_API_TOKEN or OPENAI_API_KEY)." },
      { status: 501 },
    );
  }

  const sessionId = await getOrCreateSessionId();
  const limited = await enforceRateLimit({
    name: "composite",
    sessionId,
    ip: clientIp(req),
    sessionLimit: 10,
    ipLimit: 30,
  });
  if (limited) return NextResponse.json({ error: limited.error }, { status: 429 });

  // Freemium gate — checked BEFORE the billed OpenAI call fires, so a
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

  // formData() itself throws on a missing/non-multipart body — that's a
  // caller mistake (400), not a server failure (500).
  const form = await req.formData().catch(() => null);
  const roomFile = form?.get("room");
  const productImageUrl = form?.get("productImageUrl");
  const category = form?.get("category");

  if (!form || !(roomFile instanceof File) || typeof productImageUrl !== "string" || typeof category !== "string") {
    return NextResponse.json({ error: "Missing room photo, productImageUrl, or category." }, { status: 400 });
  }

  // Optional explicit placement box (the Option B path) — all four
  // normalized coordinates must parse or the box is ignored entirely.
  const coords = ["boxX", "boxY", "boxW", "boxH"].map((k) => Number.parseFloat(String(form.get(k) ?? "")));
  const explicitBox = coords.every((n) => Number.isFinite(n))
    ? { x: coords[0], y: coords[1], w: coords[2], h: coords[3] }
    : undefined;

  const wallAngleRaw = Number.parseFloat(String(form.get("wallAngleDeg") ?? ""));
  const wallAngleDeg = Number.isFinite(wallAngleRaw) ? wallAngleRaw : undefined;

  // Diagnostic: the box a render actually used is otherwise invisible once
  // it's in front of a customer — useful for root-causing a mismatch
  // between where the mask was and what the model actually painted.
  console.log("[maison] /api/composite", { provider: useFlux ? "flux" : "openai", category, productImageUrl, explicitBox, wallAngleDeg });

  const productRes = await fetch(productImageUrl);
  if (!productRes.ok) {
    return NextResponse.json({ error: `Failed to fetch the product photo: ${productRes.status}` }, { status: 502 });
  }

  const roomBuffer = Buffer.from(await roomFile.arrayBuffer());
  const productBuffer = Buffer.from(await productRes.arrayBuffer());

  try {
    const result = useFlux
      ? await compositeProductIntoRoomFlux(roomBuffer, productBuffer, category as ProductCategory, [], explicitBox, wallAngleDeg)
      : await compositeProductIntoRoom(roomBuffer, productBuffer, category as ProductCategory, [], "medium", explicitBox, wallAngleDeg);

    // The render succeeded — this is the actual "one free generation" spend,
    // counted here (not in the separate /api/rooms/[id]/versions persistence
    // call) since that route is fire-and-forget from the client and could
    // silently fail to record the count.
    await recordGeneration(sessionId);

    // Best-effort QA pass (Phase 2): compares the rendered region against the
    // real product photo since compositing models occasionally substitute a
    // different object. Never blocks the render the user already paid for —
    // a failed/skipped check just means no identityCheck in the response.
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
