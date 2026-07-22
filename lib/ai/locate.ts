import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";
import { MODEL, aiEnabled } from "./claude";
import { clampBox, isValidBox } from "../placementBoxes";
import type { DetectionBox, ProductCategory } from "../types";

/**
 * Finds an object already physically present in a room photo — the
 * precondition for removing it (lib/ai/composite.ts's removeExistingObject).
 * Deliberately a Claude vision bounding-box estimate, the same technique
 * lib/ai/placement.ts already uses to suggest where a NEW product should
 * go, rather than pixel-precise segmentation via a dedicated model (SAM 2 /
 * Grounding DINO, which would need a second provider like Replicate).
 *
 * The tradeoff, explicitly: a rectangular box mask erases/repaints a bit of
 * surrounding wall or floor too, not just the object's exact silhouette —
 * acceptable for a v1, and it keeps removal on the same two providers
 * (Claude + OpenAI) everything else in this app already needs. If removal
 * quality on real photos turns out to need pixel-precise masking, revisit
 * real segmentation then — a working Replicate/SAM2 version of this exists
 * in git history (commit 59d9d2a) and can be restored.
 */

const CATEGORY_LABELS: Record<ProductCategory, string> = {
  sofa: "a sofa, couch, or sectional",
  chair: "a chair or armchair",
  table: "a table or desk",
  lighting: "a lamp, pendant, or other light fixture",
  rug: "a rug or carpet",
  art: "wall art, a painting, poster, or mirror",
  plant: "a potted plant",
  storage: "a cabinet, shelf, sideboard, wardrobe, or bookcase",
  decor: "a vase or other decor object",
  textile: "a cushion, curtain, or throw blanket",
};

const LOCATE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["found", "box"],
  properties: {
    found: { type: "boolean" },
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
} as const;

const LOCATE_MAX_EDGE = 768;

export interface LocateResult {
  box: DetectionBox;
}

export async function locateExistingObject(roomPhoto: Buffer, category: ProductCategory): Promise<LocateResult | null> {
  if (!aiEnabled()) return null;
  try {
    const jpeg = await sharp(roomPhoto)
      .rotate()
      .resize(LOCATE_MAX_EDGE, LOCATE_MAX_EDGE, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();

    const response = await new Anthropic().messages.create({
      model: MODEL,
      max_tokens: 1024,
      thinking: { type: "adaptive" },
      system:
        "You locate existing objects in room photographs for an interior design app. Given a photo and a category, " +
        "determine whether that kind of object is genuinely, physically present in the photo (not something that " +
        "could go there — something that's actually there right now). If it is, return its tight bounding box " +
        "(x, y, w, h — relative to the image, 0–1, origin top-left), covering the whole visible object. If multiple " +
        "match, pick the most prominent one. If none is present, set found=false.",
      output_config: {
        format: { type: "json_schema", schema: LOCATE_SCHEMA as unknown as Record<string, unknown> },
      },
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Room photograph:" },
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: jpeg.toString("base64") } },
            { type: "text", text: `Is ${CATEGORY_LABELS[category]} physically present in this photo? If so, its bounding box.` },
          ],
        },
      ],
    });

    if (response.stop_reason === "refusal") return null;
    const text = response.content.find((b) => b.type === "text")?.text;
    if (!text) return null;

    const parsed = JSON.parse(text) as Record<string, unknown>;
    if (parsed.found !== true || !isValidBox(parsed.box)) return null;
    return { box: clampBox(parsed.box) };
  } catch (err) {
    console.error("[maison] locate failed, existing-object removal unavailable this turn:", err);
    return null;
  }
}

/**
 * Locates a SPECIFIC product in a rendered scene by comparing the finished
 * image against the product's own reference photo — not just "any object of
 * this category". This is what stops a hotspot for one art piece (say, a
 * mirror tile) from landing on a different art piece the restyle staged in
 * (a poster): if that exact product isn't visibly present, it returns null
 * and the caller simply shows no hotspot rather than a wrong label.
 */
