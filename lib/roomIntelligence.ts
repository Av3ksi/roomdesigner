import { getProductDetails } from "./productDetails";
import type { Product, RoomAnalysis } from "./types";

/**
 * Deterministic "Room Intelligence": sustainability, energy efficiency and
 * furniture-compatibility signals derived from the same catalog + analysis
 * data everything else in the app already uses — no invented metrics.
 */

/* ————— Sustainability ————— */

const MATERIAL_SCORES: Record<string, number> = {
  oak: 82, walnut: 74, ash: 80, teak: 70, pine: 88, rattan: 90, cane: 90,
  wool: 85, linen: 88, cotton: 78, jute: 92, alpaca: 84, hemp: 94, bouclé: 70,
  ceramic: 76, stoneware: 78, washi: 90, rope: 86,
  leather: 48, velvet: 55, silk: 60, chenille: 58, twill: 62, herringbone: 62,
  brass: 65, steel: 45, iron: 45, glass: 58, concrete: 40,
  marble: 35, travertine: 38,
};

const CATEGORY_BASE: Partial<Record<Product["category"], number>> = {
  plant: 95,
};

function scoreForProduct(product: Product): number {
  const details = getProductDetails(product);
  const base = CATEGORY_BASE[product.category];
  if (base !== undefined) return base;
  const scores = details.materials
    .map((m) => MATERIAL_SCORES[m.toLowerCase()])
    .filter((s): s is number => s !== undefined);
  if (scores.length === 0) return 60;
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}

export interface SustainabilityReport {
  score: number;
  label: string;
  lowestPiece: { product: Product; score: number } | null;
  tip: string;
}

export function roomSustainability(products: Product[]): SustainabilityReport {
  if (products.length === 0) {
    return { score: 0, label: "—", lowestPiece: null, tip: "" };
  }
  const scored = products.map((p) => ({ product: p, score: scoreForProduct(p) }));
  const score = Math.round(scored.reduce((n, s) => n + s.score, 0) / scored.length);
  const lowestPiece = [...scored].sort((a, b) => a.score - b.score)[0] ?? null;
  const label = score >= 80 ? "Excellent" : score >= 65 ? "Good" : score >= 50 ? "Fair" : "Needs improvement";
  const tip =
    lowestPiece && lowestPiece.score < 65
      ? `Swapping the ${lowestPiece.product.name.toLowerCase()} for a natural-material alternative would lift the room's score the most.`
      : "This room leans on renewable, natural-first materials throughout.";
  return { score, label, lowestPiece, tip };
}

/* ————— Energy efficiency ————— */

export interface EnergyReport {
  score: number;
  tips: string[];
}

export function energyEfficiency(analysis: RoomAnalysis, products: Product[]): EnergyReport {
  const lightingPieces = products.filter((p) => p.category === "lighting").length;
  const naturalScore = analysis.lighting.naturalScore;
  const orientation = analysis.windows.orientation.toLowerCase();

  let score = Math.round(naturalScore * 0.55 + Math.min(100, lightingPieces * 20) * 0.2 + 25);
  score = Math.max(0, Math.min(100, score));

  const tips: string[] = [];
  if (naturalScore >= 70) {
    tips.push(`Strong natural light (${naturalScore}/100) — position task lighting to extend daylight hours instead of overhead fixtures.`);
  } else if (naturalScore < 45) {
    tips.push(`Natural light is limited (${naturalScore}/100) — layer dim-to-warm LED lighting rather than one bright overhead source to cut usage.`);
  }
  if (orientation.includes("south") || orientation.includes("west")) {
    tips.push(`${analysis.windows.orientation}-facing windows bring strong afternoon solar gain — light, thermal-backed curtains reduce cooling load in summer.`);
  } else if (orientation.includes("north")) {
    tips.push("North-facing light is soft and consistent but cooler — warmer-temperature bulbs (2700K) keep the room feeling inviting.");
  }
  if (lightingPieces === 0) {
    tips.push("No dedicated lighting in this basket yet — a dim-to-warm LED floor or table lamp cuts overhead-only energy use significantly.");
  } else {
    tips.push(`${lightingPieces} lighting piece${lightingPieces === 1 ? "" : "s"} selected — all Maison lighting defaults to dim-to-warm LED.`);
  }
  return { score, tips: tips.slice(0, 3) };
}

/* ————— Furniture compatibility ————— */

export interface CompatibilityReport {
  ok: boolean;
  warnings: string[];
}

export function furnitureCompatibility(products: Product[], styleId: string): CompatibilityReport {
  const warnings: string[] = [];

  const sofa = products.find((p) => p.category === "sofa");
  const table = products.find((p) => p.category === "table");
  if (sofa && table) {
    const sofaDim = getProductDetails(sofa).dimensions;
    const tableDim = getProductDetails(table).dimensions;
    const ratio = tableDim.w / sofaDim.w;
    if (ratio < 0.32) {
      warnings.push(`${table.name} may read as small next to ${sofa.name} — sizing up keeps the seating group balanced.`);
    } else if (ratio > 0.85) {
      warnings.push(`${table.name} is close in width to ${sofa.name} — leave at least 40cm of clearance on each side for circulation.`);
    }
  }

  const offStyle = products.filter((p) => !p.styles.includes(styleId));
  if (offStyle.length > 0) {
    const names = offStyle.slice(0, 2).map((p) => p.name).join(", ");
    warnings.push(
      `${names}${offStyle.length > 2 ? ` and ${offStyle.length - 2} more` : ""} ${offStyle.length === 1 ? "wasn't" : "weren't"} designed for this style — worth a second look against the rest of the palette.`,
    );
  }

  return { ok: warnings.length === 0, warnings };
}
