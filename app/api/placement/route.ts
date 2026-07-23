import { NextRequest, NextResponse } from "next/server";
import { suggestPlacements, type PlacementMap } from "@/lib/ai/placement";
import { DEFAULT_CATEGORY_BOX } from "@/lib/placementBoxes";

// sharp (used for the pre-analysis downscale) needs the Node runtime.
export const runtime = "nodejs";

/** Context-blind defaults, normalized to the same {box, wallAngleDeg} shape Claude returns — no geometry to estimate wallAngleDeg from, so 0 (camera-facing). */
const DEFAULT_PLACEMENTS: PlacementMap = Object.fromEntries(
  Object.entries(DEFAULT_CATEGORY_BOX).map(([category, box]) => [category, { box, wallAngleDeg: 0 }]),
) as PlacementMap;

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
    boxes: suggested?.placements ?? DEFAULT_PLACEMENTS,
    // Null when Claude is disabled/failed, or when it answered but the
    // dimension estimate itself came back malformed — no geometry to
    // fall back on either way, so the UI just skips the size-fit check.
    roomDimensions: suggested?.roomDimensions ?? null,
  });
}
