import { NextResponse } from "next/server";
import { aiEnabled, interpretAssistantMessage, type RawAssistantAction } from "@/lib/ai/claude";
import { BRAND_COUNTRY, BRANDS, brandsFromCountry } from "@/lib/products";
import type {
  AssistantAction,
  AssistantContext,
  AssistantResponse,
  BudgetTier,
  ProductCategory,
} from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

interface AssistantBody {
  message?: string;
  context?: AssistantContext;
}

const CATEGORIES: ProductCategory[] = [
  "sofa", "chair", "table", "lighting", "rug",
  "art", "plant", "storage", "decor", "textile",
];
const TIERS: BudgetTier[] = ["essential", "signature", "luxe"];

function normalize(raw: RawAssistantAction[]): AssistantAction[] {
  const actions: AssistantAction[] = [];
  for (const a of raw.slice(0, 4)) {
    switch (a.type) {
      case "adjust_warmth":
        if (typeof a.delta === "number") {
          actions.push({ type: "adjust_warmth", delta: Math.max(-0.4, Math.min(0.4, a.delta)) });
        }
        break;
      case "set_accent":
        if (a.hex === null || /^#[0-9a-fA-F]{6}$/.test(a.hex ?? "")) {
          actions.push({ type: "set_accent", hex: a.hex });
        }
        break;
      case "set_budget":
        if (TIERS.includes(a.tier as BudgetTier)) {
          actions.push({ type: "set_budget", tier: a.tier as BudgetTier });
        }
        break;
      case "swap_product":
        if (
          CATEGORIES.includes(a.category as ProductCategory) &&
          ["cheaper", "premium", "different"].includes(a.direction ?? "")
        ) {
          actions.push({
            type: "swap_product",
            category: a.category as ProductCategory,
            direction: a.direction as "cheaper" | "premium" | "different",
          });
        }
        break;
      case "restrict_brands": {
        const valid = (a.brands ?? []).filter((b) => BRANDS.includes(b));
        if (valid.length) actions.push({ type: "restrict_brands", brands: valid });
        break;
      }
      case "child_friendly":
        actions.push({ type: "child_friendly" });
        break;
    }
  }
  return actions;
}

/** Keyword engine used when no API key is configured. */
function demoInterpret(message: string): { reply: string; actions: AssistantAction[] } {
  const m = message.toLowerCase();
  const actions: AssistantAction[] = [];
  const notes: string[] = [];

  const category = CATEGORIES.find(
    (c) =>
      m.includes(c) ||
      (c === "sofa" && /couch/.test(m)) ||
      (c === "lighting" && /(lamp|light\b)/.test(m)) ||
      (c === "rug" && /carpet|teppich/.test(m)) ||
      (c === "table" && /tisch/.test(m)),
  );
  const direction = /cheap|günstig|less expensive|affordable/.test(m)
    ? "cheaper"
    : /premium|luxur|expensive|hochwertig|upscale/.test(m)
      ? "premium"
      : "different";

  if (/replace|swap|change|different|other|anders|ersetz|tausch/.test(m) && category) {
    actions.push({ type: "swap_product", category, direction });
    notes.push(`I've swapped the ${category} for a ${direction === "different" ? "fresh alternative" : `${direction} piece`}.`);
  }
  if (/warm|cozy|cosy|gemütlich|hygge/.test(m) && !/less warm/.test(m)) {
    actions.push({ type: "adjust_warmth", delta: 0.25 });
    notes.push("Lighting warmed up — more amber, softer shadows.");
  }
  if (/cool(er)?|brighter|less warm|kühler|heller/.test(m)) {
    actions.push({ type: "adjust_warmth", delta: -0.25 });
    notes.push("Cooled the light back toward daylight.");
  }
  if (/cheap|budget|günstig|less expensive|affordable|save/.test(m) && !actions.some((a) => a.type === "swap_product")) {
    actions.push({ type: "set_budget", tier: "essential" });
    notes.push("Re-specified every piece to the Essential tier — same design, friendlier total.");
  }
  if (/luxur|premium|expensive|high.?end|hochwertig|edler/.test(m) && !actions.some((a) => a.type === "swap_product")) {
    actions.push({ type: "set_budget", tier: "luxe" });
    notes.push("Upgraded the specification to Luxe — heirloom-grade pieces throughout.");
  }
  const countryMatch = Object.values(BRAND_COUNTRY).find((c) => m.includes(c.toLowerCase()));
  if (/swiss|schweiz/.test(m) || countryMatch) {
    const country = /swiss|schweiz/.test(m) ? "Switzerland" : countryMatch!;
    const brands = brandsFromCountry(country);
    if (brands.length) {
      actions.push({ type: "restrict_brands", brands });
      notes.push(`Limited the room to ${country === "Switzerland" ? "Swiss" : country} partners: ${brands.join(", ")}. Pieces without a match are set aside.`);
    } else {
      notes.push(`No ${country} retail partners in the catalog yet — I've kept the current selection.`);
    }
  }
  if (/child|kid|kinder|family|toddler|baby/.test(m)) {
    actions.push({ type: "child_friendly" });
    notes.push("Made it child-friendly: rounded-edge table, robust textiles, fragile decor set aside.");
  }
  const colorMap: Record<string, string> = {
    terracotta: "#C0603A", green: "#5A7058", sage: "#5A7058", blue: "#2B3A4A",
    navy: "#2B3A4A", brass: "#C8A96E", gold: "#C8A96E", red: "#6E3B33",
  };
  for (const [word, hex] of Object.entries(colorMap)) {
    if (m.includes(word) && /accent|color|colour|farbe|more\s/.test(m)) {
      actions.push({ type: "set_accent", hex });
      notes.push(`Accent shifted to ${word} across cushions, rug and art.`);
      break;
    }
  }

  if (actions.length === 0) {
    return {
      reply:
        "I can adjust this room live — try \"make it warmer\", \"replace the sofa\", \"make it cheaper\", \"use only Swiss stores\", \"make it more luxurious\" or \"create a child-friendly version\".",
      actions: [],
    };
  }
  return { reply: notes.join(" "), actions };
}

export async function POST(req: Request) {
  let body: AssistantBody;
  try {
    body = (await req.json()) as AssistantBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const message = body.message?.trim();
  if (!message || message.length > 500) {
    return NextResponse.json({ error: "Provide a message (max 500 chars)" }, { status: 400 });
  }

  const ctx = body.context;
  const contextText = [
    ctx ? `Style: ${ctx.styleName} (${ctx.styleId})` : "",
    ctx ? `Budget tier: ${ctx.budget}; current room total: CHF ${ctx.total}` : "",
    ctx ? `Pieces: ${ctx.productSummary}` : "",
    ctx ? `Room: ${ctx.roomSummary}` : "",
    `Retail partners (brand — country): ${BRANDS.map((b) => `${b} — ${BRAND_COUNTRY[b] ?? "?"}`).join("; ")}`,
  ]
    .filter(Boolean)
    .join("\n");

  const claude = await interpretAssistantMessage(message, contextText);
  if (claude) {
    const payload: AssistantResponse = {
      engine: "claude",
      reply: claude.reply,
      actions: normalize(claude.actions),
    };
    return NextResponse.json(payload);
  }

  const demo = demoInterpret(message);
  const payload: AssistantResponse = { engine: "demo", ...demo };
  return NextResponse.json(payload);
}
