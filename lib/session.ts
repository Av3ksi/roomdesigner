import { randomUUID } from "crypto";
import { cookies } from "next/headers";

const COOKIE_NAME = "vistroom_session";
const USER_COOKIE_NAME = "vistroom_user";
const ONE_YEAR = 60 * 60 * 24 * 365;

/**
 * Anonymous per-browser continuity, not accounts. This is the minimum
 * needed for "a room/cart survives a refresh," and stays in place even
 * once a user logs in (lib/auth.ts) — the user cookie below is additive,
 * identifying WHO is browsing on top of this anonymous session, not a
 * replacement for it (guest checkout still works with only this cookie).
 * Only callable from Route Handlers/Server Actions (cookie writes aren't
 * allowed from plain Server Component rendering).
 */
export async function getOrCreateSessionId(): Promise<string> {
  const store = await cookies();
  const existing = store.get(COOKIE_NAME)?.value;
  if (existing) return existing;
  const id = randomUUID();
  store.set(COOKIE_NAME, id, { httpOnly: true, sameSite: "lax", maxAge: ONE_YEAR, path: "/" });
  return id;
}

/** The logged-in user's id, or null if signed out. Never creates one — see lib/auth.ts for that. */
export async function getCurrentUserId(): Promise<string | null> {
  const store = await cookies();
  return store.get(USER_COOKIE_NAME)?.value ?? null;
}

/** Sets the signed-in session after a magic-link verification succeeds. Route Handlers/Server Actions only. */
export async function setUserSession(userId: string): Promise<void> {
  const store = await cookies();
  store.set(USER_COOKIE_NAME, userId, { httpOnly: true, sameSite: "lax", maxAge: ONE_YEAR, path: "/" });
}

/** Signs out — clears the user cookie only, keeping the anonymous session (and its cart) intact. */
export async function clearUserSession(): Promise<void> {
  const store = await cookies();
  store.delete(USER_COOKIE_NAME);
}
