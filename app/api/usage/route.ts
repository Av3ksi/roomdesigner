import { NextResponse } from "next/server";
import { isPremiumUser } from "@/lib/auth";
import { getCurrentUserId, getOrCreateSessionId } from "@/lib/session";
import { getUsageStatus } from "@/lib/usageLimits";

export const runtime = "nodejs";

// Mirrors lib/usageLimits.ts's own UNLIMITED_REMAINING sentinel — a
// premium account should never see itself hit 0 and get the paywall,
// same reasoning as that constant's own doc comment.
const UNLIMITED_REMAINING = 1_000_000;

/** Read-only usage snapshot for the current session — lets Designer.tsx show the paywall proactively instead of only after a blocked (402) generation request. */
export async function GET() {
  const sessionId = await getOrCreateSessionId();
  if (await isPremiumUser(await getCurrentUserId())) {
    return NextResponse.json({ used: 0, limit: 0, remaining: UNLIMITED_REMAINING, premium: true });
  }
  const status = await getUsageStatus(sessionId);
  return NextResponse.json({ ...status, premium: false });
}
