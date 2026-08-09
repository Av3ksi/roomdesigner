import { randomUUID } from "node:crypto";
import type { DesignStyle, Product } from "../types";
import { generateImageWithRetry } from "./openaiImageGen";

/**
 * Custom AI-generated wall art, sized to a REAL Gelato print product —
 * this is what fills the "art" slot in scripts/generate-showroom-rooms.ts
 * instead of hoping the catalog happens to have a matching print. Nothing
 * to source, no dimension guessing (the CJ problem): a poster's on-wall
 * size IS the paper size, no packaging-vs-real-item ambiguity at all.
 *
 * The Gelato productUid below (sku) is a CONSTRUCTED GUESS, same
 * unverified status as scripts/gelato-test-fetch.ts's — built from real
 * confirmed attribute value UIDs (that script's own catalog fetch) and
 * the naming pattern seen on a real returned product, but not yet
 * confirmed to resolve with a 200. Correcting it later (once confirmed)
 * is a one-line change here — it doesn't touch the generated artwork or
 * its real-world size, which are independent of the exact SKU string.
 * costPrice/price are placeholders for the same reason: Gelato's real
 * price for this productUid hasn't been confirmed back yet either
 * (scripts/gelato-test-fetch.ts fetches /prices, but no successful
 * response has come back as of this file's writing).
 */
export const STANDARD_POSTER = {
  gelatoProductUid: "posters_pf_A3_pt_170-gsm-uncoated_cl_4-0_ver",
  widthCm: 29.7,
  heightCm: 42,
  label: "A3 (29.7 × 42 cm)",
  // Placeholder until scripts/gelato-test-fetch.ts's price call is
  // confirmed against a real response — a plausible number for a framed
  // A3 print, not a real Gelato quote yet.
  provisionalRetailPriceChf: 45,
  provisionalCostPriceChf: 18,
};

/**
 * Portrait 1024x1536 is the closest OpenAI generation size to A3's
 * portrait aspect ratio (0.707) — not an exact match (no crop/pad step
 * here yet), close enough that the final composite's real-world scaling
 * (via dimensionsCm below) is what actually matters for on-image size,
 * not the source image's raw pixel aspect ratio.
 */
export async function generatePosterArtwork(
  style: DesignStyle,
  roomTitle: string,
  quality: "low" | "medium" | "high",
): Promise<Buffer> {
  const prompt =
    `Design a museum-quality fine art print for a gallery wall, in the spirit of ${roomTitle}. ` +
    `${style.name} sensibility (${style.tagline}): ${style.description} Use only this palette: ` +
    `${style.palette.join(", ")}, plus the paper's own white/cream ground. ` +
    "A single confident abstract or botanical-line composition — generous negative space, gallery-print " +
    "quality, portrait orientation, museum framing conventions (clean margins, no visible frame in the " +
    "image itself — just the artwork, edge to edge). No text, no signature, no watermark, no border, no " +
    "photograph of a wall or room — this is the print itself, not a mockup of it hanging somewhere.";

  return generateImageWithRetry(prompt, quality, "1024x1536");
}

/** Builds the catalog Product row for a generated poster — caller is responsible for persisting it (see lib/productSearchDb.ts's upsertProduct). */
export function buildPosterProduct(style: DesignStyle, roomTitle: string): Product {
  return {
    id: `gelato-poster-${randomUUID()}`,
    name: `${style.name} Gallery Print — ${STANDARD_POSTER.label}`,
    brand: "Vistroom Studio",
    category: "art",
    price: STANDARD_POSTER.provisionalRetailPriceChf,
    rating: 5,
    reviews: 0,
    styles: [style.id],
    color: style.palette[0] ?? "#EDE7DA",
    blurb: `A one-of-a-kind print generated for "${roomTitle}", printed on demand via Gelato at ${STANDARD_POSTER.label}.`,
    supplier: {
      id: "gelato",
      label: "Gelato (print on demand)",
      sku: STANDARD_POSTER.gelatoProductUid,
      costPrice: STANDARD_POSTER.provisionalCostPriceChf,
    },
    // Depth is a placeholder for a thin unframed print — not from Gelato's
    // real packaging dimensions (unconfirmed, see module doc comment).
    dimensionsCm: { l: STANDARD_POSTER.widthCm, w: 1, h: STANDARD_POSTER.heightCm },
  };
}
