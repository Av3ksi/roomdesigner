import type { Product, ProductCategory, RoomAnalysis } from "./types";

/**
 * Picks the best-fitting product per category from a catalog for a given
 * room analysis — the "matching step" from the real-photo workflow: an AI
 * vision model (lib/ai/claude.ts) already reads style and color out of the
 * room photo into RoomAnalysis; this resolves that intent deterministically
 * against real product data, the same split used throughout the app (see
 * buildConceptProducts in lib/products.ts, which this generalizes beyond
 * the single curated catalog so it also works over supplier data — see
 * lib/suppliers/).
 */

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const MAX_RGB_DISTANCE = Math.sqrt(3 * 255 ** 2);

function colorDistance(a: string, b: string): number {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

/** 0 (unrelated) to 1 (near-identical) against the closest palette color. */
function colorScore(productColor: string, palette: { hex: string }[]): number {
  if (palette.length === 0) return 0;
  const closest = Math.min(...palette.map((c) => colorDistance(productColor, c.hex)));
  return 1 - closest / MAX_RGB_DISTANCE;
}

/** The room's #1 style matters far more than its #4 — weight by rank, not just presence. */
function styleScore(productStyles: string[], affinity: { styleId: string; score: number }[]): number {
  let total = 0;
  affinity.forEach(({ styleId, score }, rank) => {
    if (productStyles.includes(styleId)) total += score / (rank + 1);
  });
  return total;
}

export interface MatchedProduct {
  category: ProductCategory;
  product: Product;
  /** Explainable, auditable score — not an LLM's opaque "trust me." */
  matchScore: number;
}

/**
 * One best-fit product per requested category. Style overlap dominates the
 * score (weighted by the room's own style ranking), color proximity to the
 * room's palette breaks ties. Skips a category entirely when the catalog
 * has no candidates rather than forcing an unrelated pick.
 */
export function matchProductsToAnalysis(
  catalog: Product[],
  analysis: RoomAnalysis,
  categories: ProductCategory[],
): MatchedProduct[] {
  const picks: MatchedProduct[] = [];

  for (const category of categories) {
    const pool = catalog.filter((p) => p.category === category);
    if (pool.length === 0) continue;

    const ranked = pool
      .map((product) => ({
        product,
        matchScore: styleScore(product.styles, analysis.styleAffinity) + colorScore(product.color, analysis.colorPalette) * 10,
      }))
      .sort((a, b) => b.matchScore - a.matchScore);

    picks.push({ category, product: ranked[0].product, matchScore: ranked[0].matchScore });
  }

  return picks;
}
