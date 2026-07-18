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
  roomContext: RoomContext | null;
  messages: PersistedMessage[];
  constraints: Constraint[];
  versions: PersistedVersion[];
}

export async function createRoom(sessionId: string, originalPhotoBase64: string): Promise<string> {
  await ensureSchema();
  const db = sql();
  const rows = await db`
    INSERT INTO rooms (session_id, original_photo)
    VALUES (${sessionId}, ${originalPhotoBase64})
    RETURNING id
  `;
  return rows[0].id as string;
}

/** Ownership check before trusting a client-supplied roomId. */
export async function getRoomOwner(roomId: string): Promise<string | null> {
  await ensureSchema();
  const db = sql();
  const rows = await db`SELECT session_id FROM rooms WHERE id = ${roomId}`;
  return rows.length ? (rows[0].session_id as string) : null;
}

export async function appendMessage(roomId: string, role: "user" | "assistant", content: string): Promise<void> {
  const db = sql();
  await db`INSERT INTO room_messages (room_id, role, content) VALUES (${roomId}, ${role}, ${content})`;
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

export async function loadRoom(roomId: string, sessionId: string): Promise<PersistedRoom | null> {
  const db = sql();
  const roomRows = await db`SELECT * FROM rooms WHERE id = ${roomId} AND session_id = ${sessionId}`;
  if (!roomRows.length) return null;
  const room = roomRows[0];

  const [messageRows, constraintRows, versionRows] = await Promise.all([
    db`SELECT role, content, created_at FROM room_messages WHERE room_id = ${roomId} ORDER BY created_at ASC`,
    db`SELECT kind, description FROM room_constraints WHERE room_id = ${roomId} ORDER BY created_at ASC`,
    db`SELECT id, image_base64, label, objects, created_at FROM room_versions WHERE room_id = ${roomId} ORDER BY created_at ASC`,
  ]);

  return {
    id: room.id as string,
    title: room.title as string,
    originalPhotoBase64: room.original_photo as string,
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

export async function listRooms(sessionId: string): Promise<{ id: string; title: string; updatedAt: string }[]> {
  const db = sql();
  const rows = await db`
    SELECT id, title, updated_at FROM rooms WHERE session_id = ${sessionId} ORDER BY updated_at DESC LIMIT 50
  `;
  return rows.map((r) => ({ id: r.id as string, title: r.title as string, updatedAt: r.updated_at as string }));
}
