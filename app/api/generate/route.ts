import { NextResponse } from "next/server";
import { aiEnabled, generateNarratives } from "@/lib/ai/claude";
import { buildConceptProducts } from "@/lib/products";
import { makeVariantSpec, STYLE_MAP, VARIANT_NAMES, VARIANT_NOTES } from "@/lib/styles";
import type {
  DesignBrief,
  DesignConcept,
  GenerateResponse,
  RoomAnalysis,
} from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

interface GenerateBody {
  styleId?: string;
  analysis?: RoomAnalysis;
  brief?: Partial<DesignBrief>;
}

const LIFESTYLE_NOTES: Record<string, string> = {
  kids: "Rounded edges, wipeable finishes and anchored pieces keep it kid-proof.",
  pets: "Performance fabrics and forgiving tones stand up to claws and fur.",
  office: "A daylight corner is kept clear for focused work.",
  hosting: "The seating plan flexes to hold a crowd without rearranging.",
};

const BUDGET_NOTES: Record<string, string> = {
  essential: "Specified to an accessible budget with zero visual compromise.",
  luxe: "Specified with heirloom-grade pieces throughout.",
};

function templateNarrative(
  style: string,
  variantNote: string,
  analysis: RoomAnalysis | undefined,
  brief: Partial<DesignBrief>,
): string {
  const light = analysis
    ? `${analysis.windows.orientation.toLowerCase()}-facing light`
    : "available natural light";
  const floor = analysis ? analysis.flooring.material.toLowerCase() : "existing floor";
  const extras = [
    ...(brief.lifestyle ?? []).map((l) => LIFESTYLE_NOTES[l]).filter(Boolean).slice(0, 1),
    ...(brief.budget && BUDGET_NOTES[brief.budget] ? [BUDGET_NOTES[brief.budget]] : []),
  ];
  const article = /^[AEIOU]/i.test(style) ? "An" : "A";
  return [`${article} ${style} scheme composed around the ${light} and the ${floor}.`, variantNote, ...extras]
    .join(" ")
    .trim();
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
  const brief = body.brief ?? {};
  const budget = brief.budget ?? "signature";
  const brands = brief.brands ?? [];

  let narratives: string[] | null = null;
  if (analysis) {
    const facts = [
      `room type: ${analysis.roomType}`,
      `${analysis.dimensions.areaM2} m², ${analysis.dimensions.heightM} m ceilings`,
      `windows: ${analysis.windows.count} facing ${analysis.windows.orientation} (${analysis.windows.naturalLight})`,
      `flooring: ${analysis.flooring.tone} ${analysis.flooring.material}`,
      `lighting: ${analysis.lighting.artificial}`,
      `budget tier: ${budget}`,
      brief.lifestyle?.length ? `lifestyle: ${brief.lifestyle.join(", ")}` : "",
      brands.length ? `preferred brands: ${brands.join(", ")}` : "",
    ]
      .filter(Boolean)
      .join("; ");
    narratives = await generateNarratives(analysis.summary, facts, style.name, VARIANT_NAMES);
  }

  const concepts: DesignConcept[] = [0, 1, 2].map((variant) => {
    const products = buildConceptProducts(style.id, variant, budget, brands);
    return {
      id: `${style.id}-v${variant}-${budget}`,
      styleId: style.id,
      variant,
      name: VARIANT_NAMES[variant],
      narrative:
        narratives?.[variant] ??
        templateNarrative(style.name, VARIANT_NOTES[variant], analysis, brief),
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
