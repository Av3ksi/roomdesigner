import { ensureSchema, sql } from "./db";
import type { Constraint, RoomContext } from "./ai/designer";

/**
 * CRUD helpers over the Phase-1 persistence schema (lib/db.ts). Deliberately
 * thin — no ORM, no query builder, just tagged-template SQL against tables
 * that are small (per-room rows, not per-user-scale) for the foreseeable
 * future. Callers are always gated behind dbEnabled() upstream; nothing
 * here degrades gracefully on its own; that check happens at the API route.
 */

export interface PersistedMessage {
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export interface PersistedVersion {
  id: string;
  imageBase64: string;
  label: string;
  objects: unknown[];
  createdAt: string;
}

export interface PersistedRoom {
  id: string;
  title: string;
  originalPhotoBase64: string;
  extraPhotosBase64: string[];
  floorplanPhotoBase64: string | null;
  roomContext: RoomContext | null;
  messages: PersistedMessage[];
  constraints: Constraint[];
  versions: PersistedVersion[];
}

export async function createRoom(
  sessionId: string,
  originalPhotoBase64: string,
  extraPhotosBase64: string[] = [],
  floorplanPhotoBase64: string | null = null,
  userId: string | null = null,
): Promise<string> {
  await ensureSchema();
  const db = sql();
  const rows = await db`
    INSERT INTO rooms (session_id, original_photo, extra_photos, floorplan_photo, user_id)
    VALUES (${sessionId}, ${originalPhotoBase64}, ${extraPhotosBase64}, ${floorplanPhotoBase64}, ${userId})
    RETURNING id
  `;
  return rows[0].id as string;
}

export interface RoomOwner {
  sessionId: string;
  userId: string | null;
}

/** Raw ownership row for a roomId — callers should go through isRoomOwner() rather than compare fields directly. */
export async function getRoomOwner(roomId: string): Promise<RoomOwner | null> {
  await ensureSchema();
  const db = sql();
  const rows = await db`SELECT session_id, user_id FROM rooms WHERE id = ${roomId}`;
  const row = rows[0] as { session_id: string; user_id: string | null } | undefined;
  return row ? { sessionId: row.session_id, userId: row.user_id } : null;
}

/**
 * A room is accessible by the same anonymous session it was created in
 * (always true, even signed out) OR by the signed-in account it's since
 * been claimed by (see loadRoom's backfill below) — same "session_id OR
 * user_id" shape as lib/finishedRooms.ts's ownership checks, so a signed-in
 * user keeps access after clearing cookies or switching browsers, while a
 * signed-out visitor is never granted someone else's room by guessing a
 * session id.
 */
export function isRoomOwner(owner: RoomOwner | null, sessionId: string, userId: string | null): boolean {
  if (!owner) return false;
  if (owner.sessionId === sessionId) return true;
  return owner.userId !== null && userId !== null && owner.userId === userId;
}

export async function appendMessage(roomId: string, role: "user" | "assistant", content: string): Promise<void> {
  const db = sql();
  await db`INSERT INTO room_messages (room_id, role, content) VALUES (${roomId}, ${role}, ${content})`;
  await db`UPDATE rooms SET updated_at = now() WHERE id = ${roomId}`;
}

/** "Clear chat" — wipes the conversation only; the room's photo, versions and room_context are untouched. */
export async function clearMessages(roomId: string): Promise<void> {
  const db = sql();
  await db`DELETE FROM room_messages WHERE room_id = ${roomId}`;
  await db`UPDATE rooms SET updated_at = now() WHERE id = ${roomId}`;
}

/** Replaces the full constraint ledger — small table, simplest correct approach. */
export async function saveConstraints(roomId: string, constraints: Constraint[]): Promise<void> {
  const db = sql();
  await db`DELETE FROM room_constraints WHERE room_id = ${roomId}`;
  for (const c of constraints) {
    await db`INSERT INTO room_constraints (room_id, kind, description) VALUES (${roomId}, ${c.kind}, ${c.description})`;
  }
}

export async function saveRoomContext(roomId: string, roomContext: RoomContext): Promise<void> {
  const db = sql();
  await db`
    UPDATE rooms SET room_context = ${JSON.stringify(roomContext)}, updated_at = now()
    WHERE id = ${roomId}
  `;
}

export async function addVersion(
  roomId: string,
  imageBase64: string,
  label: string,
  objects: unknown[],
): Promise<string> {
  const db = sql();
  const rows = await db`
    INSERT INTO room_versions (room_id, image_base64, label, objects)
    VALUES (${roomId}, ${imageBase64}, ${label}, ${JSON.stringify(objects)})
    RETURNING id
  `;
  await db`UPDATE rooms SET updated_at = now() WHERE id = ${roomId}`;
  return rows[0].id as string;
}

/**
 * Deletes one rendered version — e.g. a bad/garbled render the user wants
 * gone. Scoped to (id AND room_id) together, not just id, so a version id
 * can never be used to delete a row belonging to a room the caller doesn't
 * own (the route's getRoomOwner check already gates on roomId, this is a
 * second belt-and-suspenders check at the query itself).
 */
export async function deleteVersion(roomId: string, versionId: string): Promise<void> {
  const db = sql();
  await db`DELETE FROM room_versions WHERE id = ${versionId} AND room_id = ${roomId}`;
  await db`UPDATE rooms SET updated_at = now() WHERE id = ${roomId}`;
}

/**
 * userId is the signed-in visitor's account, independent of whether this
 * particular room already knows about them. Matches by session_id OR
 * user_id (isRoomOwner's rule), and — the "claim" step — if it matched via
 * session_id while the room's own user_id is still NULL and the visitor is
 * signed in, backfills it right here. That's what makes a room started
 * anonymously, then continued after logging in, follow the account from
 * then on (a later request from a different browser/device, with a
 * different session_id, will still match on user_id).
 */
export async function loadRoom(roomId: string, sessionId: string, userId: string | null = null): Promise<PersistedRoom | null> {
  const db = sql();
  const roomRows = await db`
    SELECT * FROM rooms
    WHERE id = ${roomId} AND (session_id = ${sessionId} OR (${userId}::uuid IS NOT NULL AND user_id = ${userId}))
  `;
  if (!roomRows.length) return null;
  const room = roomRows[0];

  if (userId && !room.user_id) {
    await db`UPDATE rooms SET user_id = ${userId} WHERE id = ${roomId}`;
    room.user_id = userId;
  }

  const [messageRows, constraintRows, versionRows] = await Promise.all([
    db`SELECT role, content, created_at FROM room_messages WHERE room_id = ${roomId} ORDER BY created_at ASC`,
    db`SELECT kind, description FROM room_constraints WHERE room_id = ${roomId} ORDER BY created_at ASC`,
    db`SELECT id, image_base64, label, objects, created_at FROM room_versions WHERE room_id = ${roomId} ORDER BY created_at ASC`,
  ]);

  return {
    id: room.id as string,
    title: room.title as string,
    originalPhotoBase64: room.original_photo as string,
    extraPhotosBase64: (room.extra_photos as string[] | null) ?? [],
    floorplanPhotoBase64: (room.floorplan_photo as string | null) ?? null,
    roomContext: (room.room_context as RoomContext | null) ?? null,
    messages: messageRows.map((r) => ({
      role: r.role as "user" | "assistant",
      content: r.content as string,
      createdAt: r.created_at as string,
    })),
    constraints: constraintRows.map((r) => ({
      kind: r.kind as Constraint["kind"],
      description: r.description as string,
    })),
    versions: versionRows.map((r) => ({
      id: r.id as string,
      imageBase64: r.image_base64 as string,
      label: r.label as string,
      objects: r.objects as unknown[],
      createdAt: r.created_at as string,
    })),
  };
}

export async function listRooms(
  sessionId: string,
  userId: string | null = null,
): Promise<{ id: string; title: string; updatedAt: string }[]> {
  const db = sql();
  const rows = await db`
    SELECT id, title, updated_at FROM rooms
    WHERE session_id = ${sessionId} OR (${userId}::uuid IS NOT NULL AND user_id = ${userId})
    ORDER BY updated_at DESC LIMIT 50
  `;
  return rows.map((r) => ({ id: r.id as string, title: r.title as string, updatedAt: r.updated_at as string }));
}

/**
 * The one piece that actually makes a room follow a signed-in visitor to a
 * NEW browser/device: that request's anonymous session_id is necessarily
 * different there (a fresh cookie), so only user_id can find the room —
 * this is deliberately NOT OR'd with a session_id the way loadRoom/
 * listRooms are. Used by GET /api/rooms/latest, which Designer.tsx falls
 * back to only when it has no roomId remembered locally at all.
 */
export async function getMostRecentRoomForUser(userId: string): Promise<string | null> {
  await ensureSchema();
  const db = sql();
  const rows = await db`SELECT id FROM rooms WHERE user_id = ${userId} ORDER BY updated_at DESC LIMIT 1`;
  return rows.length ? (rows[0].id as string) : null;
}
