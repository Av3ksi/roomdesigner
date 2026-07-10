import { hashString, mulberry32 } from "./analysis";
import { BRAND_RETAILER } from "./products";
import type { Product, ProductCategory, StockStatus } from "./types";

/**
 * Derives the "spec sheet" fields a premium product page needs — retailer,
 * dimensions, materials, colorways, stock, delivery window, review
 * snippets — deterministically from a product's own catalog record. Kept
 * separate from the lean PRODUCTS catalog so adding a new product never
 * requires hand-authoring a dozen presentation fields: the derivation is
 * seeded by the product id, so it's stable across renders and sessions,
 * and colorway variants (their own synthetic id) get their own independent
 * — but equally stable — stock/review profile, like a real distinct SKU.
 */

export interface ProductColorway {
  name: string;
  hex: string;
}

export interface ProductReview {
  author: string;
  rating: number;
  text: string;
}

export interface ProductDetails {
  retailer: string;
  dimensions: { w: number; d: number; h: number }; // cm
  materials: string[];
  colorways: ProductColorway[];
  stock: StockStatus;
  deliveryDays: [number, number];
  reviews: ProductReview[];
}

const DIM_RANGES: Record<ProductCategory, { w: [number, number]; d: [number, number]; h: [number, number] }> = {
  sofa: { w: [180, 260], d: [85, 100], h: [70, 88] },
  chair: { w: [58, 86], d: [62, 92], h: [74, 108] },
  table: { w: [95, 145], d: [55, 78], h: [34, 46] },
  lighting: { w: [28, 46], d: [28, 46], h: [42, 168] },
  rug: { w: [200, 300], d: [140, 220], h: [1, 2] },
  art: { w: [50, 120], d: [3, 5], h: [60, 120] },
  plant: { w: [30, 55], d: [30, 55], h: [40, 180] },
  storage: { w: [120, 185], d: [40, 56], h: [45, 92] },
  decor: { w: [14, 42], d: [14, 42], h: [14, 46] },
  textile: { w: [40, 62], d: [4, 6], h: [40, 62] },
};

const MATERIAL_DEFAULTS: Record<ProductCategory, string[]> = {
  sofa: ["Solid wood frame", "Upholstery fabric"],
  chair: ["Solid wood frame", "Upholstery fabric"],
  table: ["Solid wood", "Sealed finish"],
  lighting: ["Metal", "Fabric shade"],
  rug: ["Wool blend"],
  art: ["Framed print"],
  plant: ["Ceramic pot", "Live plant"],
  storage: ["Solid wood", "Metal hardware"],
  decor: ["Mixed materials"],
  textile: ["Woven fabric"],
};

const MATERIAL_KEYWORDS = [
  "oak", "walnut", "ash", "teak", "pine", "rattan", "cane", "marble", "travertine",
  "brass", "steel", "iron", "velvet", "leather", "wool", "linen", "bouclé", "cotton",
  "jute", "ceramic", "stoneware", "glass", "alpaca", "silk", "concrete", "washi",
  "rope", "chenille", "twill", "herringbone", "hemp",
];

/**
 * Named colorways carry a characteristic hue/lightness of their own — a
 * "Charcoal" option must actually look charcoal regardless of the product's
 * own base color, so each name is anchored to a target HSL band rather than
 * derived as a small jitter off the base (which washed out on light bases).
 */
const COLORWAY_PROFILES: Record<string, { h: number; s: [number, number]; l: [number, number] }> = {
  Ivory: { h: 42, s: [0.1, 0.16], l: [0.9, 0.94] },
  Charcoal: { h: 220, s: [0.04, 0.09], l: [0.16, 0.22] },
  Sage: { h: 100, s: [0.16, 0.24], l: [0.42, 0.5] },
  Terracotta: { h: 16, s: [0.42, 0.55], l: [0.42, 0.5] },
  Slate: { h: 210, s: [0.08, 0.15], l: [0.28, 0.36] },
  Sand: { h: 38, s: [0.24, 0.34], l: [0.66, 0.74] },
  Walnut: { h: 25, s: [0.32, 0.44], l: [0.2, 0.27] },
};
const COLORWAY_NAMES = ["As shown", ...Object.keys(COLORWAY_PROFILES)];

