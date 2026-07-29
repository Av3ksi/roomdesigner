import { NextResponse } from "next/server";
import { getOrCreateSessionId } from "@/lib/session";
import { getUsageStatus } from "@/lib/usageLimits";

export const runtime = "nodejs";

/** Read-only usage snapshot for the current anonymous session — lets Designer.tsx show the paywall proactively instead of only after a blocked (402) generation request. */
export async function GET() {
  const sessionId = await getOrCreateSessionId();
  const status = await getUsageStatus(sessionId);
  return NextResponse.json(status);
}
