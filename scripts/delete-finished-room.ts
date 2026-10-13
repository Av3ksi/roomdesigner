/**
 * Removes a finished room bundle — for cleaning up test runs while
 * curating (there's no admin UI for this yet, just this script).
 *
 * Usage: npx tsx scripts/delete-finished-room.ts <id>
 * Find the id by running: npx tsx scripts/list-finished-rooms.ts
 */
import { dbEnabled, ensureSchema, sql } from "../lib/db";

try {
  process.loadEnvFile?.();
} catch {
  // No .env file yet — the clearer "DATABASE_URL not configured" check below handles it.
}

async function main() {
  const id = process.argv[2];
  if (!id) {
    console.error("Usage: npx tsx scripts/delete-finished-room.ts <id>");
    process.exit(1);
  }
  if (!dbEnabled()) {
    console.error("DATABASE_URL is not set. Add it to .env first.");
    process.exit(1);
  }

  await ensureSchema();
  const db = sql();
  const rows = await db`DELETE FROM finished_rooms WHERE id = ${id} RETURNING title`;
  if (!rows.length) {
    console.error(`No finished room found with id "${id}".`);
    process.exit(1);
  }
  console.log(`Deleted "${rows[0].title}" (${id}).`);
}

main().catch((err) => {
  console.error("Failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
