import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";
import { MODEL as CLAUDE_MODEL, aiEnabled } from "./claude";
import { blendEditedRegion, buildMaskPng } from "./imageMasking";
import {
  ATMOSPHERE_DIRECTION,
  CAMERA_MATCH_DIRECTION,
  CATALOG_ONLY_SCENE_CONSTRAINT,
  LIGHTING_MATCH_DIRECTION,
  MASK_DISCIPLINE,
  MATERIAL_FIDELITY_DIRECTION,
  NO_PEOPLE_INSTRUCTION as NO_PEOPLE,
  buildProductInsertionPrompt,
  buildRemovalPrompt,
} from "./prompts";
import { postImageEditWithRetry } from "./openaiImageGen";
import { MODEL, compositingEnabled } from "./openaiConfig";
import {
  COMPOSITE_MAX_EDGE,
  DEFAULT_CATEGORY_BOX,
  clampBox,
  describeRoughLocation,
  padBoxForEdit,
  unionBox,
} from "../placementBoxes";
import type { Detection, DetectionBox, ProductCategory } from "../types";

/**
 * GPT-Image compositing step: takes a real room photo + a real product
 * photo and inserts the product into the room via a masked edit. Unlike
 * everything else in this app, this step costs real money per call and
 * requires OpenAI specifically — Claude (lib/ai/claude.ts) has no image
 * generation/editing capability, so this is a second, separate provider.
 *
 * Mask placement, in order of precedence:
 *   1. An explicit box passed by the caller — the "Option B" path, where
 *      placement was decided upstream (Claude vision suggestion via
 *      lib/ai/placement.ts, then user-adjusted in the UI) and this module
 *      just executes it.
 *   2. A real detection box from the room's analysis whose label matches
 *      the category (e.g. replacing an existing sofa uses its position).
 *   3. The context-blind per-category default (lib/placementBoxes.ts).
 *
 * KNOWN LIMITATION — no combined replace: this only paints the masked
 * region onto whatever `roomPhotoInput` already looks like — it doesn't
 * know or care whether something else is already sitting there. Confirmed
 * via real testing: asking to swap a placed sofa for a different one, by
 * proposing only the new item, produced two full sofas in one render
 * (the old one's pixels were never touched). There's no single "erase old
 * + paint new" primitive yet — a real swap needs an explicit
 * removeExistingObject call first. lib/ai/designer.ts's system prompt is
 * responsible for recognizing swap language and proposing both steps
 * rather than just this one. See docs/BLUEPRINT.md §9 item 9 for the full
 * writeup and the planned real fix (EditPlan's `{op: replace}`).
 */

// Defined in ./openaiConfig and re-exported here so the app's existing
// `from "./composite"` imports keep working — see that module for why the
// canonical definitions had to move out. Re-exported AND imported at the
// top of this file, since `export ... from` alone creates no local binding
// and MODEL is used by the form builders below.
export { compositingEnabled, MODEL };

/**
 * The mask only constrains *where editing is allowed*, not how the model
 * arranges the product within that region — a first real test placed a
 * sofa centered in open floor instead of pushed back against a wall, a
 * cheap prompt-level fix rather than a placement-engineering one.
 */
export const CATEGORY_PLACEMENT_HINT: Record<ProductCategory, string> = {
  sofa: "flush against the back wall, not floating in the middle of open floor",
  chair: "against a wall or in a corner, not in the middle of open floor",
  table: "resting on the floor in front of where a sofa or seating would be",
  lighting: "in a corner or beside furniture, standing on the floor",
  rug: "flat on the floor, centered in the main open area of the room",
  art: "centered on the wall at typical eye height",
  plant: "in a corner or against a wall, standing on the floor",
  storage: "flush against a wall",
  decor: "resting on an existing surface at a natural height, not floating",
  textile: "draped naturally over existing furniture, not floating in open space",
};

