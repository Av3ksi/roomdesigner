import { NextRequest, NextResponse } from "next/server";
import { aiEnabled } from "@/lib/ai/claude";
import { runDesignerTurn, type ChatTurn, type Constraint, type RoomContext } from "@/lib/ai/designer";
import { dbEnabled } from "@/lib/db";
import { loadProductCatalog } from "@/lib/productSearchDb";
import { appendMessage, createRoom, getRoomOwner, saveConstraints, saveRoomContext } from "@/lib/roomPersistence";
import { getOrCreateSessionId } from "@/lib/session";

// The agent's placement tool uses sharp — Node runtime required.
export const runtime = "nodejs";

function parseJsonField<T>(form: FormData, key: string, fallback: T): T {
  const raw = form.get(key);
  if (typeof raw !== "string" || !raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/**
 * One Designer Agent turn. Costs normal Claude usage per call (plus one
 * placement vision call the first time a photo is analyzed) — but never a
 * billed image render: the agent only *proposes* edits, and the UI's
 * explicit per-proposal confirm fires /api/composite separately.
 *
 * Persistence (Phase 1, chunk 2) is additive, not load-bearing: with no
 * DATABASE_URL configured this behaves exactly as before — state
 * round-trips through the client on every turn. With a DB configured, a
 * room row is created on the first message that carries a photo, and every
 * turn appends messages / saves constraints & room context against it.
 */
export async function POST(req: NextRequest) {
  if (!aiEnabled()) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured on the server." }, { status: 501 });
  }

  const form = await req.formData().catch(() => null);
  const message = form?.get("message");
  if (!form || typeof message !== "string" || !message.trim()) {
    return NextResponse.json({ error: "Missing message." }, { status: 400 });
  }

  const history = parseJsonField<ChatTurn[]>(form, "history", []);
  const constraints = parseJsonField<Constraint[]>(form, "constraints", []);
  const roomContext = parseJsonField<RoomContext | null>(form, "roomContext", null);

  const roomFile = form.get("room");
  const roomPhoto = roomFile instanceof File ? Buffer.from(await roomFile.arrayBuffer()) : null;

  const roomIdField = form.get("roomId");
  let roomId = typeof roomIdField === "string" && roomIdField ? roomIdField : null;

  // Persistence is additive: any DB hiccup here degrades to "no persistence
  // this turn" rather than failing the whole (billed) agent call.
  if (dbEnabled()) {
    try {
      const sessionId = await getOrCreateSessionId();
      if (roomId) {
        const owner = await getRoomOwner(roomId);
        if (owner !== sessionId) roomId = null; // not ours (or doesn't exist) — don't persist against it
      }
      if (!roomId && roomPhoto) {
        roomId = await createRoom(sessionId, roomPhoto.toString("base64"));
      }
      if (roomId) {
        await appendMessage(roomId, "user", message);
      }
    } catch {
      roomId = null;
    }
  }

  try {
    const catalog = await loadProductCatalog();
    const result = await runDesignerTurn(history, message, catalog, roomPhoto, constraints, roomContext);

    if (roomId) {
      try {
        await appendMessage(roomId, "assistant", result.reply);
        await saveConstraints(roomId, result.constraints);
        if (result.roomContext) await saveRoomContext(roomId, result.roomContext);
      } catch {
        // Reply already succeeded — a persistence failure here shouldn't surface as an error.
      }
    }

    return NextResponse.json({ ...result, roomId });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
