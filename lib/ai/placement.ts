import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";
import { MODEL, aiEnabled } from "./claude";
import { DEFAULT_CATEGORY_BOX, clampBox, isValidBox } from "../placementBoxes";
import type { DetectionBox, ProductCategory } from "../types";

/**
 * Room-aware placement for the compositing step ("Option B"). One Claude
 * vision call per room photo returns a placement box, a wall-orientation
 * estimate, AND an overall room-dimension estimate — all in the single
 * call, so the (cheap) analysis happens once per photo, switching products
 * afterwards costs nothing, and we don't fire a second vision call just to
 * get dimensions when the same photo already answers both questions.
 * Degrades exactly like the rest of lib/ai: no ANTHROPIC_API_KEY or a
 * failed call returns null and the caller falls back to the context-blind
 * defaults, with the UI honestly labeling which one it's showing.
 *
 * wallAngleDeg exists because the mask box alone only says *where* to
 * edit, not the wall's actual plane — a real test placed a sideboard
 * against a receding wall but rotated to face the camera instead of lying
 * flush against the wall, since a plain rectangle carries no rotation
 * information. Estimating the wall's angle from the photo's own vanishing
 * lines and feeding it explicitly into the compositing prompt (see
 * lib/ai/composite.ts) gives GPT-Image the geometric context a bare box
 * can't.
 *
 * roomDimensions exists so the UI can warn when a product's real size
 * (lib/suppliers/data — dimensionsCm, when the feed provides it) won't
 * plausibly fit the wall it's being placed against — see
 * estimateFitAgainstWall in components/CompositePreview.tsx.
 */

const CATEGORIES: ProductCategory[] = [
  "sofa", "chair", "table", "lighting", "rug", "art", "plant", "storage", "decor", "textile",
];

// A single reused item schema inside an array, not 10 literal duplicate
// object schemas (one per category name) — the previous shape. Confirmed
// real failure: Anthropic's structured-output compiler rejected that
// version outright ("The compiled grammar is too large... reduce the
// number of strict tools") on every single call in a real session, since
// each of the 10 required category properties was its own full copy of
// the same object schema rather than one schema reused per array element.
const placementItemSchema = {
  type: "object",
  additionalProperties: false,
  required: ["category", "x", "y", "w", "h", "wallAngleDeg", "spanM"],
  properties: {
    category: { type: "string", enum: CATEGORIES },
    x: { type: "number" },
    y: { type: "number" },
    w: { type: "number" },
    h: { type: "number" },
    wallAngleDeg: { type: "number" },
    spanM: { type: "number" },
  },
} as const;

const roomDimensionsSchema = {
  type: "object",
  additionalProperties: false,
  required: ["widthM", "depthM", "heightM"],
  properties: {
    widthM: { type: "number" },
    depthM: { type: "number" },
    heightM: { type: "number" },
  },
} as const;

const PLACEMENT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["items", "roomDimensions"],
  properties: {
    items: {
      type: "array",
      items: placementItemSchema,
      minItems: CATEGORIES.length,
      maxItems: CATEGORIES.length,
    },
    roomDimensions: roomDimensionsSchema,
  },
} as const;