/**
 * Product listing photos routinely stage a person for scale (a child on a
 * kids' sofa, a hand holding a lamp) — a real, confirmed failure had that
 * staged child get painted straight into a customer's room photo, sourced
 * from the reference image and/or its text description. Repeated verbatim
 * in every product-insertion prompt (both providers) as a second layer on
 * top of describeProductForPrompt's own "describe the object alone"
 * instruction, since a multi-image edit can still copy what it visually
 * sees in the reference photo regardless of what the text says.
 */
export { NO_PEOPLE_INSTRUCTION } from "./prompts";

const CATEGORY_LABEL_ALIASES: Record<ProductCategory, string[]> = {
  sofa: ["sofa", "sectional", "couch"],
  chair: ["chair", "armchair"],
  table: ["table", "desk"],
  lighting: ["lamp", "light", "pendant", "chandelier"],
  rug: ["rug", "carpet"],
  art: ["art", "print", "poster", "mirror"],
  plant: ["plant"],
  storage: ["cabinet", "shelf", "sideboard", "wardrobe", "bookcase"],
  decor: ["vase", "decor", "candle", "bowl"],
  textile: ["cushion", "curtain", "throw", "pillow"],
};

export function matchingDetectionBox(category: ProductCategory, detections: Detection[]): DetectionBox | null {
  const aliases = CATEGORY_LABEL_ALIASES[category];
  const match = detections.find((d) => d.box && aliases.some((a) => d.label.toLowerCase().includes(a)));
  return match?.box ?? null;
}

const MIME_BY_FORMAT: Record<string, string> = { jpeg: "image/jpeg", jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

/**
 * new Blob([buffer]) with no `type` option serializes as
 * application/octet-stream in the multipart body regardless of the
 * filename extension you pass — OpenAI's API rejects that outright
 * ("unsupported mimetype"). Detect the real format and set it explicitly.
 */
async function toImageBlob(buffer: Buffer): Promise<{ blob: Blob; filename: string }> {
  const { format } = await sharp(buffer).metadata();
  const mime = (format && MIME_BY_FORMAT[format]) || "image/png";
  const ext = format === "jpeg" ? "jpg" : format ?? "png";
  return { blob: new Blob([new Uint8Array(buffer)], { type: mime }), filename: `image.${ext}` };
}

/**
 * Long edge for a PRODUCT REFERENCE image — the photos the model copies
 * appearance from, not the canvas being edited. The room photo keeps its
 * full COMPOSITE_MAX_EDGE resolution (it IS the output); references only
 * need enough detail to identify material, colour and shape, and each one
 * ends up occupying a fraction of the final frame.
 *
 * This is an upload-size fix, and upload is the asymmetric direction. A
 * scene composite posts the room plus one image per item in a single
 * multipart body — with 10 items at supplier-native resolution that is
 * tens of megabytes, and product feeds serve far larger files than a
 * reference needs. On a connection with limited uplink (a phone hotspot,
 * measured here) that upload is the step that stalls: in one real run the
 * text-to-image calls, which upload nothing, succeeded first try while the
 * composite needed five attempts and 139 seconds.
 */
const REFERENCE_MAX_EDGE = 1024;
const REFERENCE_QUALITY = 88;

async function toReferenceImageBlob(buffer: Buffer): Promise<{ blob: Blob; filename: string }> {
  const resized = await sharp(buffer)
    .rotate()
    .resize(REFERENCE_MAX_EDGE, REFERENCE_MAX_EDGE, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: REFERENCE_QUALITY })
    .toBuffer();
  return { blob: new Blob([new Uint8Array(resized)], { type: "image/jpeg" }), filename: "image.jpg" };
}

export interface CompositeResult {
  /** Base64 PNG — the room photo with the product composited in. */
  imageBase64: string;
  maskBox: DetectionBox;
  /** Which precedence tier decided the mask position — see the module doc comment. */
  placementSource: "explicit" | "detection" | "default";
}

