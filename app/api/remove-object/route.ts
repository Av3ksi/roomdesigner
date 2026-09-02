import { NextRequest, NextResponse } from "next/server";
import { performRemoval, removalEnabled } from "@/lib/ai/removal";
import { aiEnabled } from "@/lib/ai/claude";
import { isPremiumUser } from "@/lib/auth";
import { hasCreditsRemaining, spendCredit } from "@/lib/credits";
import { clientIp, enforceRateLimit } from "@/lib/rateLimit";
import { getCurrentUserId, getOrCreateSessionId } from "@/lib/session";
import type { ProductCategory } from "@/lib/types";

// sharp (compositing) needs the Node runtime, not edge.
export const runtime = "nodejs";

/**
 * Erases an existing object already physically present in the room photo —
 * a real billed call, so this only ever fires from an explicit user
 * confirmation, same discipline as /api/composite. The actual tiered
 * removal logic (segmentation+FLUX, then box-based FLUX/OpenAI) lives in
 * lib/ai/removal.ts, shared with /api/move-object.
 */
export async function POST(req: NextRequest) {
  if (!aiEnabled()) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured on the server." }, { status: 501 });
  }
  if (!removalEnabled()) {
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

  // Premium accounts bypass the credit gate entirely — see /api/composite for the same check.
  const userId = await getCurrentUserId();
  const premium = await isPremiumUser(userId);

  // Credit gate — checked BEFORE the billed removal call fires, so a
  // session at zero never spends money.
  if (!premium && !(await hasCreditsRemaining(sessionId))) {
    return NextResponse.json(
      { error: "You're out of credits. Buy more or upgrade to Premium for unlimited access.", code: "OUT_OF_CREDITS" },
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
    const result = await performRemoval(roomBuffer, category as ProductCategory, description, knownBox);
    // The render succeeded — this is the actual credit spend (see /api/composite for why it's recorded here, not in the versions-persistence route).
    if (!premium) await spendCredit(sessionId, userId, "generation:remove");
    return NextResponse.json({
      imageBase64: result.imageBase64,
      removedBox: result.removedBox,
      maskSource: result.maskSource,
      removalCheck: result.removalCheck,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
