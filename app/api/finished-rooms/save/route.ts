import { NextRequest, NextResponse } from "next/server";
import { dbEnabled } from "@/lib/db";
import { createFinishedRoom, type FinishedRoomExternalItem } from "@/lib/finishedRooms";
import { isValidBox } from "@/lib/placementBoxes";
import { clientIp, enforceRateLimit } from "@/lib/rateLimit";
import { getCurrentUserId, getOrCreateSessionId } from "@/lib/session";

export const runtime = "nodejs";

const MAX_TITLE_LENGTH = 80;
const MAX_PRODUCTS = 20;

function sanitizeExternals(raw: unknown[]): FinishedRoomExternalItem[] {
  return raw
    .filter((e): e is Record<string, unknown> => typeof e === "object" && e !== null)
    .filter((e) => typeof e.name === "string" && typeof e.url === "string" && /^https?:\/\//i.test(e.url as string))
    .map((e) => ({
      name: e.name as string,
      url: e.url as string,
      retailer: typeof e.retailer === "string" ? e.retailer : "",
      priceText: typeof e.priceText === "string" ? e.priceText : null,
      box: isValidBox(e.box) ? e.box : null,
    }));
}

function stripDataUrlPrefix(value: string): string {
  const commaIndex = value.indexOf(",");
  return value.startsWith("data:") && commaIndex !== -1 ? value.slice(commaIndex + 1) : value;
}

/**
 * "Save to my collection" — bookmarks a room straight out of the Designer,
 * private by default. No signup required (same anonymous session as the
 * rest of the app); only publishing it to Complete Rooms later requires
 * login (see /api/finished-rooms/[id]/publish). Unlike /api/publish, the
 * photo here is already an AI-rendered composite the Designer produced, and
 * the item boxes are already known from placement, not guessed.
 */
export async function POST(req: NextRequest) {
  if (!dbEnabled()) {
    return NextResponse.json({ error: "Saving rooms isn't configured on this server yet (needs DATABASE_URL)." }, { status: 501 });
  }

  const sessionId = await getOrCreateSessionId();
  const limited = await enforceRateLimit({
    name: "finished-rooms-save",
    sessionId,
    ip: clientIp(req),
    sessionLimit: 20,
    ipLimit: 60,
  });
  if (limited) return NextResponse.json({ error: limited.error }, { status: 429 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });

  const title = typeof body.title === "string" ? body.title.trim().slice(0, MAX_TITLE_LENGTH) : "";
  const heroImage = typeof body.heroImageBase64 === "string" ? body.heroImageBase64 : "";
  const productIds: string[] = Array.isArray(body.productIds)
    ? body.productIds.filter((id: unknown): id is string => typeof id === "string").slice(0, MAX_PRODUCTS)
    : [];
  const externals = Array.isArray(body.externals) ? sanitizeExternals(body.externals) : [];

  if (!heroImage) return NextResponse.json({ error: "Missing the room photo to save." }, { status: 400 });
  if (productIds.length === 0 && externals.length === 0) {
    return NextResponse.json({ error: "Nothing to save yet — add at least one piece to the room first." }, { status: 400 });
  }

  const itemBoxes = body.itemBoxes && typeof body.itemBoxes === "object" ? body.itemBoxes : undefined;
  const autoMatchedIds = Array.isArray(body.autoMatchedIds)
    ? body.autoMatchedIds.filter((id: unknown): id is string => typeof id === "string")
    : undefined;
  const totalPrice = typeof body.totalPrice === "number" && Number.isFinite(body.totalPrice) ? body.totalPrice : 0;

  const userId = await getCurrentUserId();

  try {
    const id = await createFinishedRoom({
      title: title || "My room",
      description: "",
      styleTags: [],
      heroImageBase64: stripDataUrlPrefix(heroImage),
      productIds,
      itemBoxes,
      autoMatchedIds,
      externals,
      totalPrice,
      source: "user",
      userId,
      sessionId,
      published: false,
    });
    return NextResponse.json({ id });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
