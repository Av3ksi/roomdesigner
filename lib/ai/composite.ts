import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";
import { MODEL as CLAUDE_MODEL, aiEnabled } from "./claude";
import { blendEditedRegion, buildMaskPng } from "./imageMasking";
import { DEFAULT_CATEGORY_BOX, clampBox, describeRoughLocation, unionBox } from "../placementBoxes";
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
 */

export function compositingEnabled(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

const MODEL = "gpt-image-1.5";

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
export const NO_PEOPLE_INSTRUCTION =
  " Do not include any people, children, hands, models, or pets that may appear in the reference photo or its " +
  "description — depict only the product itself, unoccupied, with no person or animal present.";

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

export interface CompositeResult {
  /** Base64 PNG — the room photo with the product composited in. */
  imageBase64: string;
  maskBox: DetectionBox;
  /** Which precedence tier decided the mask position — see the module doc comment. */
  placementSource: "explicit" | "detection" | "default";
}

/**
 * The mask is padded slightly beyond the placement box so the model has
 * room to blend shadows and contact edges into the surrounding pixels —
 * a hard mask edge exactly at the product's silhouette produces visible
 * seams. The hotspot still gets the unpadded box.
 */
export const MASK_PADDING = 0.04;

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
    console.error("[maison] product description failed, compositing without it:", err);
    return null;
  }
}

/**
 * Real photos (a phone camera shot, easily 4000×3000+) are far larger than
 * an image-edit API needs — sending one uncompressed is slow to upload,
 * slower for the model to process, and risks silently hitting whatever
 * size/dimension limit the API enforces. Downscaling first is standard
 * practice, and this app already does it for every Claude vision call
 * (lib/ai/placement.ts, lib/ai/identityCheck.ts) — this was the one place
 * still sending the original, full-resolution buffer straight through.
 */
export const COMPOSITE_MAX_EDGE = 2048;

