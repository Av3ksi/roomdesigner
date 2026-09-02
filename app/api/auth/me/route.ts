import { NextResponse } from "next/server";
import { getUserById } from "@/lib/auth";
import { getCurrentUserId } from "@/lib/session";

export const runtime = "nodejs";

/** Lets client components (e.g. the nav) check sign-in state without a full server-component rewrite. */
export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ user: null });
  const user = await getUserById(userId);
  return NextResponse.json({ user: user ? { email: user.email } : null });
}
