import { dbEnabled, ensureSchema, sql } from "./db";

/**
 * Freemium gate for the paid AI room-generation calls (composite add +
 * remove-object) — separate from lib/rateLimit.ts's abuse protection, which
 * stays in place underneath this. One free generation per anonymous
 * session (see lib/session.ts), then a paywall. Same DB-primary +
 * in-memory-fallback shape as rateLimit.ts: with no DATABASE_URL this still
 * enforces the limit (per-process, resets on restart) rather than giving up
 * and allowing unlimited billed renders.
 *
 * Gating is keyed off the anonymous session cookie, not a real account —
 * so it's trivially reset by clearing cookies or opening an incognito
 * window. That's an accepted tradeoff of "no signup required" (not fixable
 * without adding friction this feature was explicitly asked to avoid).
 */

export const FREE_GENERATION_LIMIT = 1;

const memoryStore = new Map<string, number>();

/**
 * Read-only — call this BEFORE the billed OpenAI call fires, so a session
 * that's already at the limit never reaches OpenAI. Increment separately
 * with recordGeneration() only once the render actually succeeds, so a
 * failed render doesn't burn the user's free generation.
 */
export async function hasFreeGenerationsRemaining(sessionId: string): Promise<boolean> {
  if (dbEnabled()) {
    try {
      await ensureSchema();
      const db = sql();
      const rows = await db`SELECT generation_count FROM session_usage WHERE session_id = ${sessionId}`;
      const count = Number(rows[0]?.generation_count ?? 0);
      return count < FREE_GENERATION_LIMIT;
    } catch {
      // DB reachable but query failed — fall through to the memory fallback.
    }
  }
  return (memoryStore.get(sessionId) ?? 0) < FREE_GENERATION_LIMIT;
}

/** Call once a render has actually succeeded. */
export async function recordGeneration(sessionId: string): Promise<void> {
  if (dbEnabled()) {
    try {
      await ensureSchema();
      const db = sql();
      await db`
        INSERT INTO session_usage (session_id, generation_count)
        VALUES (${sessionId}, 1)
        ON CONFLICT (session_id) DO UPDATE SET
          generation_count = session_usage.generation_count + 1,
          updated_at = now()
      `;
      return;
    } catch {
      // DB reachable but query failed — fall through to the memory fallback.
    }
  }
  memoryStore.set(sessionId, (memoryStore.get(sessionId) ?? 0) + 1);
}

/** Debug/testing only — resets a session back to zero free generations used. Never expose this to real users. */
export async function resetGenerationCount(sessionId: string): Promise<void> {
  if (dbEnabled()) {
    try {
      await ensureSchema();
      const db = sql();
      await db`DELETE FROM session_usage WHERE session_id = ${sessionId}`;
    } catch {
      // fall through
    }
  }
  memoryStore.delete(sessionId);
}

export interface UsageStatus {
  used: number;
  limit: number;
  remaining: number;
}

/** Current usage snapshot for the UI — lets Designer.tsx show the paywall proactively instead of only after a blocked request. */
export async function getUsageStatus(sessionId: string): Promise<UsageStatus> {
  let used = memoryStore.get(sessionId) ?? 0;
  if (dbEnabled()) {
    try {
      await ensureSchema();
      const db = sql();
      const rows = await db`SELECT generation_count FROM session_usage WHERE session_id = ${sessionId}`;
      used = Number(rows[0]?.generation_count ?? 0);
    } catch {
      // fall through to the memory value already read above
    }
  }
  return { used, limit: FREE_GENERATION_LIMIT, remaining: Math.max(0, FREE_GENERATION_LIMIT - used) };
}
