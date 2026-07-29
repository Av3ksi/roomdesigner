import { NextResponse } from "next/server";
import { getOrCreateSessionId } from "@/lib/session";
import { getUsageStatus, resetGenerationCount } from "@/lib/usageLimits";

export const runtime = "nodejs";

/**
 * Local testing only — resets the CURRENT request's own anonymous session
 * back to zero free generations used, so the freemium gate can be
 * re-triggered without clearing cookies by hand. Disabled outside
 * development so it's never reachable in production.
 */
export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  const sessionId = await getOrCreateSessionId();
  await resetGenerationCount(sessionId);
  const status = await getUsageStatus(sessionId);
  return NextResponse.json({ ok: true, ...status });
}
