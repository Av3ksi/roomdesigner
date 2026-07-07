import { NextResponse } from "next/server";
import { generateNarratives, aiEnabled } from "@/lib/ai/claude";
import { buildConceptProducts } from "@/lib/products";
import { STYLE_MAP, makeVariantSpec, VARIANT_NAMES, VARIANT_NOTES } from "@/lib/styles";
import type { DesignConcept, GenerateResponse, RoomAnalysis } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

interface GenerateBody {
  styleId?: string;
  analysis?: RoomAnalysis;
}

function templateNarrative(
  style: string,
  variantNote: string,
  analysis: RoomAnalysis | undefined,
): string {
  const light = analysis
    ? `${analysis.windows.orientation.toLowerCase()}-facing light`
    : "your room's natural light";
  const floor = analysis ? analysis.flooring.material.toLowerCase() : "existing flooring";
  return `A ${style} scheme composed around the ${light} and the ${floor}. ${variantNote}`;
}

export async function POST(req: Request) {
  let body: GenerateBody;
  try {
    body = (await req.json()) as GenerateBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const style = body.styleId ? STYLE_MAP[body.styleId] : undefined;
  if (!style) {
    return NextResponse.json({ error: "Unknown style" }, { status: 400 });
  }

  const analysis = body.analysis;
  let narratives: string[] | null = null;
  if (analysis) {
    const facts = [
      `room type: ${analysis.roomType}`,
      `${analysis.dimensions.areaM2} m², ${analysis.dimensions.heightM} m ceilings`,
      `windows: ${analysis.windows.count} facing ${analysis.windows.orientation} (${analysis.windows.naturalLight})`,
      `flooring: ${analysis.flooring.tone} ${analysis.flooring.material}`,
      `lighting: ${analysis.lighting.artificial}`,
    ].join("; ");
    narratives = await generateNarratives(
      analysis.summary,
      facts,
      style.name,
      VARIANT_NAMES,
    );
  }

  const concepts: DesignConcept[] = [0, 1, 2].map((variant) => {
    const products = buildConceptProducts(style.id, variant);
    return {
      id: `${style.id}-v${variant}`,
      styleId: style.id,
      variant,
      name: VARIANT_NAMES[variant],
      narrative:
        narratives?.[variant] ??
        templateNarrative(style.name, VARIANT_NOTES[variant], analysis),
      spec: makeVariantSpec(style.spec, variant),
      productIds: products.map((p) => p.id),
    };
  });

  const payload: GenerateResponse = {
    engine: narratives ? "claude" : "demo",
    concepts,
  };
  return NextResponse.json({ ...payload, aiEnabled: aiEnabled() });
}