/**
 * gpt-image-1.5's multi-image edit doesn't reliably treat a second
 * reference image as a hard content constraint — a real, confirmed
 * failure had it paint a generic console table into the mask instead of
 * the sofa it was given, despite the prompt already saying "use the
 * exact product shown." Getting a plain-text description of the product
 * from Claude vision first and repeating THAT in the edit prompt gives
 * the model a second, text-based anchor for what's supposed to appear —
 * image-reference-following and text-instruction-following are different
 * strengths and this hedges across both. One extra cheap vision call,
 * not an image generation call, so it doesn't meaningfully change cost.
 */
export async function describeProductForPrompt(productPhoto: Buffer): Promise<string | null> {
  if (!aiEnabled()) return null;
  try {
    const jpeg = await sharp(productPhoto)
      .rotate()
      .resize(512, 512, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();

    const response = await new Anthropic().messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 200,
      // Explicit, not just omitted: on Sonnet 5 an omitted `thinking` field
      // silently runs adaptive thinking (a model-specific default change —
      // see lib/ai/webProductSearch.ts's extractRequestedExtras for the
      // same fix), which would undercut the "couple of seconds" this call
      // is supposed to take.
      thinking: { type: "disabled" },
      system:
        "Describe ONLY the furniture/decor item itself in this product photo, in one concise sentence, for " +
        "someone who must recreate its exact appearance elsewhere without seeing this photo. State the product " +
        "type, dominant color, material, and any distinctive shape or features. Do not mention the background, " +
        "photography style, or any people, children, hands, models, pets, or other props visible in the shot — " +
        "describe the object alone, as if it were photographed empty on a plain background.",
      messages: [
        {
          role: "user",
          content: [{ type: "image", source: { type: "base64", media_type: "image/jpeg", data: jpeg.toString("base64") } }],
        },
      ],
    }, {
      // See lib/ai/webProductSearch.ts for why: the SDK default (10 min
      // timeout x up to 3 attempts) turns one stuck call into up to 30
      // minutes. This is a tiny, single-turn, no-thinking call — normally a
      // couple of seconds — so fail fast instead of blocking the render.
      // maxRetries: 0 — the SDK retries a timeout like any other connection
      // error, so maxRetries: 1 would silently double this to 90s.
      timeout: 45_000,
      maxRetries: 0,
    });

    const text = response.content.find((b) => b.type === "text")?.text;
    return text?.trim() || null;
  } catch (err) {
    console.error("[vistroom] product description failed, compositing without it:", err);
    return null;
  }
}


