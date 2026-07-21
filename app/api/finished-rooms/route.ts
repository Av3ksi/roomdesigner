import { NextRequest, NextResponse } from "next/server";
import { dbEnabled } from "@/lib/db";
import { createFinishedRoom } from "@/lib/finishedRooms";

export const runtime = "nodejs";

/** Saves a previously-generated (via /api/finished-rooms/generate) scene as a published, sellable bundle. */
export async function POST(req: NextRequest) {
  if (!dbEnabled()) {
    return NextResponse.json({ error: "DATABASE_URL not configured on the server." }, { status: 501 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });

  const { title, description, styleTags, heroImageBase64, productIds, itemBoxes, totalPrice } = body;
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
      totalPrice,
    });
    return NextResponse.json({ id });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
