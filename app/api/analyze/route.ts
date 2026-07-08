import { NextResponse } from "next/server";
import { aiEnabled, analyzeRoomImage, type VisionImage } from "@/lib/ai/claude";
import { demoAnalysisForUpload } from "@/lib/analysis";
import { SAMPLE_ROOM_MAP } from "@/lib/rooms";
import type { AnalyzeImagePayload } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

const MEDIA_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGES = 5;
const MAX_B64_PER_IMAGE = 14_000_000; // client downscales; hard server ceiling

interface AnalyzeBody {
  sampleRoomId?: string;
  /** Multi-angle upload payload (photos + optional floor plan). */
  images?: AnalyzeImagePayload[];
  /** Legacy single-image field, still accepted. */
  imageBase64?: string;
  mediaType?: string;
  seedKey?: string;
}

export async function POST(req: Request) {
  let body: AnalyzeBody;
  try {
    body = (await req.json()) as AnalyzeBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Sample rooms ship with a hand-built expert analysis.
  if (body.sampleRoomId) {
    const room = SAMPLE_ROOM_MAP[body.sampleRoomId];
    if (!room) {
      return NextResponse.json({ error: "Unknown sample room" }, { status: 404 });
    }
    return NextResponse.json({ analysis: room.analysis, aiEnabled: aiEnabled() });
  }

  // Normalize legacy single-image bodies into the images[] shape.
  const rawImages: AnalyzeImagePayload[] = body.images?.length
    ? body.images
    : body.imageBase64
      ? [{ base64: body.imageBase64, mediaType: body.mediaType ?? "image/jpeg", kind: "photo" }]
      : [];

  if (rawImages.length === 0) {
    return NextResponse.json(
      { error: "Provide images[] or sampleRoomId" },
      { status: 400 },
    );
  }

  const images: VisionImage[] = [];
  for (const img of rawImages.slice(0, MAX_IMAGES)) {
    if (!img.base64 || img.base64.length > MAX_B64_PER_IMAGE) {
      return NextResponse.json({ error: "Image missing or too large" }, { status: 413 });
    }
    images.push({
      base64: img.base64,
      mediaType: MEDIA_TYPES.has(img.mediaType)
        ? (img.mediaType as VisionImage["mediaType"])
        : "image/jpeg",
      kind: img.kind === "floorplan" ? "floorplan" : "photo",
    });
  }

  const claudeAnalysis = await analyzeRoomImage(images);
  if (claudeAnalysis) {
    return NextResponse.json({ analysis: claudeAnalysis, aiEnabled: true });
  }

  const seed = body.seedKey ?? images[0].base64.slice(0, 512);
  return NextResponse.json({
    analysis: demoAnalysisForUpload(seed),
    aiEnabled: aiEnabled(),
  });
}
