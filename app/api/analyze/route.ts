import { NextResponse } from "next/server";
import { analyzeRoomImage, aiEnabled } from "@/lib/ai/claude";
import { demoAnalysisForUpload } from "@/lib/analysis";
import { SAMPLE_ROOM_MAP } from "@/lib/rooms";

export const runtime = "nodejs";
export const maxDuration = 120;

const MEDIA_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

interface AnalyzeBody {
  sampleRoomId?: string;
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

  if (!body.imageBase64) {
    return NextResponse.json(
      { error: "Provide imageBase64 or sampleRoomId" },
      { status: 400 },
    );
  }
  const mediaType = body.mediaType && MEDIA_TYPES.has(body.mediaType)
    ? (body.mediaType as "image/jpeg" | "image/png" | "image/webp")
    : "image/jpeg";

  // ~10MB of base64 keeps us well inside API limits (client downscales first).
  if (body.imageBase64.length > 14_000_000) {
    return NextResponse.json({ error: "Image too large" }, { status: 413 });
  }

  const claudeAnalysis = await analyzeRoomImage(body.imageBase64, mediaType);
  if (claudeAnalysis) {
    return NextResponse.json({ analysis: claudeAnalysis, aiEnabled: true });
  }

  const seed = body.seedKey ?? body.imageBase64.slice(0, 512);
  return NextResponse.json({
    analysis: demoAnalysisForUpload(seed),
    aiEnabled: aiEnabled(),
  });
}
