import type { DetectionBox, ProductCategory } from "../types";
import { describeRoughLocation } from "../placementBoxes";

/**
 * Shared prompt language for every image-editing call in the app —
 * lib/ai/composite.ts (OpenAI) and lib/ai/fluxFill.ts (Replicate/FLUX).
 *
 * These were previously written per-call-site and had drifted: the same
 * instruction appeared in three slightly different wordings, and the
 * constraint that matters most commercially (nothing may appear that
 * isn't purchasable) existed in none of them. Composing every prompt from
 * the same blocks means a fix to how we say something lands everywhere at
 * once, and a provider swap doesn't quietly lose a rule.
 *
 * The register is deliberately that of an art director briefing a retoucher:
 * specific, technical, and stated as requirements rather than suggestions.
 * Image models follow concrete craft language ("match the key light's colour
 * temperature") far more reliably than adjectives ("make it look realistic").
 */

/**
 * THE commercial constraint. Vistroom's entire promise is that everything
 * visible in a render is a real product with a price and a buy button —
 * the hotspot layer over a finished image only works if every object in it
 * maps to a catalogue entry.
 *
 * Image models actively fight this. Asked to place a sofa, GPT-Image will
 * "helpfully" add a rug, a coffee table, a plant and framed art, because
 * its training rewards a well-styled interior photograph. Every one of
 * those is unpurchasable, unpinnable, and a lie to the customer about what
 * they're looking at. This block is repeated in every add-product prompt,
 * phrased as a hard prohibition with the specific temptations named — a
 * generic "don't add anything" is too easy for a model to read as
 * stylistic advice rather than a rule.
 */
export const CATALOG_ONLY_CONSTRAINT =
  " ABSOLUTE CONTENT RULE — read this as a hard constraint, not a stylistic preference. Do not add, invent, " +
  "introduce, or suggest ANY additional object beyond the single specified product. Specifically: no extra " +
  "rugs, cushions, throws, plants, vases, bowls, candles, books, trays, wall art, picture frames, mirrors, " +
  "lamps, curtains, side tables, ottomans, or decorative accessories of any kind. Do not embellish, style, " +
  "accessorise or 'complete' the scene, even where doing so would make it a more attractive photograph, and " +
  "even where the room looks sparse or unfinished without it. Bare walls stay bare. Empty floor stays empty. " +
  "Clear surfaces stay clear. The ONLY object that may appear in this image that was not already in the " +
  "original photograph is the exact product shown in the reference image. Every other pixel of content must " +
  "either already exist in the source photograph or not exist at all. An otherwise beautiful render " +
  "containing one invented object is a failed render.";

/**
 * The multi-product variant of CATALOG_ONLY_CONSTRAINT, for
 * composeSceneWithProducts. Same rule, but the permitted set is "the
 * products supplied as reference images" rather than one item — and the
 * temptation is stronger here, because a model staging a whole room reads
 * a sparse result as an unfinished job and fills it in.
 */
export const CATALOG_ONLY_SCENE_CONSTRAINT =
  " ABSOLUTE CONTENT RULE — read this as a hard constraint, not a stylistic preference. The ONLY objects that " +
  "may appear in this image are those already present in the original room photograph plus the exact products " +
  "supplied as reference images. Do not add, invent or introduce any additional furniture, rug, cushion, " +
  "throw, plant, vase, bowl, candle, book, tray, wall art, picture frame, mirror, lamp, curtain or decorative " +
  "accessory of any kind, no matter how sparse the room looks without it and no matter how much a real " +
  "published interior photograph would normally include. Style the arrangement of the given pieces; do not " +
  "invent new ones. Bare walls stay bare, empty floor stays empty, clear surfaces stay clear. Every object in " +
  "this image must be purchasable — one invented item makes the whole render unusable.";

/**
 * Repeated verbatim in every product-insertion prompt on both providers.
 * Product listing photos routinely stage a person for scale (a child on a
 * kids' sofa, a hand holding a lamp) — a real, confirmed failure had that
 * staged child painted straight into a customer's room. Kept as a second
 * layer on top of describeProductForPrompt's own "describe the object
 * alone" instruction, since a multi-image edit can copy what it visually
 * sees regardless of what the text says.
 */
