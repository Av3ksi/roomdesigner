import { NextRequest, NextResponse } from "next/server";
import { authEnabled, requestLoginLink } from "@/lib/auth";
import { clientIp, enforceRateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";

/** Requests a magic-link sign-in email. Always responds the same way regardless of whether the email is registered. */
export async function POST(req: NextRequest) {
  if (!authEnabled()) {
    return NextResponse.json({ error: "Accounts aren't configured on this server yet (needs DATABASE_URL)." }, { status: 501 });
  }

  const body = await req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  if (!email) return NextResponse.json({ error: "Enter an email address." }, { status: 400 });

  // Cheap to abuse (spamming someone's inbox with login links) — a tight
  // per-IP limit, no session key since a signed-out visitor has no useful
  // session identity yet.
  const limited = await enforceRateLimit({
    name: "auth-login",
    sessionId: "n/a",
    ip: clientIp(req),
    sessionLimit: 1_000_000, // effectively unlimited — IP is the real control here
    ipLimit: 5,
    windowMs: 15 * 60 * 1000,
  });
  if (limited) return NextResponse.json({ error: limited.error }, { status: 429 });

  await requestLoginLink(email, req.nextUrl.origin);
  // Same response whether or not the send actually succeeded/the address
  // exists — don't let a client distinguish "no such account" from "sent".
  return NextResponse.json({ ok: true, message: "If that's a valid address, a sign-in link is on its way." });
}
