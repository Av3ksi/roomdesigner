import { randomUUID } from "crypto";
import { dbEnabled, ensureSchema, sql } from "./db";
import { loginEmailHtml, sendEmail } from "./email";

/**
 * Real accounts — email only, no passwords to hash, store, or leak.
 * Signing in sends a one-time link (magic link) via Resend; clicking it
 * both logs in an existing user and creates the account on first use, so
 * there's no separate "sign up" flow to build or get out of sync.
 *
 * Requires DATABASE_URL (accounts need somewhere to live) — callers should
 * check authEnabled() and degrade to guest checkout when it's off, same
 * pattern as every other integration in this app.
 */

const TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes

export function authEnabled(): boolean {
  return dbEnabled();
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Creates a one-time login token and emails it. Always resolves (never
 * throws for an unknown email — there's no separate signup, so "unknown"
 * isn't a meaningful state) so the caller can give a uniform "check your
 * email" response regardless of whether the address was already
 * registered — avoids leaking which emails have accounts.
 */
export async function requestLoginLink(email: string, baseUrl: string): Promise<{ sent: boolean }> {
  const normalized = email.trim().toLowerCase();
  if (!authEnabled() || !isValidEmail(normalized)) return { sent: false };

  await ensureSchema();
  const db = sql();
  const token = randomUUID();
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
  await db`INSERT INTO login_tokens (token, email, expires_at) VALUES (${token}, ${normalized}, ${expiresAt})`;

  const loginUrl = `${baseUrl}/api/auth/callback?token=${token}`;
  const sent = await sendEmail({
    to: normalized,
    subject: "Your Maison sign-in link",
    html: loginEmailHtml(loginUrl),
  });
  return { sent };
}

/**
 * Redeems a one-time login token: validates it (exists, unexpired, unused),
 * marks it used, and returns/creates the corresponding user. Null means the
 * token was invalid, expired, or already used — the caller should show a
 * "link expired, request a new one" state, not a generic error.
 */
export async function verifyLoginToken(token: string): Promise<{ userId: string; email: string } | null> {
  if (!authEnabled()) return null;
  await ensureSchema();
  const db = sql();

  const rows = await db`
    UPDATE login_tokens SET used_at = now()
    WHERE token = ${token} AND used_at IS NULL AND expires_at > now()
    RETURNING email
  `;
  const row = rows[0] as { email: string } | undefined;
  if (!row) return null;

  const userRows = await db`
    INSERT INTO users (email) VALUES (${row.email})
    ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
    RETURNING id, email
  `;
  const user = userRows[0] as { id: string; email: string };
  return { userId: user.id, email: user.email };
}

export async function getUserById(userId: string): Promise<{ id: string; email: string } | null> {
  if (!authEnabled()) return null;
  await ensureSchema();
  const db = sql();
  const rows = await db`SELECT id, email FROM users WHERE id = ${userId}`;
  const row = rows[0] as { id: string; email: string } | undefined;
  return row ?? null;
}
