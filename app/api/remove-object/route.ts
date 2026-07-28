import { NextRequest, NextResponse } from "next/server";
import { compositingEnabled, removeExistingObject } from "@/lib/ai/composite";
import { locateExistingObject } from "@/lib/ai/locate";
import { aiEnabled } from "@/lib/ai/claude";
import { clampBox, isValidBox } from "@/lib/placementBoxes";
import { clientIp, enforceRateLimit } from "@/lib/rateLimit";
import { getOrCreateSessionId } from "@/lib/session";
import type { ProductCategory } from "@/lib/types";

// sharp (compositing) needs the Node runtime, not edge.
export const runtime = "nodejs";

/**
 * Phase 2: erases an existing object already physically present in the room
 * photo. Two real, billed calls happen here in sequence — a Claude vision
 * call to locate the object, then an OpenAI edit to erase it — so this only
 * ever fires from an explicit user confirmation, same discipline as
 * /api/composite.
 */
export async function POST(req: NextRequest) {
  if (!aiEnabled()) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured on the server." }, { status: 501 });
  }
  if (!compositingEnabled()) {
    return NextResponse.json({ error: "OPENAI_API_KEY not configured on the server." }, { status: 501 });
  }

  const limited = await enforceRateLimit({
    name: "remove-object",
    sessionId: await getOrCreateSessionId(),
    ip: clientIp(req),
    sessionLimit: 10,
    ipLimit: 30,
  });
  if (limited) return NextResponse.json({ error: limited.error }, { status: 429 });

  const form = await req.formData().catch(() => null);
  const roomFile = form?.get("room");
  const category = form?.get("category");
  if (!form || !(roomFile instanceof File) || typeof category !== "string") {
    return NextResponse.json({ error: "Missing room photo or category." }, { status: 400 });
  }

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

    const result = await removeExistingObject(roomBuffer, box, category as ProductCategory);
    return NextResponse.json({ imageBase64: result.imageBase64, removedBox: box });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