const PLACEMENT_SYSTEM = `You are the placement engine of Vistroom, an AI interior design platform. Given one photograph of a real room, you decide where each kind of furniture would genuinely be placed by an interior designer working with THIS room's actual geometry.

Return one item per category (${CATEGORIES.join(", ")} — all ${CATEGORIES.length}, each exactly once) in the "items" array. For every category, return a bounding box (x, y, w, h — relative to the image, 0–1, origin top-left) marking where that item should sit if added to the room, AND a wallAngleDeg estimate for the surface it rests against:

- Read the room's real structure first: where the floor meets the walls, where windows/doors/radiators/outlets are, what furniture already exists, and how perspective scales objects with depth.
- sofa/storage/chair: flush against a visible wall base or in a corner — never floating in open floor. The box's bottom edge sits on the floor at that wall's depth, and the box height shrinks with distance (perspective).
- table: on the floor in the seating zone; rug: flat on open floor, wider than tall, low in the frame; plant/lighting (floor lamps): in corners or beside anchor furniture, standing on the floor.
- art: on a clear stretch of wall at eye height, not overlapping windows or doors; decor: on an existing surface if one exists, otherwise a plausible one; textile: draped on existing seating if present.
- Never place anything overlapping windows, doors, or pass-through zones. If existing furniture occupies a category's natural spot, choose the next-best genuine position.
- Size each box realistically for the room's scale at that depth — a sofa against the far wall of a deep room is small in frame; the same sofa near the camera is large.

wallAngleDeg: estimate the angle (in degrees) of the wall or floor plane the item rests against, relative to the camera's image plane, using the room's actual vanishing lines. 0 = directly facing the camera (a wall square-on, no visible recession). Positive = the surface recedes away to the right (e.g. a wall on the right side of a corner shot, or a side wall in a corner-facing photo). Negative = recedes away to the left. For floor items with no single wall (rug, freestanding table), estimate the floor plane's own recession instead. Be as precise as you can from the vanishing lines actually visible in the photo — this rotates the product to sit flush against its real surface instead of facing the camera.

spanM: THE SCALE KEY — the real-world width, in metres, that your box's width covers at that box's own position and depth. Not the room's width, and not the size of any product: the physical distance along the floor or wall that the left edge of your box and the right edge of your box are actually separated by, in that part of the room. Example: if a box sits against the back wall and spans the width of a typical three-seat sofa there, spanM ≈ 2.1. If a small box sits on a nearby side table, spanM might be 0.4. Because perspective shrinks distant objects, the SAME real width covers fewer image pixels further from the camera — so two boxes of identical pixel width at different depths must have different spanM values. Measure it from the same architectural cues you use for roomDimensions (door widths ~0.8m, door heights ~2.03m, floorboard/tile widths, existing furniture of known size). This is the single number the app uses to resize a real product to its true physical size in the photo, so a careless value visibly breaks the render — take it seriously, and be consistent with the perspective you described in the box itself.

roomDimensions: estimate the room's real-world width, depth and height in meters, the same way a surveyor would from a single photo — use architectural cues (door heights ~2.03m, ceiling lines, floorboard/tile widths, known furniture scale, window proportions). This powers a size-fit check against real product dimensions, so err toward a plausible, conservative estimate over a wild guess.

If a FLOOR PLAN image is supplied alongside the photograph, treat it as the authoritative source for roomDimensions and as a strong cross-check for every spanM: read its printed measurements and/or scale bar directly rather than estimating those numbers from the photograph. A drawn plan states the room's real geometry; a photograph only implies it. Use the photograph for what the plan cannot show — where things actually are in frame, perspective, wall angles, and existing furniture.`;

/** Long edge the photo is downscaled to before the vision call — plenty for layout, keeps tokens cheap. */
const ANALYSIS_MAX_EDGE = 768;

export interface PlacementSuggestion {
  box: DetectionBox;
  /** See PLACEMENT_SYSTEM's wallAngleDeg description. 0 for the context-blind defaults (no geometry to estimate from). */
  wallAngleDeg: number;
  /**
   * Real-world width in metres that this box's width spans at its own
   * depth — the conversion factor between image space and world space, so
   * a product's real dimensionsCm can be turned into a correctly-sized box
   * (lib/placementBoxes.ts's scaleBoxToRealWidth). Null for the
   * context-blind defaults and whenever the model's value came back
   * missing or implausible: callers then keep the suggested box as-is
   * rather than rescaling against a number they can't trust.
   */
  spanM: number | null;
}

export type PlacementMap = Record<ProductCategory, PlacementSuggestion>;

export interface RoomDimensionsEstimate {
  widthM: number;
  depthM: number;
  heightM: number;
}

export interface PlacementResult {
  placements: PlacementMap;
  /** Null when Claude's dimension estimate came back malformed — placements are still usable without it. */
  roomDimensions: RoomDimensionsEstimate | null;
}

function isValidPlacementItem(value: unknown): value is DetectionBox & { wallAngleDeg: number; category: unknown } {
  return isValidBox(value) && typeof (value as { wallAngleDeg?: unknown }).wallAngleDeg === "number";
}

/**
 * Rejects an unusable spanM rather than rescaling against it. The bounds
 * are deliberately wide — anything a real interior could plausibly need —
 * so this only catches genuine nonsense (0, negative, a stray millimetre
 * value, a hallucinated room-sized number for a coaster).
 */
const MIN_PLAUSIBLE_SPAN_M = 0.05;
const MAX_PLAUSIBLE_SPAN_M = 20;

function readSpanM(value: unknown): number | null {
  const span = (value as { spanM?: unknown } | null)?.spanM;
  if (typeof span !== "number" || !Number.isFinite(span)) return null;
  if (span < MIN_PLAUSIBLE_SPAN_M || span > MAX_PLAUSIBLE_SPAN_M) return null;
  return span;
}

