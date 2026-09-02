import { randomUUID } from "crypto";
import { dbEnabled, ensureSchema, sql } from "./db";
import { loginEmailHtml, sendEmail } from "./email";
import { hashPassword, verifyPassword as verifyPasswordHash } from "./password";

/**
 * Real accounts — email only by default, no passwords to hash, store, or
 * leak for a normal customer. Signing in sends a one-time link (magic
 * link) via Resend; clicking it both logs in an existing user and creates
 * the account on first use, so there's no separate "sign up" flow to build
 * or get out of sync. A narrow exception (verifyPassword/setUserPassword
 * below) lets one account — an owner/admin — sign in with a real password
 * set via scripts/set-user-password.ts, instead of everyone else's flow.
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
    subject: "Your Vistroom sign-in link",
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

export interface AuthUser {
  id: string;
  email: string;
  isPremium: boolean;
}

export async function getUserById(userId: string): Promise<AuthUser | null> {
  if (!authEnabled()) return null;
  await ensureSchema();
  const db = sql();
  const rows = await db`SELECT id, email, is_premium FROM users WHERE id = ${userId}`;
  const row = rows[0] as { id: string; email: string; is_premium: boolean } | undefined;
  return row ? { id: row.id, email: row.email, isPremium: row.is_premium } : null;
}

/** Cheap unlimited-generations check for the freemium gate — null userId (signed out) is always false, no query needed. */
export async function isPremiumUser(userId: string | null): Promise<boolean> {
  if (!userId || !authEnabled()) return false;
  const user = await getUserById(userId);
  return user?.isPremium ?? false;
}

/**
 * Password sign-in — the exception path alongside the normal magic link.
 * Only ever succeeds for an account that has a password_hash set (via
 * setUserPassword below); every normal customer's is NULL, so this can
 * never accidentally let someone in with a guessed/blank password.
 */
export async function verifyPassword(email: string, password: string): Promise<{ userId: string; email: string } | null> {
  if (!authEnabled()) return null;
  await ensureSchema();
  const db = sql();
  const rows = await db`SELECT id, email, password_hash FROM users WHERE email = ${email.trim().toLowerCase()}`;
  const row = rows[0] as { id: string; email: string; password_hash: string | null } | undefined;
  if (!row || !row.password_hash) return null; // no such account, or one that never opted into password login
  return verifyPasswordHash(password, row.password_hash) ? { userId: row.id, email: row.email } : null;
}

/**
 * Sets (or creates, then sets) an account's password and premium flag —
 * called from scripts/set-user-password.ts, never from a user-facing
 * route. Upserts by email like verifyLoginToken does, so this also works
 * for an email that's never signed in before (bootstrapping an owner
 * account with no prior magic-link history). premium always overwrites
 * (the script always passes an explicit true/false) rather than leaving it
 * alone on conflict — simplest correct behavior for a tool only the owner
 * runs, no need for a "leave unchanged" sentinel value.
 */
export async function setUserPassword(email: string, password: string, premium: boolean): Promise<{ userId: string; email: string }> {
  await ensureSchema();
  const db = sql();
  const normalized = email.trim().toLowerCase();
  const hash = hashPassword(password);
  const rows = await db`
    INSERT INTO users (email, password_hash, is_premium)
    VALUES (${normalized}, ${hash}, ${premium})
    ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, is_premium = EXCLUDED.is_premium
    RETURNING id, email
  `;
  const user = rows[0] as { id: string; email: string };
  return { userId: user.id, email: user.email };
}

/** Turns premium off (a canceled/expired subscription) — Stripe ids are left on record, only the flag changes. */
export async function setUserPremium(userId: string, premium: boolean): Promise<void> {
  await ensureSchema();
  const db = sql();
  await db`UPDATE users SET is_premium = ${premium} WHERE id = ${userId}`;
}

/** Turns premium on and records which Stripe customer/subscription it came from — called once a subscription checkout completes. */
export async function setUserPremiumFromStripe(userId: string, customerId: string, subscriptionId: string): Promise<void> {
  await ensureSchema();
  const db = sql();
  await db`
    UPDATE users SET is_premium = true, stripe_customer_id = ${customerId}, stripe_subscription_id = ${subscriptionId}
    WHERE id = ${userId}
  `;
}

/** Finds the user a Stripe customer id belongs to — how the webhook maps a subscription event back to an account. */
export async function getUserByStripeCustomerId(customerId: string): Promise<{ id: string } | null> {
  await ensureSchema();
  const db = sql();
  const rows = await db`SELECT id FROM users WHERE stripe_customer_id = ${customerId}`;
  const row = rows[0] as { id: string } | undefined;
  return row ?? null;
}
