import { NextRequest, NextResponse } from "next/server";
import { dbEnabled } from "@/lib/db";
import { clearMessages, getRoomOwner } from "@/lib/roomPersistence";
import { getOrCreateSessionId } from "@/lib/session";

export const runtime = "nodejs";

/** "Clear chat" for a persisted room — the client also clears its own state immediately; this keeps a refresh from resurrecting the old conversation. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!dbEnabled()) return NextResponse.json({ ok: true });

  const { id } = await params;
  const sessionId = await getOrCreateSessionId();
  const owner = await getRoomOwner(id);
  if (owner !== sessionId) {
    return NextResponse.json({ error: "Room not found." }, { status: 404 });
  }

  await clearMessages(id);
  return NextResponse.json({ ok: true });
}