function isValidRoomDimensions(value: unknown): value is RoomDimensionsEstimate {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return ["widthM", "depthM", "heightM"].every((k) => typeof v[k] === "number" && Number.isFinite(v[k] as number) && (v[k] as number) > 0);
}

/**
 * The actual vision call. Throws on any failure — callers decide whether to
 * swallow it into a graceful fallback (suggestPlacements) or surface the
 * reason to the user (suggestPlacementsStrict).
 */
async function runPlacement(roomPhoto: Buffer, floorplanPhoto?: Buffer | null): Promise<PlacementResult> {
  const toJpeg = (buf: Buffer) =>
    sharp(buf)
      .rotate() // respect EXIF orientation so coordinates match what the user sees
      .resize(ANALYSIS_MAX_EDGE, ANALYSIS_MAX_EDGE, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();

  const [jpeg, floorplanJpeg] = await Promise.all([
    toJpeg(roomPhoto),
    floorplanPhoto ? toJpeg(floorplanPhoto) : Promise.resolve(null),
  ]);

  const response = await new Anthropic().messages.create({
    model: MODEL,
    max_tokens: 4096,
    thinking: { type: "adaptive" },
    system: PLACEMENT_SYSTEM,
    output_config: {
      format: {
        type: "json_schema",
        schema: PLACEMENT_SCHEMA as unknown as Record<string, unknown>,
      },
    },
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "Room photograph:" },
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: jpeg.toString("base64") } },
          ...(floorplanJpeg
            ? ([
                {
                  type: "text",
                  text: "Floor plan of this same room — authoritative for real measurements; read its figures/scale rather than estimating them from the photo:",
                },
                { type: "image", source: { type: "base64", media_type: "image/jpeg", data: floorplanJpeg.toString("base64") } },
              ] as const)
            : []),
          {
            type: "text",
            text: "Return the placement box, wallAngleDeg and spanM for every category (one item each), plus the room's estimated dimensions.",
          },
        ],
      },
    ],
  }, {
    // See lib/ai/webProductSearch.ts for why: the SDK default (10 min timeout
    // x up to 3 attempts) turns one stuck call into up to 30 minutes. This is
    // a single-turn vision call — normally seconds, rarely more than a
    // minute — so fail fast instead of blocking the whole generate request.
    // maxRetries: 0 — the SDK retries a timeout like any other connection
    // error, so maxRetries: 1 would silently double this to 180s.
    timeout: 90_000,
    maxRetries: 0,
  });

  if (response.stop_reason === "refusal") throw new Error("Placement analysis was refused for this image.");
  const text = response.content.find((b) => b.type === "text")?.text;
  if (!text) throw new Error("Placement analysis returned no result.");

  const parsed = JSON.parse(text) as Record<string, unknown>;
  const itemsByCategory = new Map<string, unknown>();
  if (Array.isArray(parsed.items)) {
    for (const item of parsed.items) {
      const category = (item as { category?: unknown } | null)?.category;
      if (typeof category === "string") itemsByCategory.set(category, item);
    }
  }

  const placements = {} as PlacementMap;
  for (const category of CATEGORIES) {
    const item = itemsByCategory.get(category);
    // A malformed or missing single category shouldn't sink the other nine.
    placements[category] = isValidPlacementItem(item)
      ? { box: clampBox(item), wallAngleDeg: item.wallAngleDeg, spanM: readSpanM(item) }
      : { box: DEFAULT_CATEGORY_BOX[category], wallAngleDeg: 0, spanM: null };
  }

  return {
    placements,
    roomDimensions: isValidRoomDimensions(parsed.roomDimensions) ? parsed.roomDimensions : null,
  };
}

/**
 * Strict variant for paid curator tools (Looks Studio) that must not silently
 * degrade to context-blind default boxes: throws the underlying error so the
 * caller can show WHY (bad key, no credits, overloaded) instead of "try
 * again". Use suggestPlacements for the graceful-degradation paths.
 */
export async function suggestPlacementsStrict(roomPhoto: Buffer, floorplanPhoto?: Buffer | null): Promise<PlacementResult> {
  if (!aiEnabled()) throw new Error("ANTHROPIC_API_KEY not configured on the server.");
  return runPlacement(roomPhoto, floorplanPhoto);
}

export async function suggestPlacements(roomPhoto: Buffer, floorplanPhoto?: Buffer | null): Promise<PlacementResult | null> {
  if (!aiEnabled()) return null;
  try {
    return await runPlacement(roomPhoto, floorplanPhoto);
  } catch (err) {
    console.error("[vistroom] placement analysis failed, falling back to defaults:", err);
    return null;
  }
}
