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

const placementItemSchema = {
  type: "object",
  additionalProperties: false,
  required: ["x", "y", "w", "h", "wallAngleDeg"],
  properties: {
    x: { type: "number" },
    y: { type: "number" },
    w: { type: "number" },
    h: { type: "number" },
    wallAngleDeg: { type: "number" },
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
  required: [...CATEGORIES, "roomDimensions"],
  properties: {
    ...Object.fromEntries(CATEGORIES.map((c) => [c, placementItemSchema])),
    roomDimensions: roomDimensionsSchema,
  },
} as const;

const PLACEMENT_SYSTEM = `You are the placement engine of Maison, an AI interior design platform. Given one photograph of a real room, you decide where each kind of furniture would genuinely be placed by an interior designer working with THIS room's actual geometry.

For every category, return a bounding box (x, y, w, h — relative to the image, 0–1, origin top-left) marking where that item should sit if added to the room, AND a wallAngleDeg estimate for the surface it rests against:

- Read the room's real structure first: where the floor meets the walls, where windows/doors/radiators/outlets are, what furniture already exists, and how perspective scales objects with depth.
- sofa/storage/chair: flush against a visible wall base or in a corner — never floating in open floor. The box's bottom edge sits on the floor at that wall's depth, and the box height shrinks with distance (perspective).
- table: on the floor in the seating zone; rug: flat on open floor, wider than tall, low in the frame; plant/lighting (floor lamps): in corners or beside anchor furniture, standing on the floor.
- art: on a clear stretch of wall at eye height, not overlapping windows or doors; decor: on an existing surface if one exists, otherwise a plausible one; textile: draped on existing seating if present.
- Never place anything overlapping windows, doors, or pass-through zones. If existing furniture occupies a category's natural spot, choose the next-best genuine position.
- Size each box realistically for the room's scale at that depth — a sofa against the far wall of a deep room is small in frame; the same sofa near the camera is large.

wallAngleDeg: estimate the angle (in degrees) of the wall or floor plane the item rests against, relative to the camera's image plane, using the room's actual vanishing lines. 0 = directly facing the camera (a wall square-on, no visible recession). Positive = the surface recedes away to the right (e.g. a wall on the right side of a corner shot, or a side wall in a corner-facing photo). Negative = recedes away to the left. For floor items with no single wall (rug, freestanding table), estimate the floor plane's own recession instead. Be as precise as you can from the vanishing lines actually visible in the photo — this rotates the product to sit flush against its real surface instead of facing the camera.

roomDimensions: estimate the room's real-world width, depth and height in meters, the same way a surveyor would from a single photo — use architectural cues (door heights ~2.03m, ceiling lines, floorboard/tile widths, known furniture scale, window proportions). This powers a size-fit check against real product dimensions, so err toward a plausible, conservative estimate over a wild guess.`;

/** Long edge the photo is downscaled to before the vision call — plenty for layout, keeps tokens cheap. */
const ANALYSIS_MAX_EDGE = 768;

export interface PlacementSuggestion {
  box: DetectionBox;
  /** See PLACEMENT_SYSTEM's wallAngleDeg description. 0 for the context-blind defaults (no geometry to estimate from). */
  wallAngleDeg: number;
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

function isValidPlacementItem(value: unknown): value is DetectionBox & { wallAngleDeg: number } {
  return isValidBox(value) && typeof (value as { wallAngleDeg?: unknown }).wallAngleDeg === "number";
}

function isValidRoomDimensions(value: unknown): value is RoomDimensionsEstimate {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return ["widthM", "depthM", "heightM"].every((k) => typeof v[k] === "number" && Number.isFinite(v[k] as number) && (v[k] as number) > 0);
}

export async function suggestPlacements(roomPhoto: Buffer): Promise<PlacementResult | null> {
  if (!aiEnabled()) return null;
  try {
    const jpeg = await sharp(roomPhoto)
      .rotate() // respect EXIF orientation so coordinates match what the user sees
      .resize(ANALYSIS_MAX_EDGE, ANALYSIS_MAX_EDGE, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();

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
            { type: "text", text: "Return the placement box and wallAngleDeg for every category, plus the room's estimated dimensions." },
          ],
        },
      ],
    });

    if (response.stop_reason === "refusal") return null;
    const text = response.content.find((b) => b.type === "text")?.text;
    if (!text) return null;

    const parsed = JSON.parse(text) as Record<string, unknown>;
    const placements = {} as PlacementMap;
    for (const category of CATEGORIES) {
      const item = parsed[category];
      // A malformed single category shouldn't sink the other nine.
      placements[category] = isValidPlacementItem(item)
        ? { box: clampBox(item), wallAngleDeg: item.wallAngleDeg }
        : { box: DEFAULT_CATEGORY_BOX[category], wallAngleDeg: 0 };
    }

    return {
      placements,
      roomDimensions: isValidRoomDimensions(parsed.roomDimensions) ? parsed.roomDimensions : null,
    };
  } catch (err) {
    console.error("[maison] Claude placement analysis failed, falling back to defaults:", err);
    return null;
  }
}
