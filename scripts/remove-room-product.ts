/**
 * Removes one product from an already-published finished room — its buy-pin,
 * its entry in the product list, and its share of the room's total.
 *
 * For when a room shipped with a product that isn't actually in the picture.
 * The confirmed case: auto-matching a staged object to the catalogue used to
 * ignore what KIND of object it was, so "Decke, beige, über Sofalehne
 * drapiert" (a beige throw over the sofa arm) matched a beige Sherpa
 * armchair — a CHF 176 buy-pin for a chair, sitting on a blanket. That
 * matching bug is fixed in scripts/generate-showroom-rooms.ts, but rooms
 * rendered before the fix are already live.
 *
 * Regenerating the room would cost a full set of paid image calls to repair
 * a data error, and would produce a different picture. This edits the saved
 * room in place and costs nothing.
 *
 * Run with no product id to list what a room currently contains, so you can
 * see the ids and prices before removing anything:
 *   npx tsx scripts/remove-room-product.ts <roomId>
 *
 * Then remove the offending one:
 *   npx tsx scripts/remove-room-product.ts <roomId> <productId>
 *
 * Read-only until a productId is supplied. Reads DATABASE_URL from .env.
 */
import { dbEnabled } from "../lib/db";
import { getFinishedRoom, removeFinishedRoomProduct } from "../lib/finishedRooms";

try {
  process.loadEnvFile?.();
} catch {
  // No .env file yet — the check below gives a clearer error.
}

async function main() {
  const [roomId, productId] = process.argv.slice(2);
  if (!roomId) {
    console.error("Usage: npx tsx scripts/remove-room-product.ts <roomId> [productId]");
    process.exit(1);
  }
  if (!dbEnabled()) {
    console.error("DATABASE_URL is not set. Add it to .env first.");
    process.exit(1);
  }

  const room = await getFinishedRoom(roomId);
  if (!room) {
    console.error(`No finished room with id ${roomId}.`);
    process.exit(1);
  }

  const items = room.items;

  if (!productId) {
    console.log(`"${room.title}" — CHF ${room.totalPrice} across ${items.length} item(s)\n`);
    for (const item of items) {
      const flags = [
        item.autoMatched ? "AUTO-MATCHED" : null,
        item.box ? null : "no pin",
      ].filter(Boolean).join(", ");
      console.log(`  ${item.product.id}`);
      console.log(`    ${item.product.name} — CHF ${item.product.price} [${item.product.category}]${flags ? `   <- ${flags}` : ""}`);
    }
    console.log("\nAuto-matched items are the ones worth checking: they were matched to an object");
    console.log("the render staged by itself, rather than deliberately placed. Remove one with:");
    console.log(`  npx tsx scripts/remove-room-product.ts ${roomId} <productId>`);
    return;
  }

  const item = items.find((i) => i.product.id === productId);
  if (!item) {
    console.error(`Room "${room.title}" does not contain ${productId}.`);
    console.error("Run without a productId to list what it does contain.");
    process.exit(1);
  }

  const ok = await removeFinishedRoomProduct(roomId, productId, item.product.price);
  if (!ok) {
    console.error("Update failed — nothing was changed.");
    process.exit(1);
  }
  console.log(`Removed "${item.product.name}" (CHF ${item.product.price}) from "${room.title}".`);
  console.log(`New total: CHF ${Math.max(0, room.totalPrice - item.product.price)} across ${items.length - 1} item(s).`);
  console.log(`View at /looks/${roomId}`);
}

main().catch((err) => {
  console.error("Failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