export const NO_PEOPLE_INSTRUCTION =
  " Do not include any people, children, hands, models, or pets that may appear in the reference photo or its " +
  "description — depict only the product itself, unoccupied, with no person or animal present.";

/**
 * Optical continuity. The giveaway in a bad composite is almost never the
 * object's shape — it's that the object was photographed by a different
 * camera than the room. Naming the specific properties to match gives the
 * model something checkable; "make it look real" does not.
 */
export const CAMERA_MATCH_DIRECTION =
  " Match the room photograph's own optical signature exactly. Infer its apparent focal length and field of " +
  "view from the convergence of its vertical lines and the amount of the room it takes in, and render the " +
  "product with that same perspective — an object added to a wide-angle interior shows visible convergence " +
  "and edge distortion that the same object in a longer lens does not. Match the photograph's depth of field " +
  "and place the product correctly within it: sharp if it sits on the focal plane, carrying the same falloff " +
  "if it does not. Match its exposure, white balance, colour temperature, contrast curve, sensor noise and " +
  "grain structure. The product must read as having been captured in the same frame, by the same camera, in " +
  "the same instant — not as a clean studio cut-out pasted over a photograph.";

/**
 * Lighting is the second half of the same problem. Written to force the
 * model to read the source photo's lighting BEFORE rendering, rather than
 * lighting the product generically and hoping it lands.
 */
export const LIGHTING_MATCH_DIRECTION =
  " Before rendering, read the room's actual lighting: where the key light enters (window direction, and the " +
  "time of day implied by its colour temperature), which artificial lights are switched on and what colour " +
  "they cast, and where light bounces off pale walls, ceilings or floors as fill. Light the product from " +
  "those same sources, at those same relative intensities and colour temperatures. Its shadows must fall in " +
  "the same direction, with the same length and the same edge softness, as the shadows already visible on " +
  "existing objects in the photograph — a crisp shadow in a room lit by diffuse overcast daylight is an " +
  "immediate tell. Add a physically plausible contact shadow and ambient occlusion where the product meets " +
  "the floor or wall, and let nearby surfaces pick up a faint colour bounce from it, as they would in reality.";

/**
 * The "cool effect, looks like it could be my room" bar — LIGHTING_MATCH_
 * DIRECTION above only enforces consistency (the product's light matches
 * the room's), not atmosphere. This adds the two things that actually make
 * a render feel like a real, desirable photograph a shopper would stop and
 * look at, rather than a technically-correct but flat product placement:
 * a switched-on light source actually reading as lit, and an explicit
 * push against the generic "AI interior" look (waxy skin-smooth surfaces,
 * over-even illumination, no real depth).
 */
export const ATMOSPHERE_DIRECTION =
  " If any of the products being placed is a lamp, pendant, sconce or other light fixture, render it switched " +
  "ON: a warm visible glow at its bulb or shade, a soft pool of light it casts on the nearest surface, and a " +
  "gentle warm rim it adds to whatever sits near it — even in a daylit scene, a lit lamp reads as an inhabited, " +
  "considered room rather than a showroom. This must be an actual real product photograph, not a rendering " +
  "that reads as AI-generated: avoid the tells of that look — perfectly even illumination with no real falloff, " +
  "waxy or over-smoothed surfaces, colours that are slightly too saturated or too clean, a total absence of " +
  "dust, imperfection or the small asymmetries of a real lived-in space. The final image should be one a " +
  "stranger would look at and think 'that could be my living room,' not 'that's clearly a render.'";

/**
 * Material fidelity — the failure this addresses is a model "improving" a
 * product: smoothing a coarse weave, adding sheen to matte oak, turning
 * brushed brass polished. That silently misrepresents the item the
 * customer is about to pay for, which matters more here than in ordinary
 * image generation.
 */
export const MATERIAL_FIDELITY_DIRECTION =
  " Reproduce the product's material identity exactly as the reference photograph shows it, at the resolution " +
  "the room photo's own detail level supports: the weave, pile direction and slub of textiles; the grain " +
  "direction, pore texture and sheen level of wood; the specific reflectance of metal, distinguishing brushed " +
  "from polished from powder-coated; the difference between matte, satin and gloss finishes. Do not smooth, " +
  "stylise, upgrade or idealise any surface, and do not alter the product's colour to harmonise it with the " +
  "room — the customer is buying this exact object in this exact finish, and the render is what they are " +
  "judging it by.";