const REVIEWERS = ["Anna", "Marc", "Sofia", "Lukas", "Elena", "Noah", "Julia", "Théo", "Mira", "Finn", "Clara", "Adrian"];

function reviewTemplates(product: Product, material: string): string[] {
  return [
    `Exactly as described — the ${material.toLowerCase()} is even nicer in person.`,
    `Delivery was quick and it fits perfectly in our space.`,
    `An investment, but worth every bit for the quality.`,
    `Assembly was straightforward — looks incredible with the rest of the room.`,
    `This is our second piece from ${product.brand} — consistently excellent.`,
    `Colour matched the swatch exactly. Very happy with this one.`,
    `Sturdy, well-made, and the finish is beautiful.`,
    `Shipping took a little longer than expected but the piece itself is stunning.`,
  ];
}

function hslToHex(h: number, s: number, l: number): string {
  s = Math.max(0, Math.min(1, s));
  l = Math.max(0, Math.min(1, l));
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let [r, g, b] = [0, 0, 0];
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const to255 = (v: number) => Math.round((v + m) * 255);
  return `#${[to255(r), to255(g), to255(b)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

const cache = new Map<string, ProductDetails>();

export function getProductDetails(product: Product): ProductDetails {
  const cached = cache.get(product.id);
  if (cached) return cached;

  const rand = mulberry32(hashString(product.id));
  const range = DIM_RANGES[product.category];
  const pick = ([lo, hi]: [number, number]) => Math.round(lo + rand() * (hi - lo));

  const materials =
    MATERIAL_KEYWORDS.filter((k) => product.blurb.toLowerCase().includes(k)).map(
      (k) => k.charAt(0).toUpperCase() + k.slice(1),
    );
  const finalMaterials = materials.length > 0 ? materials.slice(0, 3) : MATERIAL_DEFAULTS[product.category];

  const colorways: ProductColorway[] = [{ name: "As shown", hex: product.color }];
  const pool = COLORWAY_NAMES.slice(1);
  const count = 2 + Math.floor(rand() * 2);
  for (let i = 0; i < count && i < pool.length; i++) {
    const idx = Math.floor(rand() * pool.length);
    const name = pool.splice(idx, 1)[0];
    const profile = COLORWAY_PROFILES[name];
    const s = profile.s[0] + rand() * (profile.s[1] - profile.s[0]);
    const l = profile.l[0] + rand() * (profile.l[1] - profile.l[0]);
    colorways.push({ name, hex: hslToHex(profile.h, s, l) });
  }

  const stockRoll = rand();
  const stock: StockStatus = stockRoll < 0.68 ? "in_stock" : stockRoll < 0.9 ? "low_stock" : "made_to_order";
  const deliveryDays: [number, number] =
    stock === "in_stock" ? [3, 7] : stock === "low_stock" ? [7, 14] : [21, 35];

  const templates = reviewTemplates(product, finalMaterials[0] ?? "material");
  const reviewCount = 2 + Math.floor(rand() * 2);
  const usedIdx = new Set<number>();
  const reviews: ProductReview[] = [];
  for (let i = 0; i < reviewCount; i++) {
    let idx = Math.floor(rand() * templates.length);
    let guard = 0;
    while (usedIdx.has(idx) && guard++ < 10) idx = Math.floor(rand() * templates.length);
    usedIdx.add(idx);
    const author = REVIEWERS[Math.floor(rand() * REVIEWERS.length)];
    const rating = product.rating >= 4.6 ? (rand() > 0.25 ? 5 : 4) : rand() > 0.5 ? 5 : 4;
    reviews.push({ author, rating, text: templates[idx] });
  }

  const details: ProductDetails = {
    retailer: BRAND_RETAILER[product.brand] ?? `${product.brand} Direct`,
    dimensions: { w: pick(range.w), d: pick(range.d), h: pick(range.h) },
    materials: finalMaterials,
    colorways,
    stock,
    deliveryDays,
    reviews,
  };
  cache.set(product.id, details);
  return details;
}

export const STOCK_LABEL: Record<StockStatus, string> = {
  in_stock: "In stock",
  low_stock: "Low stock",
  made_to_order: "Made to order",
};
