import { dbEnabled, ensureSchema, sql } from "./db";

/**
 * Credit-based gate for the paid AI room-generation calls (composite add,
 * remove-object, move-object) — replaces the old single-free-generation
 * session_usage table (lib/usageLimits.ts, now removed). Every session
 * starts with FREE_CREDITS; each confirmed render spends exactly one;
 * hitting zero blocks further renders until more are granted (a real
 * Stripe purchase once wired, or an admin grant — see
 * app/api/debug/credits). Separate from lib/rateLimit.ts's abuse
 * protection, which stays in place underneath this.
 *
 * Gating is keyed off the anonymous session cookie (lib/session.ts), not
 * a real account — same accepted tradeoff as the old system: trivially
 * reset by clearing cookies or an incognito window, not fixable without
 * adding signup friction. Premium accounts (lib/auth.ts's is_premium)
 * bypass this module entirely — callers check that first and never call
 * anything here when premium, same pattern as before.
 *
 * Two tables, not one, on purpose:
 *   - credit_accounts.credits_remaining is THE gate — a single atomic
 *     `UPDATE ... WHERE credits_remaining > 0` that Postgres serializes
 *     safely at the row level under concurrent requests, no manual
 *     locking needed.
 *   - credit_transactions is an append-only log of every change (initial
 *     grant, spend, admin grant/reset, future purchase) for history/
 *     support ("why did my credits change"). It is NOT read for the
 *     gating decision — computing the live balance as SUM(amount) instead
 *     of maintaining the counter would have a real double-spend race
 *     under concurrent requests (two concurrent reads of the same sum
 *     can both pass a >0 check before either's INSERT is visible to the
 *     other, since there's no row to lock against on an aggregate read).
 *     Keeping both costs one extra INSERT per change, which is cheap
 *     next to the AI call it's gating.
 */

export const FREE_CREDITS = 3;

const memoryStore = new Map<string, number>();

async function ensureAccount(sessionId: string): Promise<void> {
  await ensureSchema();
  const db = sql();
  const rows = await db`
    INSERT INTO credit_accounts (session_id, credits_remaining)
    VALUES (${sessionId}, ${FREE_CREDITS})
    ON CONFLICT (session_id) DO NOTHING
    RETURNING session_id
  `;
  // Only the actual creator logs the initial grant — ON CONFLICT DO
  // NOTHING returns no rows when the account already existed.
  if (rows.length > 0) {
    await db`INSERT INTO credit_transactions (session_id, amount, reason) VALUES (${sessionId}, ${FREE_CREDITS}, 'initial_grant')`;
  }
}

export async function getCreditBalance(sessionId: string): Promise<number> {
  if (dbEnabled()) {
    try {
      await ensureAccount(sessionId);
      const db = sql();
      const rows = await db`SELECT credits_remaining FROM credit_accounts WHERE session_id = ${sessionId}`;
      return Number(rows[0]?.credits_remaining ?? 0);
    } catch {
      // DB reachable but query failed — fall through to the memory fallback.
    }
  }
  if (!memoryStore.has(sessionId)) memoryStore.set(sessionId, FREE_CREDITS);
  return memoryStore.get(sessionId)!;
}

/** Read-only — call this BEFORE the billed AI call fires, so a session already at zero never reaches OpenAI/Replicate. */
export async function hasCreditsRemaining(sessionId: string): Promise<boolean> {
  return (await getCreditBalance(sessionId)) > 0;
}

/**
 * Atomically spends exactly one credit — call only once a render has
 * actually succeeded, so a failed render doesn't burn the user's balance.
 * Returns the new balance, or null if there were none left. That null
 * case is a narrow, accepted race (hasCreditsRemaining and this are two
 * separate calls with the real AI call in between — a concurrent request
 * could pass the pre-check too) — callers should NOT treat it as an
 * error; the render already succeeded and the customer shouldn't see a
 * failure for an accounting edge case. userId is optional metadata for
 * the transaction log only (see module doc comment) — never used for the
 * gate itself.
 */
export async function spendCredit(sessionId: string, userId: string | null = null, reason = "generation"): Promise<number | null> {
  if (dbEnabled()) {
    try {
      await ensureAccount(sessionId);
      const db = sql();
      const rows = await db`
        UPDATE credit_accounts SET credits_remaining = credits_remaining - 1, updated_at = now()
        WHERE session_id = ${sessionId} AND credits_remaining > 0
        RETURNING credits_remaining
      `;
      if (rows.length === 0) return null;
      await db`INSERT INTO credit_transactions (session_id, user_id, amount, reason) VALUES (${sessionId}, ${userId}, -1, ${reason})`;
      return Number(rows[0].credits_remaining);
    } catch {
      // fall through to the memory fallback
    }
  }
  const current = memoryStore.get(sessionId) ?? FREE_CREDITS;
  if (current <= 0) return null;
  const next = current - 1;
  memoryStore.set(sessionId, next);
  return next;
}

/**
 * Adds credits (a positive amount — purchase, admin grant) and logs it.
 * Not used for spending; use spendCredit for that so the >0 floor check
 * stays in one place.
 */
export async function grantCredits(sessionId: string, amount: number, reason: string, userId: string | null = null): Promise<number> {
  if (dbEnabled()) {
    try {
      await ensureAccount(sessionId);
      const db = sql();
      const rows = await db`
        UPDATE credit_accounts SET credits_remaining = credits_remaining + ${amount}, updated_at = now()
        WHERE session_id = ${sessionId}
        RETURNING credits_remaining
      `;
      await db`INSERT INTO credit_transactions (session_id, user_id, amount, reason) VALUES (${sessionId}, ${userId}, ${amount}, ${reason})`;
      return Number(rows[0]?.credits_remaining ?? 0);
    } catch {
      // fall through to the memory fallback
    }
  }
  const next = (memoryStore.get(sessionId) ?? FREE_CREDITS) + amount;
  memoryStore.set(sessionId, next);
  return next;
}

/** Debug/testing only — sets a session's balance to an exact value, logging the delta. Never expose this to real users; see app/api/debug/credits. */
export async function resetCredits(sessionId: string, amount: number = FREE_CREDITS): Promise<number> {
  const current = await getCreditBalance(sessionId);
  return grantCredits(sessionId, amount - current, "admin_reset");
}

export interface CreditHistoryEntry {
  amount: number;
  reason: string;
  createdAt: string;
}

/** Debug/testing only — the "why did my credits change" answer for one session. See app/api/debug/credits. */
export async function getCreditHistory(sessionId: string, limit = 50): Promise<CreditHistoryEntry[]> {
  if (!dbEnabled()) return [];
  await ensureSchema();
  const db = sql();
  const rows = await db`
    SELECT amount, reason, created_at FROM credit_transactions
    WHERE session_id = ${sessionId} ORDER BY created_at DESC LIMIT ${limit}
  `;
  return rows.map((r) => ({ amount: Number(r.amount), reason: r.reason as string, createdAt: r.created_at as string }));
}
