import { NextRequest, NextResponse } from "next/server";
import { compositingEnabled, removeExistingObject } from "@/lib/ai/composite";
import { segmentExistingFurniture } from "@/lib/ai/vision/segmentation";
import { replicateEnabled } from "@/lib/ai/vision/replicate";
import type { ProductCategory } from "@/lib/types";

// sharp (segmentation + compositing) needs the Node runtime, not edge.
export const runtime = "nodejs";

/**
 * Phase 2: erases an existing object already physically present in the room
 * photo. Two real, billed calls happen here in sequence — Replicate
 * segmentation to find the object, then an OpenAI edit to erase it — so
 * this only ever fires from an explicit user confirmation, same discipline
 * as /api/composite.
 */
export async function POST(req: NextRequest) {
  if (!replicateEnabled()) {
    return NextResponse.json({ error: "REPLICATE_API_TOKEN not configured on the server." }, { status: 501 });
  }
  if (!compositingEnabled()) {
    return NextResponse.json({ error: "OPENAI_API_KEY not configured on the server." }, { status: 501 });
  }

  const form = await req.formData().catch(() => null);
  const roomFile = form?.get("room");
  const category = form?.get("category");
  if (!form || !(roomFile instanceof File) || typeof category !== "string") {
    return NextResponse.json({ error: "Missing room photo or category." }, { status: 400 });
  }

  const roomBuffer = Buffer.from(await roomFile.arrayBuffer());

  try {
    const segmentation = await segmentExistingFurniture(roomBuffer, category as ProductCategory);
    if (!segmentation) {
      return NextResponse.json(
        { error: `No existing ${category} was found in this photo to remove.` },
        { status: 404 },
      );
    }

    const result = await removeExistingObject(roomBuffer, segmentation.mask, category as ProductCategory);
    return NextResponse.json({ imageBase64: result.imageBase64, removedBox: segmentation.box });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
