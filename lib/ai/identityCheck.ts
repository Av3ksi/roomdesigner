import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";
import { MODEL, aiEnabled } from "./claude";
import { describeRoughLocation } from "../placementBoxes";
import type { DetectionBox, ProductCategory } from "../types";

/**
 * Phase 2's "Product identity QA" gate (docs/BLUEPRINT.md's honest critique
 * of the prototype called this out as missing). After a masked composite
 * render, ask Claude vision whether the intended product actually shows up
 * somewhere in the result — image-editing models occasionally substitute a
 * different object entirely (confirmed in real testing: a rendered
 * console/shelf where a sofa should have been).
 *
 * v1 of this check cropped the render to the placement box before judging
 * it — but that crop is only as trustworthy as the box itself, and the
 * exact bug this exists to catch (the model painting something other than
 * asked, possibly not even where asked) can also throw the box off. A crop
 * built from an untrustworthy box can miss the very thing it's supposed to
 * review, silently passing a bad render. Judging the FULL rendered image
 * instead removes that dependency — Claude looks at the whole room, not a
 * region we're already unsure is correct.
 */

export interface IdentityCheckResult {
  pass: boolean;
  note: string;
  /**
   * Objects the edit invented — present in the render but in neither the
   * original photograph nor the product reference. Each one is an item a
   * customer can see but cannot buy or click, which breaks the core promise
   * that a Vistroom render is entirely shoppable. Empty on a clean render;
   * absent entirely on the removal check, which has no product to compare.
   */
  strayObjects?: string[];
}

const IDENTITY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["pass", "note"],
  properties: {
    pass: { type: "boolean" },
    note: { type: "string" },
  },
} as const;

/**
 * The add-flow schema: the identity verdict PLUS a list of invented
 * objects. Deliberately answered by the SAME vision call rather than a
 * second one — the reviewer is already looking at the before and after
 * images, so asking it one more question costs nothing, where a separate
 * stray-object pass would double the per-render QA cost.
 */
const INSERTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["pass", "note", "strayObjects"],
  properties: {
    pass: { type: "boolean" },
    note: { type: "string" },
    strayObjects: { type: "array", items: { type: "string" } },
  },
} as const;

const IDENTITY_SYSTEM = `You are a quality-control reviewer for Vistroom, an AI interior design platform where EVERY object visible in a render must be a real product the customer can click and buy. An automated tool just tried to add ONE specific product into a customer's room photo via an AI image edit. You are shown three images: (1) the room BEFORE the edit, (2) the real product photo the customer picked from the catalogue, and (3) the room AFTER the edit.

You have two jobs.

FIRST — identity. Look across the whole after image and decide whether the intended product genuinely appears in it: same category, same rough shape and proportions, same dominant colour and material as the reference photo. Image-editing models sometimes substitute a completely different object (a console table where a sofa should be), or place the result somewhere other than intended — so check the whole frame. Differences in lighting, angle or scale are normal and should still pass. Fail only if you cannot find a plausible match for the reference product anywhere.

SECOND — stray objects. Compare the before and after images carefully and list any object that appears in the AFTER image but was in NEITHER the before image NOR the product reference photo. Image models habitually "improve" an interior by adding a rug, a plant, cushions, a vase, books, or wall art that nobody asked for. Every one of those is unpurchasable and makes the render unusable for us, so this list matters as much as the identity verdict. Name each invented object in two or three plain words ("a potted plant", "a round rug", "framed wall art"). Ignore pure lighting, shadow, colour or reflection changes — those are not objects. Ignore parts of the intended product itself, such as its own cushions. If nothing was invented, return an empty list, which is the expected and desired outcome.

Return pass=true/false for the identity verdict, one short plain customer-friendly sentence as the note (shown as a warning banner only when pass=false), and strayObjects as the list of invented items.`;

/** Long edge the rendered photo is downscaled to before this review call — plenty to judge object identity, keeps tokens cheap. */
const REVIEW_MAX_EDGE = 900;

async function toJpegBase64(buffer: Buffer, maxEdge?: number): Promise<string> {
  let pipeline = sharp(buffer).rotate();
  if (maxEdge) pipeline = pipeline.resize(maxEdge, maxEdge, { fit: "inside", withoutEnlargement: true });
  const jpeg = await pipeline.jpeg({ quality: 85 }).toBuffer();
  return jpeg.toString("base64");
}