/** Mask discipline for masked edits — nothing outside the editable region may change, at all. */
export const MASK_DISCIPLINE =
  " Every pixel outside the masked region must remain byte-for-byte identical to the source photograph. Do " +
  "not repaint walls, adjust the floor, shift the white balance, re-grade the exposure, sharpen, denoise, or " +
  "'clean up' any part of the image outside the mask, and do not move or alter any existing object there.";

/** The same guarantee for the unmasked edit path, where only the prompt can enforce it. */
export const PRESERVE_ROOM_DISCIPLINE =
  " This is a real customer's real room, not a stock photograph to reinterpret. Preserve its architecture " +
  "exactly as shot: the same walls and wall colour, the same window and door positions, the same ceiling " +
  "height, the same floor material and direction, the same camera position and perspective. Keep every " +
  "existing piece of furniture and every existing decor item precisely where and as it is. Do not repaint, " +
  "re-light, re-grade, tidy, or restage anything. The single permitted change to this photograph is the " +
  "addition of the one specified product.";

/**
 * Grounds the render in real measurements instead of leaving scale to the
 * model's aesthetic judgement. Only emitted when the supplier feed actually
 * carries dimensions — inventing "approximately 2 metres" for an unknown
 * product would be worse than saying nothing, since the model would treat a
 * guess as a specification.
 */
export function scaleGroundingDirection(
  dimensionsCm?: { l: number; w: number; h: number } | null,
  roomDimensions?: { widthM: number; depthM: number; heightM: number } | null,
): string {
  if (!dimensionsCm || !(dimensionsCm.l > 0) || !(dimensionsCm.h > 0)) return "";

  const roomNote = roomDimensions
    ? ` The room itself measures approximately ${roomDimensions.widthM.toFixed(1)}m wide by ` +
      `${roomDimensions.depthM.toFixed(1)}m deep with a ${roomDimensions.heightM.toFixed(1)}m ceiling, so this ` +
      `product occupies roughly ${Math.round((dimensionsCm.l / 100 / roomDimensions.widthM) * 100)}% of the ` +
      "room's width — size it in frame accordingly, accounting for how far from the camera it sits."
    : "";

  return (
    ` PHYSICAL DIMENSIONS — the product measures exactly ${Math.round(dimensionsCm.l)}cm wide, ` +
    `${Math.round(dimensionsCm.w)}cm deep and ${Math.round(dimensionsCm.h)}cm high in the real world. Render it ` +
    "at precisely that size relative to the room, using the architectural references actually visible in the " +
    "photograph to calibrate: a standard interior door is about 200cm high and 80cm wide, a light switch sits " +
    "at about 105cm, a power outlet at about 30cm, a kitchen worktop at 90cm, a window sill typically between " +
    "90cm and 100cm, and floorboards are commonly 15–20cm wide. Cross-check against the known size of " +
    "furniture already in the room. Getting this wrong in either direction is a serious error: an oversized " +
    "render sells a customer something that will not physically fit their room, and an undersized one " +
    `misrepresents what they are buying.${roomNote}`
  );
}

/** Wall/floor plane orientation, so a product sits flush against a receding surface instead of facing the camera. */
export function wallAngleDirection(wallAngleDeg?: number): string {
  if (wallAngleDeg === undefined) return "";
  if (Math.abs(wallAngleDeg) <= 2) {
    return (
      " The surface at that position faces the camera directly, with no visible perspective recession — keep " +
      "the product's front face parallel to the camera plane."
    );
  }
  const direction = wallAngleDeg > 0 ? "receding away to the right" : "receding away to the left";
  return (
    ` The wall or floor plane at that position recedes at approximately ${Math.round(wallAngleDeg)}° from the ` +
    `camera (${direction}, matching this photograph's actual vanishing lines) — rotate the product so its ` +
    "parallel edges (front face, top, base) align exactly with that plane. It must lie flush and parallel " +
    "against its real surface, not face the camera head-on."
  );
}

/**
 * The full art-director brief for inserting ONE product — assembled in the
 * order a retoucher would actually work: what the job is, where it goes,
 * how big it really is, how it must be lit and photographed, what it's
 * made of, and finally what must not change.
 */
