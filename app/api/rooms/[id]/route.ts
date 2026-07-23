import { NextRequest, NextResponse } from "next/server";
import { dbEnabled } from "@/lib/db";
import { loadRoom } from "@/lib/roomPersistence";
import { getOrCreateSessionId } from "@/lib/session";

export const runtime = "nodejs";

/** Rehydrates a saved room (Phase 1 persistence) — the client calls this on mount when it has a roomId in localStorage. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!dbEnabled()) {
    return NextResponse.json({ error: "Persistence is not configured on the server." }, { status: 501 });
  }

  const { id } = await params;
  const sessionId = await getOrCreateSessionId();
  const room = await loadRoom(id, sessionId);
  if (!room) {
    return NextResponse.json({ error: "Room not found." }, { status: 404 });
  }

  return NextResponse.json({ room });
}