export async function checkRenderedProductIdentity(
  productPhoto: Buffer,
  renderedImage: Buffer,
  /** Where the edit was intended to place it — a soft hint for Claude's search, not a crop boundary. */
  intendedBox: DetectionBox,
  /**
   * The room BEFORE the edit. Required to detect invented objects at all:
   * "is this rug new?" is unanswerable from the after image alone, since a
   * rug the customer already owned looks identical to one the model made
   * up. Optional so existing callers keep working — without it the identity
   * verdict still runs and strayObjects is simply not reported.
   */
  beforeImage?: Buffer,
): Promise<IdentityCheckResult | null> {
  if (!aiEnabled()) return null;
  try {
    const [productJpeg, roomJpeg, beforeJpeg] = await Promise.all([
      toJpegBase64(productPhoto),
      toJpegBase64(renderedImage, REVIEW_MAX_EDGE),
      beforeImage ? toJpegBase64(beforeImage, REVIEW_MAX_EDGE) : Promise.resolve(null),
    ]);

    const response = await new Anthropic().messages.create({
      model: MODEL,
      max_tokens: 2048,
      thinking: { type: "adaptive" },
      system: IDENTITY_SYSTEM,
      output_config: {
        format: {
          type: "json_schema",
          schema: (beforeJpeg ? INSERTION_SCHEMA : IDENTITY_SCHEMA) as unknown as Record<string, unknown>,
        },
      },
      messages: [
        {
          role: "user",
          content: [
            ...(beforeJpeg
              ? ([
                  { type: "text", text: "Room BEFORE the edit:" },
                  { type: "image", source: { type: "base64", media_type: "image/jpeg", data: beforeJpeg } },
                ] as const)
              : []),
            { type: "text", text: "Product photo (what the customer picked):" },
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: productJpeg } },
            { type: "text", text: "Room AFTER the edit:" },
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: roomJpeg } },
            {
              type: "text",
              text: `The product was intended to be placed roughly in the ${describeRoughLocation(intendedBox)} of the frame, but check the whole photo regardless.`,
            },
          ],
        },
      ],
    });

    if (response.stop_reason === "refusal") return null;
    const text = response.content.find((b) => b.type === "text")?.text;
    if (!text) return null;
    const parsed = JSON.parse(text) as Record<string, unknown>;
    if (typeof parsed.pass !== "boolean" || typeof parsed.note !== "string") return null;
    const strayObjects = Array.isArray(parsed.strayObjects)
      ? parsed.strayObjects.filter((o): o is string => typeof o === "string")
      : undefined;
    if (strayObjects?.length) {
      // Logged loudly: a non-empty list means the catalogue-only constraint
      // in ./prompts didn't hold for this render, which is a prompt problem
      // to fix, not just a per-customer inconvenience.
      console.warn("[vistroom] render contained non-catalogue objects:", strayObjects);
    }
    return { pass: parsed.pass, note: parsed.note, strayObjects };
  } catch (err) {
    console.error("[vistroom] identity check failed, skipping:", err);
    return null;
  }
}

const REMOVAL_SYSTEM = `You are a quality-control reviewer for Vistroom, an AI interior design platform. An automated tool just tried to ERASE one specific existing object from a customer's room photo via an AI image edit. You are shown two images: (1) the room photo BEFORE the edit, and (2) the room photo AFTER the edit, which should have that object gone and its space filled in naturally.

Your only job: compare the two photos and decide whether the target object is now actually GONE from the after photo — not still visible anywhere, even if slightly repositioned or partially obscured by something else. A successful removal fills in the vacated space naturally (matching the surrounding floor, wall, and lighting) — that's expected and should still pass. Only fail when the same object (or something clearly recognizable as it) is still visibly present in the after photo, meaning the edit didn't actually do what was asked.

Return pass=true/false and one short, plain, customer-friendly sentence explaining your reasoning (shown as a warning banner only when pass=false).`;

/**
 * The removal counterpart to checkRenderedProductIdentity — that one checks
 * an ADD actually happened; this checks a REMOVAL actually happened. Real,
 * confirmed gap: performRemoval had no verification step at all, so a
 * render where the box-based inpainting missed the target (wrong box, or
 * the model just not following the erase instruction) got saved and
 * credited exactly like a clean removal, with nothing telling the customer
 * it didn't work. Mirrors the add-flow check's shape (before/after
 * comparison via Claude vision, warn-don't-block on failure — same
 * established pattern, not a new policy) rather than inventing a different
 * mechanism for the other half of the same problem.
 */
export async function checkRemovalSuccess(
  beforeImage: Buffer,
  afterImage: Buffer,
  category: ProductCategory,
  description?: string,
): Promise<IdentityCheckResult | null> {
  if (!aiEnabled()) return null;
  try {
    const [beforeJpeg, afterJpeg] = await Promise.all([
      toJpegBase64(beforeImage, REVIEW_MAX_EDGE),
      toJpegBase64(afterImage, REVIEW_MAX_EDGE),
    ]);

    const target = description ? `a ${category} (${description})` : `a ${category}`;

    const response = await new Anthropic().messages.create({
      model: MODEL,
      max_tokens: 2048,
      thinking: { type: "adaptive" },
      system: REMOVAL_SYSTEM,
      output_config: {
        format: { type: "json_schema", schema: IDENTITY_SCHEMA as unknown as Record<string, unknown> },
      },
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: `Room photo BEFORE the edit — the target to remove is ${target}:` },
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: beforeJpeg } },
            { type: "text", text: "Room photo AFTER the edit:" },
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: afterJpeg } },
          ],
        },
      ],
    });

    if (response.stop_reason === "refusal") return null;
    const text = response.content.find((b) => b.type === "text")?.text;
    if (!text) return null;
    const parsed = JSON.parse(text) as Record<string, unknown>;
    if (typeof parsed.pass !== "boolean" || typeof parsed.note !== "string") return null;
    return { pass: parsed.pass, note: parsed.note };
  } catch (err) {
    console.error("[vistroom] removal check failed, skipping:", err);
    return null;
  }
}