export async function compositeProductIntoRoom(
  roomPhotoInput: Buffer,
  productPhoto: Buffer,
  category: ProductCategory,
  detections: Detection[] = [],
  quality: "low" | "medium" | "high" = "low",
  explicitBox?: DetectionBox,
  /** Estimated angle of the wall/floor plane the box sits against — see lib/ai/placement.ts. 0 or undefined = no rotation hint. */
  wallAngleDeg?: number,
  /** The product's REAL size, when the supplier feed carries it — grounds the render in centimetres instead of the model's aesthetic guess. See scaleGroundingDirection in ./prompts. */
  dimensionsCm?: { l: number; w: number; h: number } | null,
  /** The room's estimated real dimensions (lib/ai/placement.ts), used to express the product as a proportion of the space. */
  roomDimensions?: { widthM: number; depthM: number; heightM: number } | null,
): Promise<CompositeResult> {
  if (!compositingEnabled()) throw new Error("OPENAI_API_KEY not configured");

  const roomPhoto = await sharp(roomPhotoInput)
    .rotate() // respect EXIF orientation so mask coordinates match what the user (and the model) actually see
    .resize(COMPOSITE_MAX_EDGE, COMPOSITE_MAX_EDGE, { fit: "inside", withoutEnlargement: true })
    .toBuffer();

  const meta = await sharp(roomPhoto).metadata();
  const width = meta.width ?? 1024;
  const height = meta.height ?? 1024;

  const detectedBox = explicitBox ? null : matchingDetectionBox(category, detections);
  const maskBox = explicitBox ? clampBox(explicitBox) : detectedBox ?? DEFAULT_CATEGORY_BOX[category];
  const placementSource: CompositeResult["placementSource"] = explicitBox ? "explicit" : detectedBox ? "detection" : "default";

  console.log("[vistroom] compositeProductIntoRoom (unmasked full-image edit)", {
    originalSize: await sharp(roomPhotoInput).metadata().then((m) => `${m.width}x${m.height}`),
    resizedTo: `${width}x${height}`,
    placementSource,
    maskBox,
  });

  const roomImage = await toImageBlob(roomPhoto);
  const productImage = await toReferenceImageBlob(productPhoto);
  const productDescription = await describeProductForPrompt(productPhoto);

  const form = new FormData();
  form.append("model", MODEL);
  form.append("image[]", roomImage.blob, roomImage.filename);
  form.append("image[]", productImage.blob, productImage.filename);
  // Deliberately no `mask` field — see the module doc comment above this
  // function for why: every masked-edit variant tried (hard box, padded
  // box, feathered box, then Grounded-SAM-segmented box) produced a real,
  // reported failure of its own — cut-off edges, wrong-product
  // substitutions, a black rendering artifact, a color-harmonization
  // "wash." An unmasked edit lets the model repaint the whole canvas, and
  // "leave the rest of the room alone" is enforced entirely through the
  // prompt below instead of a pixel mask — the same technique
  // composeSceneWithProducts already uses for its restyle mode. Trades a
  // (currently unquantified) risk of unwanted whole-room drift for
  // reliably getting the actual requested product into the render, which
  // real testing found the masked approach was failing at more often.
  form.append(
    "prompt",
    buildProductInsertionPrompt({
      category,
      productDescription,
      box: maskBox,
      explicitBox: Boolean(explicitBox),
      placementHint: CATEGORY_PLACEMENT_HINT[category],
      wallAngleDeg,
      dimensionsCm,
      roomDimensions,
      // Deliberately no `mask` field on this path — see the block comment
      // above about why every masked variant tried produced its own
      // confirmed failure. "Leave the rest of the room alone" is carried
      // entirely by PRESERVE_ROOM_DISCIPLINE in the prompt instead.
      masked: false,
      hasReferenceImage: true,
    }),
  );
  form.append("quality", quality);
  form.append("input_fidelity", "high");
  form.append("size", "auto");
  form.append("n", "1");

  const res = await postImageEditWithRetry(form, "product insert");

  const body = (await res.json()) as { data?: { b64_json?: string }[] };
  const b64 = body.data?.[0]?.b64_json;
  if (!b64) throw new Error("OpenAI response had no image data");

  // No local blend-back — unlike removeExistingObject/composeSceneWithProducts's
  // masked branch, there's no mask region to blend against here, and the whole
  // point of going unmasked is letting the model's full-canvas edit stand as-is.
  return { imageBase64: b64, maskBox, placementSource };
}

export interface RemovalResult {
  /** Base64 PNG — the room photo with the object erased and its background filled in. */
  imageBase64: string;
}

/**
 * Erases an existing object already physically present in the room photo
 * (Phase 2: "remove that sofa"). The box comes from Claude vision
 * (lib/ai/locate.ts) rather than pixel-precise segmentation — a
 * deliberate v1 simplification (see that module's doc comment) that
 * reuses the same rectangular box-mask machinery as
 * compositeProductIntoRoom instead of a second vendor. Trades a bit of
 * mask precision (some surrounding wall/floor gets repainted too, not
 * just the object's exact silhouette) for zero new infrastructure.
 */
