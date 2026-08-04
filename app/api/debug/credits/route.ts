import { NextRequest, NextResponse } from "next/server";
import { FREE_CREDITS, getCreditBalance, getCreditHistory, grantCredits, resetCredits } from "@/lib/credits";
import { getCurrentUserId, getOrCreateSessionId } from "@/lib/session";

export const runtime = "nodejs";

/**
 * Local testing only — lets you inspect and adjust the CURRENT request's
 * own anonymous session's credit balance without waiting to burn through
 * real ones or clearing cookies by hand. Disabled outside development so
 * it's never reachable in production; there is no session-targeting
 * parameter, so even in dev this can only ever touch the caller's own
 * session (whatever /api/debug/credits is requested from), not an
 * arbitrary user's.
 *
 * GET  → current balance + recent transaction history (the "why did my
 *        credits change" answer, for the caller's own session).
 * POST → { action: "grant", amount } adds credits (default 10);
 *         { action: "reset", amount } sets the balance to an exact value
 *         (default FREE_CREDITS).
 */
function guard(): NextResponse | null {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  return null;
}

export async function GET() {
  const blocked = guard();
  if (blocked) return blocked;

  const sessionId = await getOrCreateSessionId();
  const [credits, history] = await Promise.all([getCreditBalance(sessionId), getCreditHistory(sessionId)]);
  return NextResponse.json({ sessionId, credits, history });
}

export async function POST(req: NextRequest) {
  const blocked = guard();
  if (blocked) return blocked;

  const sessionId = await getOrCreateSessionId();
  const userId = await getCurrentUserId();
  const body = await req.json().catch(() => ({}) as Record<string, unknown>);
  const action = body.action === "reset" ? "reset" : "grant";
  const amountRaw = Number(body.amount);

  const credits =
    action === "reset"
      ? await resetCredits(sessionId, Number.isFinite(amountRaw) ? amountRaw : FREE_CREDITS)
      : await grantCredits(sessionId, Number.isFinite(amountRaw) ? amountRaw : 10, "admin_grant", userId);

  return NextResponse.json({ ok: true, action, credits });
}
