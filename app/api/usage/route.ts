import { NextResponse } from "next/server";
import { isPremiumUser } from "@/lib/auth";
import { getCreditBalance } from "@/lib/credits";
import { getCurrentUserId, getOrCreateSessionId } from "@/lib/session";

export const runtime = "nodejs";

// A premium account's real balance doesn't matter (lib/credits.ts is
// bypassed entirely for them) — this sentinel just keeps any client code
// that does a defensive `credits > 0` check working without a premium
// special case; the UI itself branches on `premium` for what to actually
// display (see Designer.tsx), not this number.
const UNLIMITED_CREDITS = 1_000_000;

/** Read-only credit-balance snapshot for the current session — lets Designer.tsx show the paywall proactively instead of only after a blocked (402) generation request. */
export async function GET() {
  const sessionId = await getOrCreateSessionId();
  if (await isPremiumUser(await getCurrentUserId())) {
    return NextResponse.json({ credits: UNLIMITED_CREDITS, premium: true });
  }
  const credits = await getCreditBalance(sessionId);
  return NextResponse.json({ credits, premium: false });
}
