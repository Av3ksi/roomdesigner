import type { Product, RoomAnalysis } from "./types";

/**
 * Full-renovation add-ons beyond furniture: paint, flooring refinish and
 * lighting rough-in, estimated from the room's measured area and the
 * furniture basket. Clearly an estimate, not a contractor quote.
 */
export interface RenovationEstimate {
  paint: number;
  flooring: number;
  electrical: number;
  total: number;
}

const PAINT_RATE_PER_M2 = 22; // walls + ceiling, materials + labor, CHF/m² of floor area
const WALL_AREA_FACTOR = 2.6; // approximate wall+ceiling area per m² of floor
const FLOORING_REFINISH_RATE = 58; // CHF/m²
const FLOORING_REPLACE_RATE = 145; // CHF/m²
const ELECTRICAL_PER_FIXTURE = 135; // CHF per new lighting circuit/fixture

export function renovationEstimate(analysis: RoomAnalysis, products: Product[]): RenovationEstimate {
  const area = analysis.dimensions.areaM2;
  const paint = Math.round(area * WALL_AREA_FACTOR * PAINT_RATE_PER_M2);

  const conditionPoor = analysis.flooring.condition.toLowerCase().includes("worn") ||
    analysis.flooring.condition.toLowerCase().includes("dated") ||
    analysis.flooring.condition.toLowerCase().includes("poor");
  const flooringRate = conditionPoor ? FLOORING_REPLACE_RATE : FLOORING_REFINISH_RATE;
  const flooring = Math.round(area * flooringRate);

  const lightingPieces = products.filter((p) => p.category === "lighting").length;
  const electrical = lightingPieces * ELECTRICAL_PER_FIXTURE;

  return { paint, flooring, electrical, total: paint + flooring + electrical };
}
