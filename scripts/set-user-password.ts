/**
 * Sets (or creates) an account's password and premium flag directly in the
 * database — the bootstrap tool for the one password-login exception (see
 * lib/auth.ts's module doc comment). Every other account stays magic-link
 * only; this is for an owner/admin account that wants to sign in without
 * waiting on an email every time.
 *
 * Usage:
 *   npx tsx scripts/set-user-password.ts <email> <password> [--premium]
 *
 * Reads DATABASE_URL from .env.
 */
import { setUserPassword } from "../lib/auth";
import { dbEnabled } from "../lib/db";

try {
  process.loadEnvFile?.();
} catch {
  // No .env file yet — the clearer "DATABASE_URL not configured" check below handles it.
}

async function main() {
  const [email, password, flag] = process.argv.slice(2);
  if (!email || !password) {
    console.error("Usage: npx tsx scripts/set-user-password.ts <email> <password> [--premium]");
    process.exit(1);
  }
  if (!dbEnabled()) {
    console.error("DATABASE_URL is not set. Add it to .env first.");
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("Use a password at least 8 characters long.");
    process.exit(1);
  }

  const premium = flag === "--premium";
  const { userId } = await setUserPassword(email, password, premium);
  console.log(`Done. ${email} can now sign in with a password at /login${premium ? " — premium enabled." : "."} (user id: ${userId})`);
}

main().catch((err) => {
  console.error("Failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
