import sharp from "sharp";
import type { Detection, DetectionBox, ProductCategory } from "../types";

/**
 * GPT-Image compositing step: takes a real room photo + a real product
 * photo and inserts the product into the room via a masked edit. Unlike
 * everything else in this app, this step costs real money per call and
 * requires OpenAI specifically — Claude (lib/ai/claude.ts) has no image
 * generation/editing capability, so this is a second, separate provider.
 *
 * Mask placement ("Option A", per the workflow decision): prefer a real
 * detection box already present in the room's analysis when the category
 * matches something Claude actually found in the photo (e.g. replacing an
 * existing sofa uses its real position) — otherwise fall back to a rough,
 * context-blind default position per category. Both are a stand-in for the
 * eventual real fix: a UI where the mask region is drawn against the
 * user's actual photo. Neither is layout-aware of what's already in an
 * arbitrary room, so expect visibly wrong placements sometimes — that's
 * expected at this stage, not a bug to chase down yet.
 */

export function compositingEnabled(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

const MODEL = "gpt-image-1.5";

/** Deliberately rough — see module doc comment. Tuned for a typical eye-level living-room photo. */
const DEFAULT_CATEGORY_BOX: Record<ProductCategory, DetectionBox> = {
  sofa: { x: 0.28, y: 0.52, w: 0.46, h: 0.3 },
  chair: { x: 0.06, y: 0.5, w: 0.2, h: 0.28 },
  table: { x: 0.38, y: 0.72, w: 0.22, h: 0.14 },
  lighting: { x: 0.82, y: 0.3, w: 0.12, h: 0.45 },
  rug: { x: 0.22, y: 0.8, w: 0.56, h: 0.16 },
  art: { x: 0.36, y: 0.14, w: 0.3, h: 0.22 },
  plant: { x: 0.86, y: 0.42, w: 0.12, h: 0.38 },
  storage: { x: 0.02, y: 0.3, w: 0.18, h: 0.4 },
  decor: { x: 0.42, y: 0.66, w: 0.1, h: 0.1 },
  textile: { x: 0.32, y: 0.58, w: 0.14, h: 0.1 },
};

/**
 * The mask only constrains *where editing is allowed*, not how the model
 * arranges the product within that region — a first real test placed a
 * sofa centered in open floor instead of pushed back against a wall, a
 * cheap prompt-level fix rather than a placement-engineering one.
 */
const CATEGORY_PLACEMENT_HINT: Record<ProductCategory, string> = {
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

function matchingDetectionBox(category: ProductCategory, detections: Detection[]): DetectionBox | null {
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

async function buildMaskPng(width: number, height: number, box: DetectionBox): Promise<Buffer> {
  const channels = 4;
  const pixels = Buffer.alloc(width * height * channels, 255); // opaque everywhere = "keep as-is"

  const x0 = Math.max(0, Math.round(box.x * width));
  const y0 = Math.max(0, Math.round(box.y * height));
  const x1 = Math.min(width, Math.round((box.x + box.w) * width));
  const y1 = Math.min(height, Math.round((box.y + box.h) * height));

  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      pixels[(y * width + x) * channels + 3] = 0; // alpha 0 = "edit this region"
    }
  }

  return sharp(pixels, { raw: { width, height, channels } }).png().toBuffer();
}

export interface CompositeResult {
  /** Base64 PNG — the room photo with the product composited in. */
  imageBase64: string;
  maskBox: DetectionBox;
  /** True if a real detection from the room's own analysis was used instead of the generic default. */
  usedRealDetection: boolean;
}

export async function compositeProductIntoRoom(
  roomPhoto: Buffer,
  productPhoto: Buffer,
  category: ProductCategory,
  detections: Detection[] = [],
  quality: "low" | "medium" | "high" = "low",
): Promise<CompositeResult> {
  if (!compositingEnabled()) throw new Error("OPENAI_API_KEY not configured");

  const meta = await sharp(roomPhoto).metadata();
  const width = meta.width ?? 1024;
  const height = meta.height ?? 1024;

  const detectedBox = matchingDetectionBox(category, detections);
  const maskBox = detectedBox ?? DEFAULT_CATEGORY_BOX[category];
  const maskPng = await buildMaskPng(width, height, maskBox);

  const roomImage = await toImageBlob(roomPhoto);
  const productImage = await toImageBlob(productPhoto);

  const form = new FormData();
  form.append("model", MODEL);
  form.append("image[]", roomImage.blob, roomImage.filename);
  form.append("image[]", productImage.blob, productImage.filename);
  form.append("mask", new Blob([new Uint8Array(maskPng)], { type: "image/png" }), "mask.png");
  form.append(
    "prompt",
    "The first image is a room photo. The second image is a real product photo. " +
      "Composite the exact product from the second image into the masked region of the first image — " +
      "match the room's perspective, scale and lighting. Do not invent a different product; use the " +
      "one shown. Leave everything outside the masked region unchanged. " +
      `Place it realistically the way it would actually sit in a lived-in room: ${CATEGORY_PLACEMENT_HINT[category]}.`,
  );
  form.append("quality", quality);
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

  return { imageBase64: b64, maskBox, usedRealDetection: Boolean(detectedBox) };
}
