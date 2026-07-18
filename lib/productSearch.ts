import type { Product, ProductCategory } from "./types";

/**
 * Structured product search the Designer Agent calls as a tool. Filters are
 * hard (category, price, physical width); keyword relevance is soft scoring
 * over title/blurb text.
 *
 * v1 honesty: the catalog's titles/blurbs are German (VidaXL CH-DE feed) and
 * there's no enrichment layer yet, so keyword translation is the *agent's*
 * job — its system prompt tells it to search with German terms ("schwarz",
 * "eiche"). The blueprint's Phase-1 catalog sync (batch LLM enrichment +
 * embeddings in Postgres) replaces this file's keyword scoring wholesale;
 * keep it thin.
 */

export interface ProductSearchFilters {
  category?: ProductCategory;
  maxPrice?: number;
  minPrice?: number;
  /** Soft relevance terms matched against title+blurb (agent supplies German terms). */
  keywords?: string[];
  /** Hard cap on the product's real width (dimensionsCm.l) — for wall-fit constraints. */
  maxWidthCm?: number;
  /** Soft boost for style overlap. */
  styleIds?: string[];
  limit?: number;
}

export function searchProducts(products: Product[], filters: ProductSearchFilters): Product[] {
  const { category, maxPrice, minPrice, keywords = [], maxWidthCm, styleIds = [], limit = 8 } = filters;

  const pool = products.filter((p) => {
    if (category && p.category !== category) return false;
    if (maxPrice !== undefined && p.price > maxPrice) return false;
    if (minPrice !== undefined && p.price < minPrice) return false;
    if (maxWidthCm !== undefined && p.dimensionsCm && p.dimensionsCm.l > maxWidthCm) return false;
    return true;
  });

  const lowerKeywords = keywords.map((k) => k.toLowerCase()).filter(Boolean);

  const scored = pool.map((p) => {
    const text = `${p.name} ${p.blurb}`.toLowerCase();
    const keywordHits = lowerKeywords.reduce((n, k) => (text.includes(k) ? n + 1 : n), 0);
    const styleHits = styleIds.reduce((n, s) => (p.styles.includes(s) ? n + 1 : n), 0);
    return { p, score: keywordHits * 2 + styleHits };
  });

  // When the caller gave relevance signals, require at least one hit rather
  // than returning arbitrary products that merely passed the hard filters.
  const relevant = lowerKeywords.length > 0 || styleIds.length > 0 ? scored.filter((s) => s.score > 0) : scored;
  // Fall back to the hard-filtered pool if relevance came up empty — an empty
  // result with a "did you mean" is worse than close-but-imperfect options.
  const final = relevant.length > 0 ? relevant : scored;

  return final
    .sort((a, b) => b.score - a.score || a.p.price - b.p.price)
    .slice(0, limit)
    .map((s) => s.p);
}

/** Compact representation sent back to the agent — keeps tool results small. */
export function toAgentProductSummary(p: Product) {
  return {
    id: p.id,
    name: p.name,
    category: p.category,
    priceChf: p.price,
    dimensionsCm: p.dimensionsCm ?? null,
    color: p.color,
    styles: p.styles,
    hasPhoto: Boolean(p.imageUrl),
  };
}