export async function compositeProductIntoRoom(
  roomPhotoInput: Buffer,
  productPhoto: Buffer,
  category: ProductCategory,
  detections: Detection[] = [],
  quality: "low" | "medium" | "high" = "low",
  explicitBox?: DetectionBox,
  /** Estimated angle of the wall/floor plane the box sits against — see lib/ai/placement.ts. 0 or undefined = no rotation hint. */
  wallAngleDeg?: number,
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

  const paddedBox = clampBox({
    x: maskBox.x - MASK_PADDING,
    y: maskBox.y - MASK_PADDING,
    w: maskBox.w + MASK_PADDING * 2,
    h: maskBox.h + MASK_PADDING * 2,
  });
  console.log("[maison] compositeProductIntoRoom mask", {
    originalSize: await sharp(roomPhotoInput).metadata().then((m) => `${m.width}x${m.height}`),
    resizedTo: `${width}x${height}`,
    placementSource,
    maskBox,
    paddedBox,
  });
  const maskPng = await buildMaskPng(width, height, paddedBox);

  const roomImage = await toImageBlob(roomPhoto);
  const productImage = await toImageBlob(productPhoto);
  const productDescription = await describeProductForPrompt(productPhoto);

  const form = new FormData();
  form.append("model", MODEL);
  form.append("image[]", roomImage.blob, roomImage.filename);
  form.append("image[]", productImage.blob, productImage.filename);
  form.append("mask", new Blob([new Uint8Array(maskPng)], { type: "image/png" }), "mask.png");
  const wallAngleInstruction =
    wallAngleDeg && Math.abs(wallAngleDeg) > 2
      ? ` The wall or floor plane behind this position recedes at approximately ${Math.round(wallAngleDeg)}° from the camera ` +
        `(${wallAngleDeg > 0 ? "receding away to the right" : "receding away to the left"}, matching this photo's actual ` +
        "vanishing lines) — rotate the product so its parallel edges (front face, top, base) align exactly with that " +
        "plane. It must lie flush and parallel against its real surface, not face the camera head-on."
      : wallAngleDeg === 0
        ? " The wall behind this position faces the camera directly (no perspective recession) — keep the product's front face parallel to the camera plane."
        : "";

  form.append(
    "prompt",
    "The first image is a room photo. The second image is a real product photo — " +
      `a real ${category}${productDescription ? `: ${productDescription}` : ""}. ` +
      "Composite the EXACT product shown in the second image into the masked region of the first image — " +
      "match the room's perspective, scale and lighting. CRITICAL: the masked region must contain ONLY this " +
      `exact ${category} and nothing else — never substitute a different piece of furniture or object (no ` +
      "consoles, shelves, side tables, decor, or any other category), even if it seems like a more natural fit " +
      "for the room. If the reference photo is unclear, still insert something that resembles it as closely as " +
      "possible — do not default to a generic or different object. Leave everything outside the masked region " +
      "unchanged. " +
      // With an explicit user/AI-chosen box the mask IS the intended position — a generic
      // category hint ("against a wall") could fight a deliberate mid-room placement.
      (explicitBox
        ? "The masked region marks the exact intended position — fit the product naturally within it, resting on the floor or surface with a realistic contact shadow."
        : `Place it realistically the way it would actually sit in a lived-in room: ${CATEGORY_PLACEMENT_HINT[category]}.`) +
      wallAngleInstruction +
      NO_PEOPLE_INSTRUCTION,
  );
  form.append("quality", quality);
  form.append("input_fidelity", "high");
  form.append("size", "auto");
  form.append("n", "1");

  const res = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: form,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI image edit failed: ${res.status} ${errText}`);
  }

  const body = (await res.json()) as { data?: { b64_json?: string }[] };
  const b64 = body.data?.[0]?.b64_json;
  if (!b64) throw new Error("OpenAI response had no image data");

  const blended = await blendEditedRegion(roomPhoto, Buffer.from(b64, "base64"), width, height, paddedBox);
  return { imageBase64: blended.toString("base64"), maskBox, placementSource };
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
): Promise<RemovalResult> {
  if (!compositingEnabled()) throw new Error("OPENAI_API_KEY not configured");

  const roomPhoto = await sharp(roomPhotoInput)
    .rotate()
    .resize(COMPOSITE_MAX_EDGE, COMPOSITE_MAX_EDGE, { fit: "inside", withoutEnlargement: true })
    .toBuffer();

  const meta = await sharp(roomPhoto).metadata();
  const width = meta.width ?? 1024;
  const height = meta.height ?? 1024;

  const paddedBox = clampBox({
    x: box.x - MASK_PADDING,
    y: box.y - MASK_PADDING,
    w: box.w + MASK_PADDING * 2,
    h: box.h + MASK_PADDING * 2,
  });
  const maskPng = await buildMaskPng(width, height, paddedBox);
  const roomImage = await toImageBlob(roomPhoto);

  const form = new FormData();
  form.append("model", MODEL);
  form.append("image[]", roomImage.blob, roomImage.filename);
  form.append("mask", new Blob([new Uint8Array(maskPng)], { type: "image/png" }), "mask.png");
  form.append(
    "prompt",
    `Remove the ${category} from the masked region entirely. Fill in what would realistically be behind it — ` +
      "matching the existing floor, wall, and lighting exactly, as if the object was never there. " +
      "Leave everything outside the masked region unchanged.",
  );
  form.append("quality", "low");
  form.append("input_fidelity", "high");
  form.append("size", "auto");
  form.append("n", "1");

  const res = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: form,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI image edit failed: ${res.status} ${errText}`);
  }

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
      blob: await toImageBlob(item.productPhoto),
      description: await describeProductForPrompt(item.productPhoto),
    })),
  );
  console.log(`[maison] timing: product descriptions (${items.length}x, parallel) took ${Date.now() - descriptionsStart}ms`);

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
    console.log("[maison] composeSceneWithProducts restyle", { width, height, itemCount: items.length, quality, styleDirection });
    form.append(
      "prompt",
      "The first image is a photo of a real room. Every image after it is a real product photo. Edit this exact " +
        "room photo according to this direction: " +
        `${styleDirection!.trim()}. ` +
        "This is a real customer's real room, not a stock photo to reimagine — preserve it as closely as possible. " +
        "Keep the room's actual architecture EXACTLY as photographed: same walls, wall color, window and door " +
        "positions, ceiling height, floor material, camera angle and perspective. Keep every piece of existing " +
        "furniture and every existing decor item exactly where and how it is, unless the direction above " +
        "explicitly says to change or remove it. Do not repaint walls, change the floor, add a rug, adjust the " +
        "lighting mood, or add any cushions, books, plants, wall art, or other staging accents UNLESS the " +
        "direction above explicitly asks for that specific thing — add nothing else, no matter how tastefully it " +
        "would round out the scene. The only things you should add or change are: the placed products below, and " +
        "whatever is explicitly named in the direction above. The featured products are the heroes of the scene: " +
        "use the EXACT product shown in each reference image — never substitute a different piece for any of " +
        "them, and never omit one. " +
        itemLines.join(" ") +
        " Consistent scale, perspective and lighting across everything; realistic contact shadows where items touch the floor." +
        NO_PEOPLE_INSTRUCTION,
    );
  } else {
    const union = unionBox(items.map((i) => i.box));
    const maskRegion = clampBox({
      x: union.x - MASK_PADDING,
      y: union.y - MASK_PADDING,
      w: union.w + MASK_PADDING * 2,
      h: union.h + MASK_PADDING * 2,
    });
    console.log("[maison] composeSceneWithProducts mask", { width, height, itemCount: items.length, quality, maskRegion });
    const maskPng = await buildMaskPng(width, height, maskRegion);
    form.append("mask", new Blob([new Uint8Array(maskPng)], { type: "image/png" }), "mask.png");
    form.append(
      "prompt",
      "The first image is a room photo. Every image after it is a real product photo to composite into the masked " +
        "region of the room — arrange them together as ONE cohesive, professionally staged room, the way a real " +
        "interior designer would lay out real furniture: consistent scale and lighting across every piece, " +
        "believable relative positions (e.g. a coffee table sits in front of a sofa, not overlapping it or floating " +
        "apart from it; a sideboard sits flush against a wall), and realistic contact shadows where each item " +
        "touches the floor. Use the EXACT product shown in each reference image for its corresponding item — never " +
        "substitute a different piece of furniture for any of them, and never omit one. " +
        itemLines.join(" ") +
        " Leave everything outside the masked region unchanged." +
        NO_PEOPLE_INSTRUCTION,
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
  const res = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: form,
  });
  console.log(`[maison] timing: OpenAI image render (quality=${quality}, ${restyle ? "restyle" : "mask"}) took ${Date.now() - renderStart}ms`);

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI image edit failed: ${res.status} ${errText}`);
  }

  const body = (await res.json()) as { data?: { b64_json?: string }[] };
  const b64 = body.data?.[0]?.b64_json;
  if (!b64) throw new Error("OpenAI response had no image data");

  return { imageBase64: b64 };
}

/**
 * Server-side equivalent of lib/clientImage.ts's reshapeBoxToAspectRatio
 * (that one needs a browser canvas) — adapts a category's generic
 * placement box to a specific product's real width:height ratio, keeping
 * the suggested width and floor-contact bottom edge fixed.
 */
export async function reshapeBoxForProduct(box: DetectionBox, productPhoto: Buffer): Promise<DetectionBox> {
  const { width, height } = await sharp(productPhoto).metadata();
  if (!width || !height) return box;
  const aspectRatio = width / height;
  const bottom = box.y + box.h;
  const h = box.w / aspectRatio;
  return clampBox({ x: box.x, y: bottom - h, w: box.w, h });
}
