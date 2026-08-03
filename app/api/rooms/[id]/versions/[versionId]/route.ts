import { NextRequest, NextResponse } from "next/server";
import { dbEnabled } from "@/lib/db";
import { deleteVersion, getRoomOwner } from "@/lib/roomPersistence";
import { getOrCreateSessionId } from "@/lib/session";

export const runtime = "nodejs";

/**
 * Deletes one persisted render — the point is letting a user discard a
 * bad/garbled version (e.g. from a since-fixed masking bug) so it stops
 * being "the latest version" that every subsequent edit builds on top of
 * (see Designer.tsx's generateProposal: new edits always base off
 * versions[versions.length - 1]).
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; versionId: string }> }) {
  if (!dbEnabled()) {
    return NextResponse.json({ error: "Persistence is not configured on the server." }, { status: 501 });
  }

  const { id, versionId } = await params;
  const sessionId = await getOrCreateSessionId();
  const owner = await getRoomOwner(id);
  if (owner !== sessionId) {
    return NextResponse.json({ error: "Room not found." }, { status: 404 });
  }

  await deleteVersion(id, versionId);
  return NextResponse.json({ ok: true });
}
