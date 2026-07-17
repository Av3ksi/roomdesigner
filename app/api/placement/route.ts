import { NextRequest, NextResponse } from "next/server";
import { suggestPlacements } from "@/lib/ai/placement";
import { DEFAULT_CATEGORY_BOX } from "@/lib/placementBoxes";

// sharp (used for the pre-analysis downscale) needs the Node runtime.
export const runtime = "nodejs";

/**
 * Room-aware placement suggestions for the compositing step. One Claude
 * vision call per invocation (cheap — the photo is downscaled first), only
 * ever fired from an explicit button click. Always answers with usable
 * boxes: `source` says honestly whether they came from Claude or are the
 * context-blind defaults (no ANTHROPIC_API_KEY, or the call failed).
 */
export async function POST(req: NextRequest) {
  // formData() itself throws on a missing/non-multipart body — that's a
  // caller mistake (400), not a server failure (500).
  const form = await req.formData().catch(() => null);
  const roomFile = form?.get("room");
  if (!(roomFile instanceof File)) {
    return NextResponse.json({ error: "Missing room photo." }, { status: 400 });
  }

  const roomBuffer = Buffer.from(await roomFile.arrayBuffer());
  const suggested = await suggestPlacements(roomBuffer);

  return NextResponse.json({
    source: suggested ? "claude" : "default",
    boxes: suggested ?? DEFAULT_CATEGORY_BOX,
  });
}
