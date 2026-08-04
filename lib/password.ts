import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

/**
 * Password hashing for the one narrow exception to this app's "no
 * passwords, magic-link only" account design (lib/auth.ts) — an
 * owner/admin account that wants a real password instead of waiting on an
 * email every time. Uses Node's built-in scrypt (a recommended KDF) rather
 * than pulling in bcrypt/argon2 as a new dependency — this app already
 * leans toward thin, dependency-light wrappers everywhere else.
 */

const KEY_LENGTH = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, KEY_LENGTH);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

/** Constant-time compare — a plain `===` on the derived hash would leak timing info about how many leading bytes matched. */
export function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const candidate = scryptSync(password, salt, KEY_LENGTH);
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}
