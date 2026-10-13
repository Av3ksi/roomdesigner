import { dbEnabled, ensureSchema, sql } from "./db";

/**
 * Abuse/cost protection for the paid AI endpoints. Every route that fires a
 * real-money Claude/OpenAI call should check this before doing any work —
 * without it, anyone who finds the endpoint URL can burn the API budget
 * with no limit at all (this was flagged as a real, unaddressed launch
 * risk — nothing gated these before this file existed).
 *
 * Postgres-backed: one row per limiter key, atomically reset-if-expired-or-
 * incremented in a single UPSERT, so the limit holds across server
 * restarts and multiple instances, and concurrent requests from the same
 * key can't race past it. Falls back to an in-memory per-process Map when
 * DATABASE_URL isn't configured — weaker (resets on restart, doesn't work
 * across instances) but still far better than no limit, and consistent
 * with how every other integration in this app degrades.
 */

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** ms until the current window resets and the count clears. */
  retryAfterMs: number;
}

const memoryStore = new Map<string, { count: number; windowStart: number }>();

async function checkRateLimitDb(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
  await ensureSchema();
  const db = sql();
  const cutoff = new Date(Date.now() - windowMs);
  const rows = await db`
    INSERT INTO rate_limits (key, window_start, count)
    VALUES (${key}, now(), 1)
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN rate_limits.window_start <= ${cutoff} THEN 1 ELSE rate_limits.count + 1 END,
      window_start = CASE WHEN rate_limits.window_start <= ${cutoff} THEN now() ELSE rate_limits.window_start END
    RETURNING count, window_start
  `;
  const row = rows[0] as { count: number; window_start: string };
  const windowStart = new Date(row.window_start).getTime();
  return {
    allowed: row.count <= limit,
    remaining: Math.max(0, limit - row.count),
    retryAfterMs: Math.max(0, windowStart + windowMs - Date.now()),
  };
}

function checkRateLimitMemory(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const entry = memoryStore.get(key);
  if (!entry || now - entry.windowStart >= windowMs) {
    memoryStore.set(key, { count: 1, windowStart: now });
    return { allowed: true, remaining: limit - 1, retryAfterMs: windowMs };
  }
  entry.count++;
  return {
    allowed: entry.count <= limit,
    remaining: Math.max(0, limit - entry.count),
    retryAfterMs: Math.max(0, entry.windowStart + windowMs - now),
  };
}

/**
 * Checks and atomically increments a rate-limit counter for `key`. Fails
 * OPEN if the DB check itself errors (falls back to the in-memory limiter
 * rather than blocking the request) — a rate-limiter bug should degrade
 * protection, not take down the feature it's protecting.
 */
export async function checkRateLimit(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
  if (dbEnabled()) {
    try {
      return await checkRateLimitDb(key, limit, windowMs);
    } catch {
      return checkRateLimitMemory(key, limit, windowMs);
    }
  }
  return checkRateLimitMemory(key, limit, windowMs);
}

const HOUR_MS = 60 * 60 * 1000;

/**
 * Checks both a per-session and a coarser per-IP limit for one named
 * endpoint, returning a ready-to-use error response when either is
 * exceeded, or null when the request should proceed. Session-based limiting
 * is the primary control (this app already has an anonymous session
 * cookie); the IP check is a backstop against someone simply clearing
 * cookies to reset their session-based allowance.
 */
export async function enforceRateLimit(opts: {
  name: string;
  sessionId: string;
  ip: string;
  sessionLimit: number;
  ipLimit: number;
  windowMs?: number;
}): Promise<{ error: string; retryAfterSeconds: number } | null> {
  const windowMs = opts.windowMs ?? HOUR_MS;
  const [bySession, byIp] = await Promise.all([
    checkRateLimit(`${opts.name}:session:${opts.sessionId}`, opts.sessionLimit, windowMs),
    checkRateLimit(`${opts.name}:ip:${opts.ip}`, opts.ipLimit, windowMs),
  ]);
  const blocked = !bySession.allowed ? bySession : !byIp.allowed ? byIp : null;
  if (!blocked) return null;
  const retryAfterSeconds = Math.max(1, Math.ceil(blocked.retryAfterMs / 1000));
  return {
    error: `Too many requests — try again in ${Math.ceil(retryAfterSeconds / 60)} minute(s).`,
    retryAfterSeconds,
  };
}

/** Best-effort client IP from proxy headers — "unknown" locally, where every request shares one bucket. */
export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}
