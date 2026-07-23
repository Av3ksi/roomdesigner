import { randomUUID } from "crypto";
import { cookies } from "next/headers";

const COOKIE_NAME = "maison_session";
const ONE_YEAR = 60 * 60 * 24 * 365;

/**
 * Anonymous per-browser continuity, not accounts. A real signup/login
 * system (the blueprint's `users` table) is deliberately deferred — this
 * is the minimum needed for "a room survives a refresh," staged before
 * building auth UI that has no real multi-user need yet. Only callable
 * from Route Handlers/Server Actions (cookie writes aren't allowed from
 * plain Server Component rendering).
 */
export async function getOrCreateSessionId(): Promise<string> {
  const store = await cookies();
  const existing = store.get(COOKIE_NAME)?.value;
  if (existing) return existing;
  const id = randomUUID();
  store.set(COOKIE_NAME, id, { httpOnly: true, sameSite: "lax", maxAge: ONE_YEAR, path: "/" });
  return id;
}
