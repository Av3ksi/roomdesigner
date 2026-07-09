import Anthropic from "@anthropic-ai/sdk";
import type { RoomAnalysis } from "@/lib/types";
import { STYLES } from "@/lib/styles";

/**
 * Server-side Claude integration. Every function degrades gracefully:
 * if no ANTHROPIC_API_KEY is configured (or a call fails) we return null
 * and the caller falls back to the deterministic demo engine.
 */

const MODEL = "claude-opus-4-8";

export function aiEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function client(): Anthropic {
  return new Anthropic();
}

const STYLE_IDS = STYLES.map((s) => s.id);

/** JSON schema Claude's vision analysis must conform to (mirrors RoomAnalysis sans `engine`). */
const ANALYSIS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "roomType",
    "confidence",
    "summary",
    "dimensions",
    "walls",
    "windows",
    "doors",
    "flooring",
    "lighting",
    "colorPalette",
    "materials",
    "furniture",
    "detections",
    "opportunities",
    "styleAffinity",
  ],
  properties: {
    roomType: { type: "string" },
    confidence: { type: "number" },
    summary: { type: "string" },
    dimensions: {
      type: "object",
      additionalProperties: false,
      required: ["widthM", "depthM", "heightM", "areaM2"],
      properties: {
        widthM: { type: "number" },
        depthM: { type: "number" },
        heightM: { type: "number" },
        areaM2: { type: "number" },
      },
    },
    walls: {
      type: "object",
      additionalProperties: false,
      required: ["count", "condition", "finish"],
      properties: {
        count: { type: "integer" },
        condition: { type: "string" },
        finish: { type: "string" },
      },
    },
    windows: {
      type: "object",
      additionalProperties: false,
      required: ["count", "orientation", "naturalLight"],
      properties: {
        count: { type: "integer" },
        orientation: { type: "string" },
        naturalLight: { type: "string" },
      },
    },
    doors: {
      type: "object",
      additionalProperties: false,
      required: ["count", "note"],
      properties: {
        count: { type: "integer" },
        note: { type: "string" },
      },
    },
    flooring: {
      type: "object",
      additionalProperties: false,
      required: ["material", "tone", "condition"],
      properties: {
        material: { type: "string" },
        tone: { type: "string" },
        condition: { type: "string" },
      },
    },
    lighting: {
      type: "object",
      additionalProperties: false,
      required: ["naturalScore", "artificial", "colorTemperature"],
      properties: {
        naturalScore: { type: "integer" },
        artificial: { type: "string" },
        colorTemperature: { type: "string" },
      },
    },
    colorPalette: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["hex", "name"],
        properties: {
          hex: { type: "string" },
          name: { type: "string" },
        },
      },
    },
    materials: { type: "array", items: { type: "string" } },
    furniture: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["item", "condition", "verdict"],
        properties: {
          item: { type: "string" },
          condition: { type: "string" },
          verdict: { type: "string" },
        },
      },
    },
    detections: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "detail", "confidence", "box"],
        properties: {
          label: { type: "string" },
          detail: { type: "string" },
          confidence: { type: "number" },
          box: {
            type: "object",
            additionalProperties: false,
            required: ["x", "y", "w", "h"],
            properties: {
              x: { type: "number" },
              y: { type: "number" },
              w: { type: "number" },
              h: { type: "number" },
            },
          },
        },
      },
    },
    opportunities: { type: "array", items: { type: "string" } },
    styleAffinity: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["styleId", "score"],
        properties: {
          styleId: { type: "string", enum: STYLE_IDS },
          score: { type: "integer" },
        },
      },
    },
  },
} as const;

const ANALYSIS_SYSTEM = `You are the spatial-analysis engine of Maison, a premium AI interior design platform. You analyze a single photograph of a real room the way a senior interior designer and a surveyor would, together.

Ground every claim in what is visible. Estimate dimensions from architectural cues (door heights ~2.03m, ceiling lines, floorboard widths, furniture scale) and mark low-confidence estimates as estimates in prose fields. Bounding boxes are relative coordinates (0–1) with origin at the top-left of the image; include only objects you can actually localize. styleAffinity scores (0–100) rank how well each design style would suit this specific room's light, proportions and architecture. The summary should read like a designer's first impression: specific, warm, honest about problems.`;

function firstText(content: Anthropic.ContentBlock[]): string | null {
  for (const block of content) {
    if (block.type === "text") return block.text;
  }
  return null;
}

export interface VisionImage {
  base64: string;
  mediaType: "image/jpeg" | "image/png" | "image/webp";
  kind: "photo" | "floorplan";
}

export async function analyzeRoomImage(
  images: VisionImage[],
): Promise<RoomAnalysis | null> {
  if (!aiEnabled() || images.length === 0) return null;
  try {
    const photos = images.filter((i) => i.kind === "photo");
    const plans = images.filter((i) => i.kind === "floorplan");
    const content: Anthropic.ContentBlockParam[] = [];
    images.forEach((img, i) => {
      content.push({
        type: "text",
        text:
          img.kind === "floorplan"
            ? `Image ${i + 1}: the room's floor plan — use it to sharpen dimension and layout estimates.`
            : `Image ${i + 1}: room photograph${photos.length > 1 ? ` (angle ${photos.indexOf(img) + 1} of ${photos.length})` : ""}.`,
      });
      content.push({
        type: "image",
        source: { type: "base64", media_type: img.mediaType, data: img.base64 },
      });
    });
    content.push({
      type: "text",
      text: `Analyze this room completely from ${images.length > 1 ? "all provided images (cross-reference the angles" + (plans.length ? " and the floor plan" : "") + " for accuracy)" : "the photograph"}: type, dimensions, walls, windows, doors, flooring, lighting, color palette, materials, existing furniture (with keep/replace verdicts), localized detections (bounding boxes relative to the FIRST photograph), design opportunities, and style affinity.`,
    });

    const response = await client().messages.create({
      model: MODEL,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      system: ANALYSIS_SYSTEM,
      output_config: {
        format: {
          type: "json_schema",
          schema: ANALYSIS_SCHEMA as unknown as Record<string, unknown>,
        },
      },
      messages: [{ role: "user", content }],
    });

    if (response.stop_reason === "refusal") return null;
    const text = firstText(response.content);
    if (!text) return null;
    const parsed = JSON.parse(text) as Omit<RoomAnalysis, "engine">;
    return { engine: "claude", ...parsed };
  } catch (err) {
    console.error("[maison] Claude analysis failed, falling back to demo:", err);
    return null;
  }
}

