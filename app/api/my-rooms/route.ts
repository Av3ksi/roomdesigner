import { NextResponse } from "next/server";
import { getUserFinishedRooms } from "@/lib/finishedRooms";
import { getCurrentUserId, getOrCreateSessionId } from "@/lib/session";

export const runtime = "nodejs";

/** "My collection" — every room this browser (or account, once signed in) has saved, published or not. No login required to view. */
export async function GET() {
  const sessionId = await getOrCreateSessionId();
  const userId = await getCurrentUserId();
  const rooms = await getUserFinishedRooms({ sessionId, userId });
  return NextResponse.json({ rooms });
}
