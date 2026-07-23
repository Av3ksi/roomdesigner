import { NextRequest, NextResponse } from "next/server";
import { dbEnabled } from "@/lib/db";
import { createFinishedRoom, type FinishedRoomExternalItem } from "@/lib/finishedRooms";
import { isValidBox } from "@/lib/placementBoxes";

export const runtime = "nodejs";

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

/** Saves a previously-generated (via /api/finished-rooms/generate) scene as a published, sellable bundle. */
export async function POST(req: NextRequest) {
  if (!dbEnabled()) {
    return NextResponse.json({ error: "DATABASE_URL not configured on the server." }, { status: 501 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });

  const { title, description, styleTags, heroImageBase64, productIds, itemBoxes, autoMatchedIds, externals, totalPrice } = body;
  if (
    typeof title !== "string" ||
    !title.trim() ||
    typeof heroImageBase64 !== "string" ||
    !heroImageBase64 ||
    !Array.isArray(productIds) ||
    productIds.length === 0 ||
    typeof totalPrice !== "number"
  ) {
    return NextResponse.json({ error: "Missing or invalid title, heroImageBase64, productIds, or totalPrice." }, { status: 400 });
  }

  try {
    const id = await createFinishedRoom({
      title: title.trim(),
      description: typeof description === "string" ? description : "",
      styleTags: Array.isArray(styleTags) ? styleTags.filter((t) => typeof t === "string") : [],
      heroImageBase64,
      productIds,
      itemBoxes: itemBoxes && typeof itemBoxes === "object" ? itemBoxes : undefined,
      autoMatchedIds: Array.isArray(autoMatchedIds) ? autoMatchedIds.filter((id) => typeof id === "string") : undefined,
      externals: Array.isArray(externals) ? sanitizeExternals(externals) : undefined,
      totalPrice,
    });
    return NextResponse.json({ id });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
