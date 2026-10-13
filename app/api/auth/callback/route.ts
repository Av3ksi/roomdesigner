import { NextRequest, NextResponse } from "next/server";
import { verifyLoginToken } from "@/lib/auth";
import { setUserSession } from "@/lib/session";

export const runtime = "nodejs";

/** Magic-link landing endpoint — the URL emailed to the user. Verifies the token, signs them in, redirects. */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.redirect(new URL("/login?error=missing_token", req.url));
  }

  const result = await verifyLoginToken(token);
  if (!result) {
    return NextResponse.redirect(new URL("/login?error=expired", req.url));
  }

  await setUserSession(result.userId);
  return NextResponse.redirect(new URL("/account", req.url));
}
