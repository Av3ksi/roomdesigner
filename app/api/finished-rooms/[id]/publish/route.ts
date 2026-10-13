import { NextRequest, NextResponse } from "next/server";
import { dbEnabled } from "@/lib/db";
import { setFinishedRoomPublished } from "@/lib/finishedRooms";
import { getCurrentUserId, getOrCreateSessionId } from "@/lib/session";

export const runtime = "nodejs";

/**
 * Flips a room saved via "my collection" public (joins Complete Rooms,
 * buyable by anyone) or back to private. Publishing itself requires being
 * signed in — a room can be saved anonymously, but going public attaches it
 * to a real account, same gate /api/publish already has.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!dbEnabled()) {
    return NextResponse.json({ error: "Not configured on this server (needs DATABASE_URL)." }, { status: 501 });
  }

  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Sign in to publish this room." }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (typeof body?.published !== "boolean") {
    return NextResponse.json({ error: "Missing published (boolean)." }, { status: 400 });
  }

  const sessionId = await getOrCreateSessionId();
  const ok = await setFinishedRoomPublished(id, { sessionId, userId }, body.published);
  if (!ok) return NextResponse.json({ error: "Room not found." }, { status: 404 });

  return NextResponse.json({ ok: true });
}