export async function locateProductInImage(
  renderedImage: Buffer,
  productPhoto: Buffer,
  category: ProductCategory,
): Promise<LocateResult | null> {
  if (!aiEnabled()) return null;
  try {
    const [renderJpeg, productJpeg] = await Promise.all([
      sharp(renderedImage).rotate().resize(LOCATE_MAX_EDGE, LOCATE_MAX_EDGE, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer(),
      sharp(productPhoto).rotate().resize(512, 512, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer(),
    ]);

    const response = await new Anthropic().messages.create({
      model: MODEL,
      max_tokens: 1024,
      thinking: { type: "adaptive" },
      system:
        `You locate a specific ${CATEGORY_LABELS[category]} in a rendered room image. You are given the reference ` +
        "product photo first, then the room render. Decide whether THAT SAME product (same shape, color, material) is " +
        "visibly present in the render. If it is, return found=true and its tight bounding box (x, y, w, h — relative " +
        "to the render, 0–1, origin top-left). If the render shows a different item of the same category but not this " +
        "exact product, or the product isn't visible at all, return found=false.",
      output_config: {
        format: { type: "json_schema", schema: LOCATE_SCHEMA as unknown as Record<string, unknown> },
      },
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Reference product photo:" },
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: productJpeg.toString("base64") } },
            { type: "text", text: "Room render — is this exact product present? If so, its bounding box." },
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: renderJpeg.toString("base64") } },
          ],
        },
      ],
    });

    if (response.stop_reason === "refusal") return null;
    const text = response.content.find((b) => b.type === "text")?.text;
    if (!text) return null;
    const parsed = JSON.parse(text) as Record<string, unknown>;
    if (parsed.found !== true || !isValidBox(parsed.box)) return null;
    return { box: clampBox(parsed.box) };
  } catch (err) {
    console.error("[maison] locateProductInImage failed:", err);
    return null;
  }
}

const CATEGORY_VALUES = [
  "sofa", "chair", "table", "lighting", "rug", "art", "plant", "storage", "decor", "textile",
] as const;

const DETECT_EXTRAS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["description", "webQuery", "category"],
        properties: {
          description: { type: "string" },
          webQuery: { type: "string" },
          category: { type: "string", enum: CATEGORY_VALUES as unknown as string[] },
        },
      },
    },
  },
} as const;

export interface UnaccountedItem {
  /** Short German phrase for matching OUR catalog (German titles), e.g. "dunkles Holzbett mit Kopfteil". */
  description: string;
  /** English phrase for a web product search when our catalog has no match, e.g. "dark wood bed frame with upholstered headboard". */
  webQuery: string;
  /** Best-guess Maison category, for locating the item's position in the render. */
  category: ProductCategory;
}

/**
 * Finds furniture/decor visible in a finished render that ISN'T one of the
 * explicitly chosen products — showroom-restyle mode stages in extra
 * pieces (a bed, a second lamp) for atmosphere, and by default those are
 * unlabeled and unpurchasable. This is the detection half of turning that
 * into a sale: describe what else is there, then a caller matches each
 * description against OUR OWN catalog (lib/productSearch.ts's
 * findBestCatalogMatch) — never an external retailer. If we don't
 * genuinely carry something close, it stays as atmosphere; we don't
 * invent a match or send customers elsewhere to buy it.
 */
export async function detectUnaccountedItems(roomPhoto: Buffer, alreadyIncluded: string[]): Promise<UnaccountedItem[]> {
  if (!aiEnabled()) return [];
  try {
    const jpeg = await sharp(roomPhoto)
      .rotate()
      .resize(LOCATE_MAX_EDGE, LOCATE_MAX_EDGE, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();

    const response = await new Anthropic().messages.create({
      model: MODEL,
      max_tokens: 1024,
      thinking: { type: "adaptive" },
      system:
        "You review a staged room photo for an interior design marketplace. Some furniture/decor in the photo are " +
        "already-catalogued products the customer can buy (listed by the caller); everything else may be additional " +
        "staging, or other real objects. List up to 6 OTHER distinct furniture or decor items visible that are NOT " +
        "already covered by the given list, and substantial enough to plausibly be a real, sellable product — skip " +
        "tiny incidental clutter (a single book, a glass, a laptop). For each item, return: `description` — a short " +
        "German phrase (2-5 words) naming its type, color and material, for matching a German product catalog; " +
        "`webQuery` — the same thing in English (2-6 words) as you would type into a shopping search; and `category` " +
        "— the single best-fitting category from the allowed list.",
      output_config: {
        format: { type: "json_schema", schema: DETECT_EXTRAS_SCHEMA as unknown as Record<string, unknown> },
      },
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: `Already-included products: ${alreadyIncluded.join(", ") || "(none)"}` },
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: jpeg.toString("base64") } },
            { type: "text", text: "List other distinct furniture/decor items visible, as described above." },
          ],
        },
      ],
    });

    if (response.stop_reason === "refusal") return [];
    const text = response.content.find((b) => b.type === "text")?.text;
    if (!text) return [];

    const parsed = JSON.parse(text) as { items?: unknown };
    if (!Array.isArray(parsed.items)) return [];
    return parsed.items
      .filter((i): i is UnaccountedItem => {
        const o = i as Record<string, unknown>;
        return (
          typeof o?.description === "string" &&
          typeof o?.webQuery === "string" &&
          typeof o?.category === "string" &&
          (CATEGORY_VALUES as readonly string[]).includes(o.category)
        );
      })
      .slice(0, 6);
  } catch (err) {
    console.error("[maison] detectUnaccountedItems failed, skipping auto-match:", err);
    return [];
  }
}