export async function removeExistingObject(
  roomPhotoInput: Buffer,
  box: DetectionBox,
  category: ProductCategory,
  /** A specific item description ("dark oak coffee table") when the caller has one — a far better erase target than the bare category. */
  removalDescription?: string,
): Promise<RemovalResult> {
  if (!compositingEnabled()) throw new Error("OPENAI_API_KEY not configured");

  const roomPhoto = await sharp(roomPhotoInput)
    .rotate()
    .resize(COMPOSITE_MAX_EDGE, COMPOSITE_MAX_EDGE, { fit: "inside", withoutEnlargement: true })
    .toBuffer();

  const meta = await sharp(roomPhoto).metadata();
  const width = meta.width ?? 1024;
  const height = meta.height ?? 1024;

  const paddedBox = padBoxForEdit(box);
  const maskPng = await buildMaskPng(width, height, paddedBox);
  const roomImage = await toImageBlob(roomPhoto);

  const form = new FormData();
  form.append("model", MODEL);
  form.append("image[]", roomImage.blob, roomImage.filename);
  form.append("mask", new Blob([new Uint8Array(maskPng)], { type: "image/png" }), "mask.png");
  form.append("prompt", buildRemovalPrompt(category, removalDescription));
  form.append("quality", "low");
  form.append("input_fidelity", "high");
  form.append("size", "auto");
  form.append("n", "1");

  const res = await postImageEditWithRetry(form, "object removal");

  const body = (await res.json()) as { data?: { b64_json?: string }[] };
  const b64 = body.data?.[0]?.b64_json;
  if (!b64) throw new Error("OpenAI response had no image data");

  const blended = await blendEditedRegion(roomPhoto, Buffer.from(b64, "base64"), width, height, paddedBox);
  return { imageBase64: blended.toString("base64") };
}

export interface SceneItem {
  productPhoto: Buffer;
  category: ProductCategory;
  box: DetectionBox;
  wallAngleDeg?: number;
}

export interface SceneCompositeResult {
  imageBase64: string;
}

/**
 * Composites MULTIPLE products into a room in ONE edit call, instead of one
 * call per product. Built specifically for curated "finished room" bundles
 * (scripts/compose-finished-room.ts), where the whole point is a single,
 * cohesively staged photo — chaining N separate single-object edits (the
 * Designer chat's approach, appropriate there since the user confirms one
 * item at a time) compounds into a scattered, stitched-together look for a
 * bundle: each call only knows its own category's generic box, has no
 * awareness of the other items already added, and repeated edit-of-an-edit
 * passes degrade quality further with every extra item. One call with every
 * reference image and an explicit per-item layout description lets the
 * model reason about the whole scene — relative scale, shared lighting,
 * believable arrangement — at once.
 *
 * styleDirection: when set, the edit is UNMASKED and the model is told to
 * restyle the entire room (wall color, lighting mood, staging accents)
 * around the real products, per that direction — for curated showroom
 * bundles where the hero image should look like a magazine shoot, not the
 * bare input photo with objects added. Real feedback drove this: products
 * dropped into an untouched plain room read as "basic", nothing a customer
 * wants to buy whole. Never use styleDirection for a customer's own room
 * photo — customers expect THEIR room back, untouched except the product.
 */
