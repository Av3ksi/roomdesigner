import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";
import { MODEL, aiEnabled } from "./claude";
import { DEFAULT_CATEGORY_BOX, clampBox, isValidBox } from "../placementBoxes";
import type { DetectionBox, ProductCategory } from "../types";

/**
 * Room-aware placement for the compositing step ("Option B"). One Claude
 * vision call per room photo returns a placement box for every product
 * category at once — so the (cheap) analysis happens once per photo, and
 * switching products afterwards costs nothing. Degrades exactly like the
 * rest of lib/ai: no ANTHROPIC_API_KEY or a failed call returns null and
 * the caller falls back to the context-blind defaults, with the UI
 * honestly labeling which one it's showing.
 */

const CATEGORIES: ProductCategory[] = [
  "sofa", "chair", "table", "lighting", "rug", "art", "plant", "storage", "decor", "textile",
];

const boxSchema = {
  type: "object",
  additionalProperties: false,
  required: ["x", "y", "w", "h"],
  properties: {
    x: { type: "number" },
    y: { type: "number" },
    w: { type: "number" },
    h: { type: "number" },
  },
} as const;

const PLACEMENT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: CATEGORIES,
  properties: Object.fromEntries(CATEGORIES.map((c) => [c, boxSchema])),
} as const;

const PLACEMENT_SYSTEM = `You are the placement engine of Maison, an AI interior design platform. Given one photograph of a real room, you decide where each kind of furniture would genuinely be placed by an interior designer working with THIS room's actual geometry.

For every category, return a bounding box in coordinates relative to the image (0–1, origin top-left) marking where that item should sit if added to the room:

- Read the room's real structure first: where the floor meets the walls, where windows/doors/radiators/outlets are, what furniture already exists, and how perspective scales objects with depth.
- sofa/storage/chair: flush against a visible wall base or in a corner — never floating in open floor. The box's bottom edge sits on the floor at that wall's depth, and the box height shrinks with distance (perspective).
- table: on the floor in the seating zone; rug: flat on open floor, wider than tall, low in the frame; plant/lighting (floor lamps): in corners or beside anchor furniture, standing on the floor.
- art: on a clear stretch of wall at eye height, not overlapping windows or doors; decor: on an existing surface if one exists, otherwise a plausible one; textile: draped on existing seating if present.
- Never place anything overlapping windows, doors, or pass-through zones. If existing furniture occupies a category's natural spot, choose the next-best genuine position.
- Size each box realistically for the room's scale at that depth — a sofa against the far wall of a deep room is small in frame; the same sofa near the camera is large.`;

/** Long edge the photo is downscaled to before the vision call — plenty for layout, keeps tokens cheap. */
const ANALYSIS_MAX_EDGE = 768;

export type PlacementMap = Record<ProductCategory, DetectionBox>;

export async function suggestPlacements(roomPhoto: Buffer): Promise<PlacementMap | null> {
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
            { type: "text", text: "Return the placement box for every category." },
          ],
        },
      ],
    });

    if (response.stop_reason === "refusal") return null;
    const text = response.content.find((b) => b.type === "text")?.text;
    if (!text) return null;

    const parsed = JSON.parse(text) as Record<string, unknown>;
    const result = {} as PlacementMap;
    for (const category of CATEGORIES) {
      const box = parsed[category];
      // A malformed single category shouldn't sink the other nine.
      result[category] = isValidBox(box) ? clampBox(box) : DEFAULT_CATEGORY_BOX[category];
    }
    return result;
  } catch (err) {
    console.error("[maison] Claude placement analysis failed, falling back to defaults:", err);
    return null;
  }
}
