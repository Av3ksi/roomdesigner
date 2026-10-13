import { NextResponse } from "next/server";
import { dbEnabled } from "@/lib/db";
import { getMostRecentRoomForUser } from "@/lib/roomPersistence";
import { getCurrentUserId } from "@/lib/session";

export const runtime = "nodejs";

/**
 * Cross-device/browser room continuity: Designer.tsx calls this ONLY when
 * it has no roomId remembered in localStorage at all — a brand new
 * browser, or cookies cleared. A signed-in visitor's most recent room
 * (matched by user_id, not the anonymous session cookie, which is
 * necessarily different here) lets them pick up where they left off
 * without re-uploading a photo. Signed out visitors always get {roomId:
 * null} — there's no account to look anything up against, same as before
 * this route existed.
 */
export async function GET() {
  if (!dbEnabled()) return NextResponse.json({ roomId: null });
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ roomId: null });
  const roomId = await getMostRecentRoomForUser(userId);
  return NextResponse.json({ roomId });
}
