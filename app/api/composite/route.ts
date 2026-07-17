import { NextRequest, NextResponse } from "next/server";
import { compositeProductIntoRoom, compositingEnabled } from "@/lib/ai/composite";
import type { ProductCategory } from "@/lib/types";

// sharp (used by lib/ai/composite.ts) needs the Node runtime, not edge.
export const runtime = "nodejs";

/**
 * Every call here is a real, billed OpenAI request — this route only ever
 * fires from an explicit "Generate" button click in CompositePreview, never
 * automatically. No caching, no retries-on-mount, no polling.
 */
export async function POST(req: NextRequest) {
  if (!compositingEnabled()) {
    return NextResponse.json({ error: "OPENAI_API_KEY not configured on the server." }, { status: 501 });
  }

  const form = await req.formData();
  const roomFile = form.get("room");
  const productImageUrl = form.get("productImageUrl");
  const category = form.get("category");

  if (!(roomFile instanceof File) || typeof productImageUrl !== "string" || typeof category !== "string") {
    return NextResponse.json({ error: "Missing room photo, productImageUrl, or category." }, { status: 400 });
  }

  const productRes = await fetch(productImageUrl);
  if (!productRes.ok) {
    return NextResponse.json({ error: `Failed to fetch the product photo: ${productRes.status}` }, { status: 502 });
  }

  const roomBuffer = Buffer.from(await roomFile.arrayBuffer());
  const productBuffer = Buffer.from(await productRes.arrayBuffer());

  try {
    const result = await compositeProductIntoRoom(roomBuffer, productBuffer, category as ProductCategory, [], "low");
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
