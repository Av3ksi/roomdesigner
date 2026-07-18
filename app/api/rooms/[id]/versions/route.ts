import { NextRequest, NextResponse } from "next/server";
import { dbEnabled } from "@/lib/db";
import { addVersion, getRoomOwner } from "@/lib/roomPersistence";
import { getOrCreateSessionId } from "@/lib/session";

export const runtime = "nodejs";

/**
 * Persists one confirmed render (a RoomVersion the client already has —
 * this never renders anything itself). Called right after a successful
 * /api/composite response, so a refresh doesn't lose stacked edits.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!dbEnabled()) {
    return NextResponse.json({ error: "Persistence is not configured on the server." }, { status: 501 });
  }

  const { id } = await params;
  const sessionId = await getOrCreateSessionId();
  const owner = await getRoomOwner(id);
  if (owner !== sessionId) {
    return NextResponse.json({ error: "Room not found." }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const imageBase64 = body?.imageBase64;
  const label = body?.label;
  const objects = Array.isArray(body?.objects) ? body.objects : [];
  if (typeof imageBase64 !== "string" || !imageBase64 || typeof label !== "string" || !label) {
    return NextResponse.json({ error: "Missing imageBase64 or label." }, { status: 400 });
  }

  const versionId = await addVersion(id, imageBase64, label, objects);
  return NextResponse.json({ id: versionId });
}
