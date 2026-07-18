import { NextRequest, NextResponse } from "next/server";
import { compositeProductIntoRoom, compositingEnabled } from "@/lib/ai/composite";
import { checkRenderedProductIdentity } from "@/lib/ai/identityCheck";
import type { ProductCategory } from "@/lib/types";

// sharp (used by lib/ai/composite.ts) needs the Node runtime, not edge.
export const runtime = "nodejs";

/**
 * Every call here is a real, billed OpenAI request — this route only ever
 * fires from an explicit "Generate" button click in CompositePreview, never
 * automatically. No caching, no retries-on-mount, no polling.
 */
export async function POST(req: NextRequest) {
  if (!compositingEnabled()) {
    return NextResponse.json({ error: "OPENAI_API_KEY not configured on the server." }, { status: 501 });
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

  const productRes = await fetch(productImageUrl);
  if (!productRes.ok) {
    return NextResponse.json({ error: `Failed to fetch the product photo: ${productRes.status}` }, { status: 502 });
  }

  const roomBuffer = Buffer.from(await roomFile.arrayBuffer());
  const productBuffer = Buffer.from(await productRes.arrayBuffer());

  try {
    const result = await compositeProductIntoRoom(
      roomBuffer,
      productBuffer,
      category as ProductCategory,
      [],
      "low",
      explicitBox,
      wallAngleDeg,
    );

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
