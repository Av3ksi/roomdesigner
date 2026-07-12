import type { RoomAnalysis } from "./types";

/**
 * Deterministic sanity-check on the estimated dimensions — catches the
 * cases where a single photo genuinely can't yield a reliable estimate
 * (extreme angles, no visible floor-to-ceiling reference) and tells the
 * user how to fix it, rather than silently presenting an implausible number.
 */
export interface MeasurementFlag {
  message: string;
  suggestion: string;
}

export function validateMeasurements(analysis: RoomAnalysis): MeasurementFlag[] {
  const flags: MeasurementFlag[] = [];
  const { widthM, depthM, heightM, areaM2 } = analysis.dimensions;

  if (heightM < 2.1 || heightM > 4.2) {
    flags.push({
      message: `Estimated ceiling height (${heightM} m) is outside the typical residential range.`,
      suggestion: "Retake the photo including a full wall from floor to ceiling for a sharper estimate.",
    });
  }
  if (areaM2 < 5 || areaM2 > 100) {
    flags.push({
      message: `Estimated floor area (${areaM2} m²) looks unusually ${areaM2 < 5 ? "small" : "large"} for this room type.`,
      suggestion: "A floor plan photo — even a rough sketch — sharpens the area estimate significantly.",
    });
  }
  const ratio = Math.max(widthM, depthM) / Math.max(0.1, Math.min(widthM, depthM));
  if (ratio > 4) {
    flags.push({
      message: "The room's width and depth are unusually mismatched — likely a wide-angle or corner-only view.",
      suggestion: "Add a second photo from the opposite corner so Maison can cross-reference the shape.",
    });
  }
  return flags;
}
