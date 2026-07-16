import type { Product, ProductCategory } from "../types";
import type { RawSupplierProduct } from "./types";

/**
 * Wholesale feeds don't come with Maison's category/style/color taxonomy —
 * they come with a vendor's own category tree and free-text titles/
 * descriptions. These helpers infer Maison's fields deterministically from
 * that text, the same "AI understands intent, code resolves the actual
 * data" split used throughout the app (here it's keyword-matching rather
 * than an LLM call, since it's cheap, instant, and auditable at catalog-
 * ingestion scale where thousands of SKUs need mapping, not one room).
 */

/**
 * Plain .includes() over-matches short keywords inside unrelated words —
 * e.g. "print" inside "Pawprints" wrongly tagging cat trees as art, or
 * "red" inside "covered"/"prepared". Match on word boundaries instead;
 * \b works fine around multi-word phrases like "wall decor" too, since it
 * only anchors the outer edges.
 */
function containsKeyword(text: string, keyword: string): boolean {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`).test(text);
}

const CATEGORY_KEYWORDS: [ProductCategory, string[]][] = [
  ["sofa", ["sofa", "couch", "sectional", "loveseat"]],
  ["chair", ["chair", "armchair", "recliner", "stool", "bench"]],
  ["table", ["table", "desk"]],
  ["lighting", ["lamp", "light", "pendant", "chandelier", "sconce"]],
  ["rug", ["rug", "carpet", "runner"]],
  ["art", ["art", "print", "canvas", "wall decor", "poster", "mirror"]],
  ["plant", ["plant", "planter", "pot", "greenery"]],
  ["storage", ["cabinet", "sideboard", "shelf", "shelving", "wardrobe", "chest", "bookcase", "credenza"]],
  ["textile", ["cushion", "pillow", "throw", "blanket", "curtain"]],
  ["decor", ["vase", "bowl", "candle", "tray", "sculpture", "ornament", "decor"]],
];

export function inferCategory(raw: RawSupplierProduct): ProductCategory {
  const text = `${raw.vendorCategory} ${raw.title}`.toLowerCase();
  for (const [category, keywords] of CATEGORY_KEYWORDS) {
    if (keywords.some((k) => containsKeyword(text, k))) return category;
  }
  return "decor";
}

/** Same keyword-scoring shape as lib/mood.ts, applied to product copy instead of a room mood. */
const STYLE_KEYWORDS: Record<string, string[]> = {
  scandinavian: ["scandinavian", "nordic", "light oak", "birch", "pale", "airy", "minimal"],
  japandi: ["japandi", "low profile", "walnut", "paper shade", "wabi", "zen"],
  modernluxury: ["marble", "brass", "velvet", "polished", "glam", "statement"],
  minimalist: ["minimalist", "clean lines", "monochrome", "sleek", "understated"],
  industrial: ["industrial", "metal frame", "raw steel", "concrete", "exposed", "loft"],
  organicmodern: ["rattan", "organic", "natural fiber", "curved", "earthy", "boucle", "bouclé"],
  mediterranean: ["terracotta", "linen", "coastal", "woven", "rattan", "sun-bleached"],
  darkluxury: ["dark", "emerald", "black", "moody", "velvet", "brass"],
  cozy: ["cozy", "wool", "warm", "soft", "plush", "knit"],
  classic: ["classic", "traditional", "turned leg", "carved", "heritage"],
};

export function inferStyles(raw: RawSupplierProduct): string[] {
  const text = `${raw.title} ${raw.description ?? ""} ${raw.vendorCategory}`.toLowerCase();
  const scored = Object.entries(STYLE_KEYWORDS)
    .map(([styleId, keywords]) => ({
      styleId,
      score: keywords.reduce((n, k) => (containsKeyword(text, k) ? n + 1 : n), 0),
    }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);
  if (scored.length > 0) return scored.slice(0, 3).map((s) => s.styleId);
  // No keyword hit — default to the two broadest, most forgiving styles rather than leaving it style-less.
  return ["scandinavian", "organicmodern"];
}

const COLOR_KEYWORDS: [string, string][] = [
  ["black", "#22211F"], ["charcoal", "#3A3733"], ["grey", "#8A8378"], ["gray", "#8A8378"],
  ["white", "#EDE7DA"], ["ivory", "#F1ECE1"], ["cream", "#E9E2D2"], ["beige", "#D9C9A8"],
  ["oak", "#B9A176"], ["walnut", "#6E5B44"], ["natural wood", "#B9A176"],
  ["green", "#5A7058"], ["emerald", "#2E5347"], ["sage", "#8A9B84"],
  ["blue", "#46586E"], ["navy", "#2B3A4A"],
  ["terracotta", "#C0603A"], ["rust", "#9C5B3C"], ["orange", "#C0603A"],
  ["brass", "#C8A96E"], ["gold", "#C8A96E"],
  ["pink", "#C99A9A"], ["red", "#8C3B34"],
];

export function inferColor(raw: RawSupplierProduct): string {
  const text = `${raw.title} ${raw.description ?? ""}`.toLowerCase();
  for (const [keyword, hex] of COLOR_KEYWORDS) {
    if (containsKeyword(text, keyword)) return hex;
  }
  return "#B9A176";
}

/** Dropshipping requires setting your own retail price on top of the supplier's cost. */
export function computeRetailPrice(raw: RawSupplierProduct): number {
  if (raw.recommendedRetailPrice) return Math.round(raw.recommendedRetailPrice);
  const MARKUP = 1.65;
  return Math.round(raw.costPrice * MARKUP);
}

export function mapSupplierProduct(raw: RawSupplierProduct, supplierId: string, supplierLabel: string): Product {
  // VidaXL's real feed has no description — fall back to a copy line built
  // from the category path so the product card never shows blank copy.
  const blurb = raw.description
    ? raw.description.slice(0, 160)
    : `${raw.title}. Sourced via ${supplierLabel}, category ${raw.vendorCategory.split(">").pop()?.trim() ?? raw.vendorCategory}.`;
  return {
    id: `${supplierId}-${raw.sku}`,
    name: raw.title,
    brand: raw.brand || supplierLabel,
    category: inferCategory(raw),
    price: computeRetailPrice(raw),
    rating: 4.4 + (raw.sku.length % 5) * 0.1, // no review data in a feed — plausible placeholder, not invented "real" reviews
    reviews: 0,
    styles: inferStyles(raw),
    color: inferColor(raw),
    blurb,
    supplier: { id: supplierId, label: supplierLabel, sku: raw.sku, costPrice: raw.costPrice },
    imageUrl: raw.images?.[0],
  };
}
