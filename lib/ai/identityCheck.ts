import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";
import { MODEL, aiEnabled } from "./claude";
import type { DetectionBox } from "../types";

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

const IDENTITY_SYSTEM = `You are a quality-control reviewer for Maison, an AI interior design platform. An automated tool just tried to add ONE specific product into a customer's room photo via an AI image edit. You are shown two images: (1) the real product photo the customer picked from the catalog, and (2) the FULL room photo after the edit.

Your only job: look across the whole room photo and decide whether the intended product now genuinely appears somewhere in it — same category, same rough shape/proportions, same dominant color and material as the reference photo. Image-editing models occasionally substitute a completely different, wrong object (e.g. a console table where a sofa should be), or place the result somewhere other than where it was supposed to go — so check the whole frame, not just one area. Minor differences from lighting, camera angle, or scale are normal and should still pass. Only fail when you cannot find a plausible match for the reference product anywhere in the room.

Return pass=true/false and one short, plain, customer-friendly sentence explaining your reasoning (shown as a warning banner only when pass=false).`;

/** Long edge the rendered photo is downscaled to before this review call — plenty to judge object identity, keeps tokens cheap. */
const REVIEW_MAX_EDGE = 900;

async function toJpegBase64(buffer: Buffer, maxEdge?: number): Promise<string> {
  let pipeline = sharp(buffer).rotate();
  if (maxEdge) pipeline = pipeline.resize(maxEdge, maxEdge, { fit: "inside", withoutEnlargement: true });
  const jpeg = await pipeline.jpeg({ quality: 85 }).toBuffer();
  return jpeg.toString("base64");
}

function describeRoughLocation(box: DetectionBox): string {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const h = cx < 0.4 ? "left" : cx > 0.6 ? "right" : "center";
  const v = cy < 0.4 ? "upper" : cy > 0.6 ? "lower" : "middle";
  return `${v} ${h}`;
}

export async function checkRenderedProductIdentity(
  productPhoto: Buffer,
  renderedImage: Buffer,
  /** Where the edit was intended to place it — a soft hint for Claude's search, not a crop boundary. */
  intendedBox: DetectionBox,
): Promise<IdentityCheckResult | null> {
  if (!aiEnabled()) return null;
  try {
    const [productJpeg, roomJpeg] = await Promise.all([
      toJpegBase64(productPhoto),
      toJpegBase64(renderedImage, REVIEW_MAX_EDGE),
    ]);

    const response = await new Anthropic().messages.create({
      model: MODEL,
      max_tokens: 2048,
      thinking: { type: "adaptive" },
      system: IDENTITY_SYSTEM,
      output_config: {
        format: { type: "json_schema", schema: IDENTITY_SCHEMA as unknown as Record<string, unknown> },
      },
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Product photo (what the customer picked):" },
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: productJpeg } },
            { type: "text", text: "Full room photo after the edit:" },
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: roomJpeg } },
            {
              type: "text",
              text: `It was intended to be placed roughly in the ${describeRoughLocation(intendedBox)} of the frame, but check the whole photo regardless.`,
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
    return { pass: parsed.pass, note: parsed.note };
  } catch (err) {
    console.error("[maison] identity check failed, skipping:", err);
    return null;
  }
}
