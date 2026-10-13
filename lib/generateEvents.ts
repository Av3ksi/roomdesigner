/**
 * The wire format for /api/finished-rooms/generate, which streams progress
 * instead of returning once at the end.
 *
 * Shared by the route and the client so the two can't drift — a mismatch
 * here shows up as a progress bar that silently never moves, which is worse
 * than the spinner it replaced.
 */
import type { DetectionBox } from "./types";

export interface GenerateExternalItem {
  name: string;
  url: string;
  retailer: string;
  priceText: string | null;
  box: DetectionBox | null;
}

export interface GenerateCheck {
  productId: string;
  name: string;
  pass: boolean;
  note: string | null;
}

export interface GenerateResultPayload {
  imageBase64: string;
  totalPrice: number;
  styleTags: string[];
  productIds: string[];
  itemBoxes: Record<string, DetectionBox>;
  checks: GenerateCheck[];
  autoMatched: { productId: string; name: string; price: number }[];
  externals: GenerateExternalItem[];
  /** Real detected objects we deliberately didn't source — still pinned, just not shoppable. */
  unavailable: { box: DetectionBox; description: string }[];
}

export type GenerateEvent =
  | {
      type: "step";
      /** Human-readable, shown directly to the user. */
      label: string;
      /** Fraction complete BEFORE this step runs, 0-1. */
      progress: number;
      /** Typical duration, so the client can ease the bar through a long step. */
      expectedMs: number;
      /** How much of the whole bar this step covers, 0-1. The easing must not exceed it. */
      spanFraction: number;
    }
  | { type: "result"; result: GenerateResultPayload }
  | { type: "error"; error: string };

/**
 * Per-step weights and expected durations, taken from real logged runs
 * rather than guessed — see the "[vistroom] timing:" lines a generate
 * prints. Weighted because the composite alone is roughly three quarters
 * of the wall clock: a bar advanced by step COUNT would jump to 1/7 and
 * then sit motionless for over a minute, which users read as a hang.
 *
 * Keys must match the labels passed to timed() in the route.
 */
export const STEP_PLAN: Record<string, { human: string; weight: number; expectedMs: number }> = {
  "placement analysis": { human: "Reading the room's layout and proportions", weight: 8, expectedMs: 9000 },
  "product photo fetch + reshape (parallel)": { human: "Fetching product photos", weight: 4, expectedMs: 4000 },
  extractRequestedExtras: { human: "Working out what else the look needs", weight: 3, expectedMs: 3000 },
  "composeSceneWithProducts (descriptions + OpenAI render)": {
    human: "Rendering your room — this is the long one",
    weight: 62,
    expectedMs: 85000,
  },
  detectSceneItems: { human: "Locating each item for its buy-pin", weight: 12, expectedMs: 12000 },
};

/** Steps whose labels are built at runtime (they include a count) are matched by prefix. */
export function stepPlanFor(label: string): { human: string; weight: number; expectedMs: number } {
  if (STEP_PLAN[label]) return STEP_PLAN[label];
  if (label.startsWith("pre-source requested extras")) {
    return { human: "Sourcing the extra pieces", weight: 6, expectedMs: 8000 };
  }
  if (label.startsWith("web search")) {
    return { human: "Finding the staged extras online", weight: 5, expectedMs: 6000 };
  }
  return { human: label, weight: 2, expectedMs: 4000 };
}

export const TOTAL_WEIGHT = 100;