export function buildProductInsertionPrompt(opts: {
  category: ProductCategory;
  productDescription: string | null;
  box: DetectionBox;
  /** True when the caller supplied an exact placement (user-adjusted or agent-chosen) rather than a category default. */
  explicitBox: boolean;
  /** Prose fallback for where to put it when no explicit box was given. */
  placementHint: string;
  wallAngleDeg?: number;
  dimensionsCm?: { l: number; w: number; h: number } | null;
  roomDimensions?: { widthM: number; depthM: number; heightM: number } | null;
  /** Masked edits get MASK_DISCIPLINE; the unmasked path gets PRESERVE_ROOM_DISCIPLINE instead. */
  masked: boolean;
  /** Set when the model is given the product as a second reference image (OpenAI); false for text-only models (FLUX). */
  hasReferenceImage: boolean;
}): string {
  const {
    category,
    productDescription,
    box,
    explicitBox,
    placementHint,
    wallAngleDeg,
    dimensionsCm,
    roomDimensions,
    masked,
    hasReferenceImage,
  } = opts;

  const brief = hasReferenceImage
    ? "You are a professional architectural retoucher. The first image is a photograph of a real room. The " +
      "second image is a photograph of a real product. Your task is to composite that exact product into that " +
      "exact room, to a standard that would pass as unretouched interior photography in a design magazine."
    : "You are a professional architectural retoucher compositing a real product into a photograph of a real " +
      "room, to a standard that would pass as unretouched interior photography in a design magazine.";

  const subject = ` The product is a ${category}${productDescription ? `: ${productDescription}` : ""}.` +
    (hasReferenceImage
      ? " Reproduce the EXACT product shown in the reference image. Never substitute a different piece, even " +
        "if another would suit the room better, and never omit it — if the reference is ambiguous, render the " +
        "closest possible likeness rather than defaulting to a generic object of that type."
      : "");

  const position = explicitBox
    ? ` Place it in the ${describeRoughLocation(box)} of the frame — that position is the exact intended ` +
      "placement, chosen deliberately; fit the product naturally there rather than relocating it."
    : ` Place it in the ${describeRoughLocation(box)} of the frame, positioned the way it would genuinely sit ` +
      `in a lived-in room: ${placementHint}.`;

  const grounding =
    " Ground it exactly on the real floor plane at that position — resting flush, never floating above it or " +
    "sinking into it.";

  return (
    brief +
    subject +
    position +
    grounding +
    wallAngleDirection(wallAngleDeg) +
    scaleGroundingDirection(dimensionsCm, roomDimensions) +
    LIGHTING_MATCH_DIRECTION +
    CAMERA_MATCH_DIRECTION +
    MATERIAL_FIDELITY_DIRECTION +
    (masked ? MASK_DISCIPLINE : PRESERVE_ROOM_DISCIPLINE) +
    CATALOG_ONLY_CONSTRAINT +
    NO_PEOPLE_INSTRUCTION
  );
}

/**
 * Erasing an existing object. Shares the optical/lighting language with
 * insertion — the reconstructed background has exactly the same problem of
 * having to match the camera that shot the rest of the frame — and carries
 * its own version of the catalogue-only rule: a model asked to erase a sofa
 * will often fill the gap with a "nicer" replacement, which is the same
 * unpurchasable-object failure in reverse.
 */
export function buildRemovalPrompt(category: ProductCategory, description?: string): string {
  const target = description ? `the ${category} (${description})` : `the ${category}`;
  return (
    "You are a professional architectural retoucher. Remove " +
    target +
    " from the masked region of this room photograph completely, as though it had never been in the room. " +
    "Reconstruct what would realistically be behind and beneath it: continue the wall surface, its colour and " +
    "any texture or trim; continue the floor with its real material, plank or tile direction and grout lines " +
    "unbroken through the vacated area; and restore the lighting and soft shadowing that would fall on that " +
    "now-empty surface, including the removal of any shadow the object itself was casting. " +
    "Match the photograph's existing grain, noise and colour temperature so the reconstructed area is " +
    "indistinguishable from the surrounding pixels. " +
    "Leave the vacated space EMPTY. Do not replace the removed object with anything, do not substitute a " +
    "different piece of furniture, and do not add any rug, plant, artwork, cushion or decorative object to " +
    "fill the gap — an empty floor or a bare wall is the correct and desired result." +
    MASK_DISCIPLINE
  );
}