export async function composeSceneWithProducts(
  roomPhotoInput: Buffer,
  items: SceneItem[],
  quality: "low" | "medium" | "high" = "medium",
  styleDirection?: string,
): Promise<SceneCompositeResult> {
  if (!compositingEnabled()) throw new Error("OPENAI_API_KEY not configured");
  if (items.length === 0) throw new Error("composeSceneWithProducts needs at least one item");

  const roomPhoto = await sharp(roomPhotoInput)
    .rotate()
    .resize(COMPOSITE_MAX_EDGE, COMPOSITE_MAX_EDGE, { fit: "inside", withoutEnlargement: true })
    .toBuffer();
  const meta = await sharp(roomPhoto).metadata();
  const width = meta.width ?? 1024;
  const height = meta.height ?? 1024;

  const restyle = Boolean(styleDirection?.trim());

  const roomImage = await toImageBlob(roomPhoto);
  const form = new FormData();
  form.append("model", MODEL);
  form.append("image[]", roomImage.blob, roomImage.filename);

  // Prepare each product's blob and its one-line description up front, all at
  // once. describeProductForPrompt is a separate Claude call per item; run
  // sequentially they stack (8 items → 8 round-trips before the render even
  // starts), which is the bulk of the pre-render wait. Fetch them together,
  // then append images IN ORDER so reference-image numbering stays stable.
  const descriptionsStart = Date.now();
  const prepared = await Promise.all(
    items.map(async (item) => ({
      blob: await toReferenceImageBlob(item.productPhoto),
      description: await describeProductForPrompt(item.productPhoto),
    })),
  );
  console.log(`[vistroom] timing: product descriptions (${items.length}x, parallel) took ${Date.now() - descriptionsStart}ms`);

  const itemLines: string[] = [];
  for (const [i, item] of items.entries()) {
    const { blob: productImage, description } = prepared[i];
    form.append("image[]", productImage.blob, productImage.filename);
    const wallAngleNote =
      item.wallAngleDeg && Math.abs(item.wallAngleDeg) > 2
        ? ` The surface behind it recedes at about ${Math.round(item.wallAngleDeg)}° (${item.wallAngleDeg > 0 ? "away to the right" : "away to the left"}) — align it flush with that plane, not facing the camera head-on.`
        : "";
    itemLines.push(
      `Reference image ${i + 2} is a real ${item.category}${description ? `: ${description}` : ""} — place it in the ` +
        `${describeRoughLocation(item.box)} of the ${restyle ? "room" : "masked area"}.${wallAngleNote}`,
    );
  }

  if (restyle) {
    // No mask: the whole image may change (walls, lighting, floor mood),
    // constrained to the room's real architecture by the prompt instead.
    console.log("[vistroom] composeSceneWithProducts restyle", { width, height, itemCount: items.length, quality, styleDirection });
    form.append(
      "prompt",
      "You are a professional interior photographer and retoucher. The first image is a photograph of a real " +
        "room. Every image after it is a photograph of a real product. Edit this exact room photograph " +
        "according to this art direction: " +
        `${styleDirection!.trim()}. ` +
        "Preserve the room's actual architecture exactly as photographed: the same walls, window and door " +
        "positions, ceiling height, floor material, camera position and perspective. Keep every existing piece " +
        "of furniture and decor precisely where and as it is, UNLESS the direction above explicitly says to " +
        "change or remove it. " +
        "The direction above is the ONLY licence you have to change anything beyond adding the listed products: " +
        "do not repaint walls, change flooring, add a rug, alter the lighting mood, or introduce cushions, " +
        "books, plants, wall art or any other staging accessory unless that specific thing is named in it. Add " +
        "nothing else, however tastefully it would round out the scene — anything you invent is unpurchasable " +
        "and breaks the shoppable render. " +
        "The featured products are the heroes of the frame: use the EXACT product shown in each reference " +
        "image, never substituting a different piece and never omitting one. " +
        itemLines.join(" ") +
        LIGHTING_MATCH_DIRECTION +
        ATMOSPHERE_DIRECTION +
        CAMERA_MATCH_DIRECTION +
        MATERIAL_FIDELITY_DIRECTION +
        NO_PEOPLE,
    );
  } else {
    const union = unionBox(items.map((i) => i.box));
    const maskRegion = padBoxForEdit(union);
    console.log("[vistroom] composeSceneWithProducts mask", { width, height, itemCount: items.length, quality, maskRegion });
    const maskPng = await buildMaskPng(width, height, maskRegion);
    form.append("mask", new Blob([new Uint8Array(maskPng)], { type: "image/png" }), "mask.png");
    form.append(
      "prompt",
      "You are a professional interior photographer and retoucher. The first image is a photograph of a real " +
        "room. Every image after it is a photograph of a real product to composite into the masked region. The " +
        "result must read as a single unretouched interior photograph of the kind published in a design " +
        "magazine or a high-end property listing — never as a catalogue grid with items lined up facing the " +
        "camera. " +
        "Arrange the given pieces as ONE cohesive, naturally lived-in scene, the way an interior designer " +
        "would actually lay out real furniture: consistent scale and shared lighting across every piece, " +
        "believable relative positions (a coffee table sits in front of a sofa, not overlapping or floating " +
        "apart from it; a sideboard sits flush against a wall; an accent chair angles slightly toward the " +
        "seating as if for conversation, never square to the camera), and realistic contact shadows and " +
        "ambient occlusion where each item meets the floor. Style the arrangement with a human hand rather " +
        "than symmetrically: cushions leaned or overlapped rather than centred and upright, a throw draped " +
        "loosely over an arm rather than folded flat, wall art hung at true eye height rather than centred in " +
        "the available wall space. " +
        "Use the EXACT product shown in each reference image for its corresponding item — never substitute a " +
        "different piece for any of them, and never omit one. " +
        itemLines.join(" ") +
        LIGHTING_MATCH_DIRECTION +
        ATMOSPHERE_DIRECTION +
        CAMERA_MATCH_DIRECTION +
        MATERIAL_FIDELITY_DIRECTION +
        MASK_DISCIPLINE +
        CATALOG_ONLY_SCENE_CONSTRAINT +
        NO_PEOPLE,
    );
  }
  form.append("quality", quality);
  form.append("size", "auto");
  form.append("n", "1");

  // This is the real render — a full-image edit/restyle across every
  // reference photo, run entirely on OpenAI's infrastructure. It's typically
  // the single biggest chunk of a generate call's wall time (well past the
  // ~30-90s the UI copy quotes at "high" quality with several items —
  // restyle mode is also slower than a masked edit since the whole image is
  // regenerated, not just a region) — timed explicitly so a slow run shows
  // exactly how much of it was this step versus the Claude calls around it.
  const renderStart = Date.now();
  const res = await postImageEditWithRetry(form, "scene composite");
  console.log(`[vistroom] timing: OpenAI image render (quality=${quality}, ${restyle ? "restyle" : "mask"}) took ${Date.now() - renderStart}ms`);

  const body = (await res.json()) as { data?: { b64_json?: string }[] };
  const b64 = body.data?.[0]?.b64_json;
  if (!b64) throw new Error("OpenAI response had no image data");

  return { imageBase64: b64 };
}

