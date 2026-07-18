import { NextRequest, NextResponse } from "next/server";
import { aiEnabled } from "@/lib/ai/claude";
import { runDesignerTurn, type ChatTurn, type Constraint, type RoomContext } from "@/lib/ai/designer";
import { fetchVidaxlCatalog } from "@/lib/suppliers";

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
 * explicit per-proposal confirm fires /api/composite separately. State
 * (history, constraints, room context) round-trips through the client
 * until the Phase-1 database chunk lands.
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

  try {
    const catalog = await fetchVidaxlCatalog();
    const result = await runDesignerTurn(history, message, catalog.products, roomPhoto, constraints, roomContext);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
