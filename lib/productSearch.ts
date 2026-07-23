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

/**
 * A JSON schema on a tool definition is a hint to the model, not an
 * enforced contract — a real Designer Agent call sent keywords as a plain
 * string instead of an array (a known LLM tool-call quirk) and crashed
 * `.map`. Every field here is untrusted input from an LLM's tool_use
 * block, so coerce defensively rather than trust the declared shape.
 */
function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string" && v.length > 0);
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

function toFiniteNumber(value: unknown): number | undefined {
  const n = typeof value === "string" ? Number.parseFloat(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
}

export function searchProducts(products: Product[], filters: ProductSearchFilters): Product[] {
  const category = typeof filters.category === "string" ? (filters.category as ProductCategory) : undefined;
  const maxPrice = toFiniteNumber(filters.maxPrice);
  const minPrice = toFiniteNumber(filters.minPrice);
  const maxWidthCm = toFiniteNumber(filters.maxWidthCm);
  const limit = toFiniteNumber(filters.limit) ?? 8;
  const keywords = toStringArray(filters.keywords);
  const styleIds = toStringArray(filters.styleIds);

  const pool = products.filter((p) => {
    if (category && p.category !== category) return false;
    if (maxPrice !== undefined && p.price > maxPrice) return false;
    if (minPrice !== undefined && p.price < minPrice) return false;
    if (maxWidthCm !== undefined && p.dimensionsCm && p.dimensionsCm.l > maxWidthCm) return false;
    return true;
  });

  const lowerKeywords = keywords.map((k) => k.toLowerCase());

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

/**
 * Matches a free-text description (from Claude vision, describing an
 * object it saw in a photo — see lib/ai/locate.ts's detectUnaccountedItems)
 * against OUR OWN catalog, for turning AI-staged extras into purchasable
 * hotspots. Deliberately its own small scoring pass rather than reusing
 * searchProducts: that function always returns its `limit` best-effort
 * results even at score 0 (right for an agent that should get *something*
 * back), which is wrong here — a random unrelated product silently
 * attached to a customer's cart is worse than no match at all. Requires a
 * real minimum keyword overlap; returns null rather than guessing.
 */
export function findBestCatalogMatch(products: Product[], description: string): Product | null {
  const words = description
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 3);
  if (words.length === 0) return null;

  let best: { product: Product; score: number } | null = null;
  for (const p of products) {
    const text = `${p.name} ${p.blurb}`.toLowerCase();
    const score = words.reduce((n, w) => (text.includes(w) ? n + 1 : n), 0);
    if (score > 0 && (!best || score > best.score)) best = { product: p, score };
  }

  const threshold = words.length >= 2 ? 2 : 1;
  return best && best.score >= threshold ? best.product : null;
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