/**
 * Product listing photos are studio shots on a near-white background with
 * uneven padding around the actual product — a real, confirmed failure had
 * a wide 3-seater sofa's near-square product photo (padding included)
 * treated as if the sofa itself were square, producing a mask the model
 * then had to squeeze the sofa into, warping its proportions badly. sharp's
 * trim() strips that padding first so the ratio reflects the product's real
 * visual footprint, not whatever canvas the listing photo happened to use.
 * Falls back to the untrimmed ratio only if trim() itself fails (e.g. a
 * photo with no uniform background to trim against).
 */
export async function productAspectRatio(productPhoto: Buffer): Promise<number> {
  try {
    const { info } = await sharp(productPhoto).trim({ threshold: 20 }).toBuffer({ resolveWithObject: true });
    if (info.width && info.height) return info.width / info.height;
  } catch {
    // fall through to the untrimmed ratio below
  }
  const { width, height } = await sharp(productPhoto).metadata();
  return width && height ? width / height : 1;
}

/**
 * Server-side equivalent of lib/clientImage.ts's reshapeBoxToAspectRatio
 * (that one needs a browser canvas) — adapts a category's generic
 * placement box to a specific product's real width:height ratio, keeping
 * the suggested width and floor-contact bottom edge fixed.
 */
export async function reshapeBoxForProduct(box: DetectionBox, productPhoto: Buffer): Promise<DetectionBox> {
  const aspectRatio = await productAspectRatio(productPhoto);
  const bottom = box.y + box.h;
  const h = box.w / aspectRatio;
  return clampBox({ x: box.x, y: bottom - h, w: box.w, h });
}
