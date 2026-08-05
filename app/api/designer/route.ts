import { NextRequest, NextResponse } from "next/server";
import { aiEnabled } from "@/lib/ai/claude";
import { runDesignerTurn, type ChatTurn, type Constraint, type RoomContext } from "@/lib/ai/designer";
import { dbEnabled } from "@/lib/db";
import { loadProductCatalog } from "@/lib/productSearchDb";
import { clientIp, enforceRateLimit } from "@/lib/rateLimit";
import { appendMessage, createRoom, getRoomOwner, isRoomOwner, saveConstraints, saveRoomContext } from "@/lib/roomPersistence";
import { getCurrentUserId, getOrCreateSessionId } from "@/lib/session";

// The agent's placement tool uses sharp — Node runtime required.
export const runtime = "nodejs";
// A turn that calls search_web_for_product can now legitimately take up to
// ~100s for that one tool call (see lib/ai/webProductSearch.ts) plus the
// agent loop's own follow-up turn — without this, a serverless host's
// default function timeout (10-60s depending on platform/plan) would kill
// the request before our own, deliberately-configured timeout ever gets a
// chance to. Matches the maxDuration already used by this app's other
// AI-calling routes (app/api/generate, app/api/analyze).
export const maxDuration = 120;

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

  const sessionId = await getOrCreateSessionId();
  const limited = await enforceRateLimit({
    name: "designer",
    sessionId,
    ip: clientIp(req),
    sessionLimit: 20,
    ipLimit: 60,
  });
  if (limited) return NextResponse.json({ error: limited.error }, { status: 429 });

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
      const userId = await getCurrentUserId();
      if (roomId) {
        const owner = await getRoomOwner(roomId);
        if (!isRoomOwner(owner, sessionId, userId)) roomId = null; // not ours (or doesn't exist) — don't persist against it
      }
      if (!roomId && roomPhoto) {
        roomId = await createRoom(sessionId, roomPhoto.toString("base64"), [], null, userId);
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
    console.error("[vistroom] /api/designer failed:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