/* ————— AI designer assistant ————— */

const ASSISTANT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["reply", "actions"],
  properties: {
    reply: { type: "string" },
    actions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "delta", "hex", "tier", "category", "direction", "brands"],
        properties: {
          type: {
            type: "string",
            enum: [
              "adjust_warmth",
              "set_accent",
              "set_budget",
              "swap_product",
              "restrict_brands",
              "child_friendly",
            ],
          },
          delta: { type: ["number", "null"] },
          hex: { type: ["string", "null"] },
          tier: { type: ["string", "null"], enum: ["essential", "signature", "luxe", null] },
          category: {
            type: ["string", "null"],
            enum: [
              "sofa", "chair", "table", "lighting", "rug",
              "art", "plant", "storage", "decor", "textile", null,
            ],
          },
          direction: { type: ["string", "null"], enum: ["cheaper", "premium", "different", null] },
          brands: { type: ["array", "null"], items: { type: "string" } },
        },
      },
    },
  },
} as const;

export interface RawAssistantAction {
  type: string;
  delta: number | null;
  hex: string | null;
  tier: string | null;
  category: string | null;
  direction: string | null;
  brands: string[] | null;
}

/**
 * Interprets a free-text designer request ("make it warmer", "use only Swiss
 * stores") into a short reply plus structured room actions. Null when AI is
 * disabled — callers fall back to the keyword engine.
 */
export async function interpretAssistantMessage(
  message: string,
  context: string,
): Promise<{ reply: string; actions: RawAssistantAction[] } | null> {
  if (!aiEnabled()) return null;
  try {
    const response = await client().messages.create({
      model: MODEL,
      max_tokens: 4096,
      thinking: { type: "adaptive" },
      system: `You are Maison's AI interior designer, chatting with a client inside their generated room design. Interpret their request into (1) a warm, specific 1–2 sentence reply in the language they wrote in, and (2) structured actions the app applies instantly.

Available actions:
- adjust_warmth (delta -0.4..0.4): warmer/cozier lighting vs cooler/brighter
- set_accent (hex): change the accent color woven through cushions, rug and art
- set_budget (tier essential|signature|luxe): cheaper ↔ more luxurious product specification
- swap_product (category + direction cheaper|premium|different): replace one piece
- restrict_brands (brands array): limit to specific retail partners — resolve country requests using the provided brand→country list
- child_friendly: rounded edges, robust materials, no fragile decor

Prefer 1–2 precise actions over many. If the request is out of scope, reply helpfully with zero actions.`,
      output_config: {
        format: {
          type: "json_schema",
          schema: ASSISTANT_SCHEMA as unknown as Record<string, unknown>,
        },
      },
      messages: [
        {
          role: "user",
          content: `Current room context:\n${context}\n\nClient message: "${message}"`,
        },
      ],
    });
    if (response.stop_reason === "refusal") return null;
    const text = firstText(response.content);
    if (!text) return null;
    return JSON.parse(text) as { reply: string; actions: RawAssistantAction[] };
  } catch (err) {
    console.error("[maison] Claude assistant failed, falling back to demo:", err);
    return null;
  }
}

const NARRATIVE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["narratives"],
  properties: {
    narratives: {
      type: "array",
      items: { type: "string" },
    },
  },
} as const;

/**
 * Writes three designer narratives (one per concept variant) that reference
 * the actual analysis of the user's room. Returns null when AI is disabled.
 */
export async function generateNarratives(
  analysisSummary: string,
  roomFacts: string,
  styleName: string,
  variantNames: string[],
): Promise<string[] | null> {
  if (!aiEnabled()) return null;
  try {
    const response = await client().messages.create({
      model: MODEL,
      max_tokens: 4096,
      thinking: { type: "adaptive" },
      system:
        "You are a senior interior designer at Maison writing concept notes for a client. Each note is 2–3 sentences, specific to the client's actual room, confident and warm — never generic marketing copy. Reference the room's real light, proportions or materials.",
      output_config: {
        format: {
          type: "json_schema",
          schema: NARRATIVE_SCHEMA as unknown as Record<string, unknown>,
        },
      },
      messages: [
        {
          role: "user",
          content: `Room analysis: ${analysisSummary}\n\nKey facts: ${roomFacts}\n\nWrite one concept note for each of these three "${styleName}" concept variants: ${variantNames.join(", ")}. Return exactly three narratives in order.`,
        },
      ],
    });

    if (response.stop_reason === "refusal") return null;
    const text = firstText(response.content);
    if (!text) return null;
    const parsed = JSON.parse(text) as { narratives: string[] };
    if (!Array.isArray(parsed.narratives) || parsed.narratives.length < 3) return null;
    return parsed.narratives.slice(0, 3);
  } catch (err) {
    console.error("[maison] Claude narrative generation failed:", err);
    return null;
  }
}
