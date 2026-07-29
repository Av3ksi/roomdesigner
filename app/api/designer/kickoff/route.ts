import { NextRequest, NextResponse } from "next/server";
import { aiEnabled } from "@/lib/ai/claude";
import { runDesignerKickoff } from "@/lib/ai/designer";
import { dbEnabled } from "@/lib/db";
import { loadProductCatalog } from "@/lib/productSearchDb";
import { clientIp, enforceRateLimit } from "@/lib/rateLimit";
import { appendMessage, createRoom, saveConstraints, saveRoomContext } from "@/lib/roomPersistence";
import { getOrCreateSessionId } from "@/lib/session";

// The agent's placement tool uses sharp — Node runtime required.
export const runtime = "nodejs";

/**
 * Fires once, automatically, right after a room photo is uploaded — before
 * any chat message. Unlike /api/designer (one chat turn), this always takes
 * a fresh photo (a kickoff always starts a new room) and never a roomId.
 */
export async function POST(req: NextRequest) {
  if (!aiEnabled()) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured on the server." }, { status: 501 });
  }

  const sessionId = await getOrCreateSessionId();
  const limited = await enforceRateLimit({
    name: "designer-kickoff",
    sessionId,
    ip: clientIp(req),
    sessionLimit: 15,
    ipLimit: 45,
  });
  if (limited) return NextResponse.json({ error: limited.error }, { status: 429 });

  const form = await req.formData().catch(() => null);
  const roomFile = form?.get("room");
  if (!form || !(roomFile instanceof File)) {
    return NextResponse.json({ error: "Missing room photo." }, { status: 400 });
  }

  const primaryPhoto = Buffer.from(await roomFile.arrayBuffer());
  const extraFiles = form.getAll("extraPhotos").filter((f): f is File => f instanceof File);
  const extraPhotos = await Promise.all(extraFiles.map(async (f) => Buffer.from(await f.arrayBuffer())));
  const floorplanFile = form.get("floorplan");
  const floorplanPhoto = floorplanFile instanceof File ? Buffer.from(await floorplanFile.arrayBuffer()) : null;

  try {
    const catalog = await loadProductCatalog();
    const result = await runDesignerKickoff(catalog, primaryPhoto, extraPhotos, floorplanPhoto);

    let roomId: string | null = null;
    if (dbEnabled()) {
      try {
        roomId = await createRoom(
          sessionId,
          primaryPhoto.toString("base64"),
          extraPhotos.map((p) => p.toString("base64")),
          floorplanPhoto ? floorplanPhoto.toString("base64") : null,
        );
        await appendMessage(roomId, "assistant", result.reply);
        await saveConstraints(roomId, result.constraints);
        if (result.roomContext) await saveRoomContext(roomId, result.roomContext);
      } catch {
        // The kickoff already succeeded and is visible — a persistence hiccup here shouldn't surface as an error.
        roomId = null;
      }
    }

    return NextResponse.json({ ...result, roomId });
  } catch (err) {
    console.error("[maison] /api/designer/kickoff failed:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
