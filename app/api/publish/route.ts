import { NextRequest, NextResponse } from "next/server";
import { createFinishedRoom } from "@/lib/finishedRooms";
import { getProductsByIds } from "@/lib/productSearchDb";
import { dbEnabled } from "@/lib/db";
import { clientIp, enforceRateLimit } from "@/lib/rateLimit";
import { getCurrentUserId, getOrCreateSessionId } from "@/lib/session";

export const runtime = "nodejs";

const MAX_TITLE_LENGTH = 80;
const MAX_DESCRIPTION_LENGTH = 400;
const MAX_STYLE_TAGS = 6;
const MAX_PRODUCTS = 20;

function stripDataUrlPrefix(value: string): string {
  const commaIndex = value.indexOf(",");
  return value.startsWith("data:") && commaIndex !== -1 ? value.slice(commaIndex + 1) : value;
}

/**
 * Lets a signed-in customer publish their own real room to /looks for
 * inspiration — the community counterpart to Looks Studio's curated
 * bundles (see lib/finishedRooms.ts's `source` column). No AI call here:
 * the photo and product tags are exactly what the customer submits, so
 * there's no per-submission API cost to rate-limit against, just the usual
 * spam/abuse concern for a public write endpoint.
 */
export async function POST(req: NextRequest) {
  if (!dbEnabled()) {
    return NextResponse.json({ error: "Publishing isn't configured on this server yet (needs DATABASE_URL)." }, { status: 501 });
  }

  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: "Sign in to publish your room." }, { status: 401 });

  const limited = await enforceRateLimit({
    name: "publish",
    sessionId: await getOrCreateSessionId(),
    ip: clientIp(req),
    sessionLimit: 10,
    ipLimit: 20,
  });
  if (limited) return NextResponse.json({ error: limited.error }, { status: 429 });

  const body = await req.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim().slice(0, MAX_TITLE_LENGTH) : "";
  const description = typeof body?.description === "string" ? body.description.trim().slice(0, MAX_DESCRIPTION_LENGTH) : "";
  const styleTags: string[] = Array.isArray(body?.styleTags)
    ? body.styleTags.filter((t: unknown): t is string => typeof t === "string" && t.length > 0).slice(0, MAX_STYLE_TAGS)
    : [];
  const photo = typeof body?.photoBase64 === "string" ? body.photoBase64 : "";
  const productIds: string[] = Array.isArray(body?.productIds)
    ? body.productIds.filter((id: unknown): id is string => typeof id === "string").slice(0, MAX_PRODUCTS)
    : [];

  if (!title) return NextResponse.json({ error: "Give your room a title." }, { status: 400 });
  if (!photo) return NextResponse.json({ error: "Upload a photo of your room." }, { status: 400 });
  if (productIds.length === 0) return NextResponse.json({ error: "Tag at least one product used in this room." }, { status: 400 });

  const products = await getProductsByIds(productIds);
  if (products.length === 0) {
    return NextResponse.json({ error: "None of the tagged products could be found in our catalog." }, { status: 400 });
  }

  const totalPrice = products.reduce((sum, p) => sum + p.price, 0);

  const id = await createFinishedRoom({
    title,
    description,
    styleTags,
    heroImageBase64: stripDataUrlPrefix(photo),
    productIds: products.map((p) => p.id),
    totalPrice,
    source: "user",
    userId,
  });

  return NextResponse.json({ id });
}
