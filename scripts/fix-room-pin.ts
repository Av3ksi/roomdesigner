/**
 * Fixes a wrong clickable hotspot on an already-saved finished room,
 * without regenerating it.
 *
 * Hotspots are placed by one vision pass over the render
 * (lib/ai/locate.ts's detectSceneItems), which occasionally assigns a
 * product to the wrong object — or to nothing at all. Regenerating the
 * room to fix one pin means paying for every image call again and getting
 * a different render, which may be worse. This edits just the pins.
 *
 * Usage — inspect (always start here; prints ids and current pins):
 *   npx tsx scripts/fix-room-pin.ts <roomId>
 *
 * Usage — remove a wrong pin (product stays listed and purchasable,
 * it just gets no dot on the image):
 *   npx tsx scripts/fix-room-pin.ts <roomId> <productId> clear
 *
 * Usage — reposition a pin. x/y/w/h are fractions of the image, 0-1,
 * origin top-left, as a tight box around the object:
 *   npx tsx scripts/fix-room-pin.ts <roomId> <productId> 0.62 0.66 0.14 0.07
 *
 * Reads DATABASE_URL from .env.
 */
import { getFinishedRoom, updateFinishedRoomItemBoxes } from "../lib/finishedRooms";
import { dbEnabled } from "../lib/db";
import type { DetectionBox } from "../lib/types";

try {
  process.loadEnvFile?.();
} catch {
  // No .env file yet — the check below gives a clearer error.
}

function fmt(box: DetectionBox | null): string {
  if (!box) return "NO PIN";
  return `x=${box.x.toFixed(3)} y=${box.y.toFixed(3)} w=${box.w.toFixed(3)} h=${box.h.toFixed(3)}`;
}

async function main() {
  if (!dbEnabled()) {
    console.error("DATABASE_URL is not set. Add it to .env first.");
    process.exit(1);
  }

  const [roomId, productId, ...rest] = process.argv.slice(2);
  if (!roomId) {
    console.error("Usage: npx tsx scripts/fix-room-pin.ts <roomId> [productId] [clear | x y w h]");
    console.error("Find the roomId in the /looks/<id> URL.");
    process.exit(1);
  }

  const room = await getFinishedRoom(roomId);
  if (!room) {
    console.error(`No finished room with id ${roomId}.`);
    process.exit(1);
  }

  // Inspect mode — no product given.
  if (!productId) {
    console.log(`"${room.title}" — ${room.items.length} item(s):\n`);
    for (const item of room.items) {
      console.log(`  ${item.product.id}`);
      console.log(`    ${item.product.name}`);
      console.log(`    pin: ${fmt(item.box)}\n`);
    }
    console.log("To clear a wrong pin:");
    console.log(`  npx tsx scripts/fix-room-pin.ts ${roomId} <productId> clear`);
    console.log("To reposition one (fractions of the image, 0-1, origin top-left):");
    console.log(`  npx tsx scripts/fix-room-pin.ts ${roomId} <productId> 0.62 0.66 0.14 0.07`);
    return;
  }

  const target = room.items.find((i) => i.product.id === productId);
  if (!target) {
    console.error(`Room "${room.title}" has no product with id ${productId}.`);
    console.error("Run without a productId to list them.");
    process.exit(1);
  }

  // Rebuild the full map from what's currently stored, then change one entry —
  // updateFinishedRoomItemBoxes replaces the column wholesale, so every pin
  // that should survive has to be included.
  const itemBoxes: Record<string, DetectionBox> = {};
  for (const item of room.items) {
    if (item.box) itemBoxes[item.product.id] = item.box;
  }

  if (rest[0] === "clear") {
    delete itemBoxes[productId];
    await updateFinishedRoomItemBoxes(roomId, itemBoxes);
    console.log(`Cleared the pin for "${target.product.name}".`);
    console.log("It stays listed and purchasable on the look — it just has no dot on the image now.");
    return;
  }

  const nums = rest.slice(0, 4).map(Number);
  if (nums.length !== 4 || nums.some((n) => !Number.isFinite(n) || n < 0 || n > 1)) {
    console.error("Give either `clear` or four numbers between 0 and 1: x y w h");
    process.exit(1);
  }
  const [x, y, w, h] = nums;
  if (x + w > 1.001 || y + h > 1.001) {
    console.error(`That box runs off the image (x+w=${(x + w).toFixed(3)}, y+h=${(y + h).toFixed(3)}). Both must be <= 1.`);
    process.exit(1);
  }

  itemBoxes[productId] = { x, y, w, h };
  await updateFinishedRoomItemBoxes(roomId, itemBoxes);
  console.log(`Moved the pin for "${target.product.name}" to ${fmt({ x, y, w, h })}.`);
  console.log(`Reload /looks/${roomId} to check it.`);
}

main().catch((err) => {
  console.error("Failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
