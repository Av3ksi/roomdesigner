import type { RoomAnalysis } from "./types";

/** Small deterministic PRNG so demo analyses are stable per upload. */
export function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const ORIENTATIONS = ["North", "East", "South", "West"] as const;
const FLOORS = [
  { material: "Oak strip", tone: "Honey" },
  { material: "Laminate plank", tone: "Light sand" },
  { material: "Engineered walnut", tone: "Amber" },
  { material: "Polished concrete", tone: "Warm grey" },
] as const;

/**
 * Demo-engine analysis for uploaded photos when no ANTHROPIC_API_KEY is
 * configured. Values are plausible and deterministic per upload, and the
 * UI labels the result as simulated. Detections are intentionally empty —
 * we never draw bounding boxes we didn't actually compute.
 */
export function demoAnalysisForUpload(seedKey: string): RoomAnalysis {
  const rand = mulberry32(hashString(seedKey));
  const width = 3.8 + rand() * 2.6;
  const depth = 3.2 + rand() * 1.9;
  const height = 2.4 + rand() * 0.6;
  const orientation = ORIENTATIONS[Math.floor(rand() * ORIENTATIONS.length)];
  const floor = FLOORS[Math.floor(rand() * FLOORS.length)];
  const naturalScore = Math.round(45 + rand() * 45);
  const styles = ["scandinavian", "japandi", "modernluxury", "minimalist", "industrial", "organicmodern", "mediterranean", "darkluxury", "cozy", "classic"];
  const affinity = styles
    .map((styleId) => ({ styleId, score: Math.round(62 + rand() * 34) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

  return {
    engine: "demo",
    roomType: "Living space",
    confidence: 0.9,
    summary:
      "Simulated analysis (demo engine): a livable space with workable proportions and decent light. Connect an Anthropic API key and Maison's vision model will read your actual walls, windows, furniture and materials from the photo.",
    dimensions: {
      widthM: +width.toFixed(1),
      depthM: +depth.toFixed(1),
      heightM: +height.toFixed(1),
      areaM2: +(width * depth).toFixed(1),
    },
    walls: { count: 4, condition: "Estimated — good", finish: "Painted matte" },
    windows: { count: 1 + Math.floor(rand() * 2), orientation, naturalLight: naturalScore > 65 ? "Generous" : "Moderate" },
    doors: { count: 1, note: "Estimated single entry" },
    flooring: { material: floor.material, tone: floor.tone, condition: "Estimated — good" },
    lighting: {
      naturalScore,
      artificial: "Estimated mixed sources",
      colorTemperature: rand() > 0.5 ? "Warm 2700K" : "Neutral 3500K",
    },
    colorPalette: [
      { hex: "#D8D2C4", name: "Wall neutral" },
      { hex: "#9C8B72", name: "Mid warm" },
      { hex: "#5E564A", name: "Anchor dark" },
      { hex: "#C7B79B", name: "Floor tone" },
    ],
    materials: ["Painted plaster", floor.material, "Mixed upholstery"],
    furniture: [
      { item: "Primary seating", condition: "Estimated", verdict: "Review" },
      { item: "Occasional tables", condition: "Estimated", verdict: "Review" },
    ],
    detections: [],
    opportunities: [
      "Rebalance the layout around the strongest light source",
      "Introduce a layered lighting plan (ambient, task, accent)",
      "Anchor the seating zone with a properly sized rug",
      "Unify the palette to 3–4 deliberate tones",
    ],
    styleAffinity: affinity,
  };
}
