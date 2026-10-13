import { NextRequest, NextResponse } from "next/server";
import { authEnabled, verifyPassword } from "@/lib/auth";
import { setUserSession } from "@/lib/session";
import { clientIp, enforceRateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";

/**
 * The password sign-in exception (see lib/auth.ts) — only ever succeeds
 * for the one account (or accounts) that opted into a password via
 * scripts/set-user-password.ts. Everyone else's password_hash is NULL, so
 * this always returns "invalid" for them, same generic message either way
 * (no distinguishing "no such account" from "wrong password").
 */
export async function POST(req: NextRequest) {
  if (!authEnabled()) {
    return NextResponse.json({ error: "Accounts aren't configured on this server yet (needs DATABASE_URL)." }, { status: 501 });
  }

  const body = await req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!email || !password) return NextResponse.json({ error: "Enter your email and password." }, { status: 400 });

  // A password is guessable in a way a magic link isn't — a real per-IP
  // brute-force guard, tighter than the magic-link request limit.
  const limited = await enforceRateLimit({
    name: "auth-login-password",
    sessionId: "n/a",
    ip: clientIp(req),
    sessionLimit: 1_000_000,
    ipLimit: 10,
    windowMs: 15 * 60 * 1000,
  });
  if (limited) return NextResponse.json({ error: limited.error }, { status: 429 });

  const result = await verifyPassword(email, password);
  if (!result) return NextResponse.json({ error: "Incorrect email or password." }, { status: 401 });

  await setUserSession(result.userId);
  return NextResponse.json({ ok: true });
}
