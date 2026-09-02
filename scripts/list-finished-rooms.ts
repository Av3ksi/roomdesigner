/**
 * Lists all finished room bundles with their ids — for finding which one
 * to pass to scripts/delete-finished-room.ts while curating.
 *
 * Usage: npx tsx scripts/list-finished-rooms.ts
 */
import { listFinishedRooms } from "../lib/finishedRooms";

try {
  process.loadEnvFile?.();
} catch {
  // No .env file yet — listFinishedRooms() just returns an empty list without one.
}

async function main() {
  const rooms = await listFinishedRooms();
  if (rooms.length === 0) {
    console.log("No finished rooms yet.");
    return;
  }
  for (const r of rooms) {
    console.log(`${r.id}\tCHF ${r.totalPrice}\t${r.products.length} product(s)\t${r.title}`);
  }
}

main().catch((err) => {
  console.error("Failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
