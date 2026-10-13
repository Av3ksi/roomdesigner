import { hashString, mulberry32 } from "./analysis";
import { BRAND_RETAILER } from "./products";
import type { Product, ProductCategory, StockStatus } from "./types";

/**
 * Presentation fields for the product page, derived from a product's own
 * catalog record. Seeded by product id, so a value is stable across
 * renders and sessions rather than changing on every view.
 *
 * WHAT THIS MODULE MAY AND MAY NOT INVENT — this line moved once already,
 * expensively, and the rule now is: anything a customer could act on must
 * be real.
 *
 * Removed because it was invented and actionable:
 *   - dimensions, previously a random draw per category. A "Kinderbett
 *     90 x 200 cm" rendered as 24 x 16 x 25 cm. Someone measuring their
 *     room was being given a made-up number. Now the supplier's real
 *     figure or nothing.
 *   - colorways beyond the real one — a selectable finish the supplier
 *     may not make.
 *   - materialOptions, an "order it in Forged steel / Hand-blown glass"
 *     picker backed by nothing.
 *   - reviews, with invented reviewer names and templated praise, on a
 *     store that has never sold anything. Misleading advertising under
 *     Swiss UWG Art. 3 — the same statute cited in the imprint.
 *
 * Still derived, deliberately: `stock` and `deliveryDays`. These are
 * presentational placeholders for a storefront with no live inventory
 * feed. Replace them with real supplier stock before taking real orders —
 * they are the last invented values a customer could act on.
 */

export interface ProductColorway {
  name: string;
  hex: string;
}

export interface ProductDetails {
  retailer: string;
  /**
   * The supplier's REAL measurements when the feed provides them
   * (`product.dimensionsCm`), otherwise null.
   *
   * This used to be a random draw from a per-category range, which produced
   * confidently wrong numbers on real products — a "Kinderbett 90 x 200 cm"
   * displayed as 24 × 16 × 25 cm, contradicting its own title. A shopper
   * deciding whether furniture fits their room is the single case where an
   * invented number does real damage, so an unknown size now shows as
   * unknown.
   */
  dimensions: { w: number; d: number; h: number } | null;
  materials: string[];
  colorways: ProductColorway[];
  stock: StockStatus;
  deliveryDays: [number, number];
}

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

const cache = new Map<string, ProductDetails>();

export function getProductDetails(product: Product): ProductDetails {
  const cached = cache.get(product.id);
  if (cached) return cached;

  const rand = mulberry32(hashString(product.id));

  const materials =
    MATERIAL_KEYWORDS.filter((k) => product.blurb.toLowerCase().includes(k)).map(
      (k) => k.charAt(0).toUpperCase() + k.slice(1),
    );
  const finalMaterials = materials.length > 0 ? materials.slice(0, 3) : MATERIAL_DEFAULTS[product.category];

  // ONLY the colour the product actually is. This used to append two or
  // three invented colourways ("Slate", "Walnut") drawn from a hash, which
  // is worse than the other invented specs: a colourway is a selectable
  // purchase option, so a customer could pick a finish the supplier does
  // not make and expect it to arrive. Real per-colour variants need real
  // variant data from the feed.
  const colorways: ProductColorway[] = [{ name: "As shown", hex: product.color }];

  const stockRoll = rand();
  const stock: StockStatus = stockRoll < 0.68 ? "in_stock" : stockRoll < 0.9 ? "low_stock" : "made_to_order";
  const deliveryDays: [number, number] =
    stock === "in_stock" ? [3, 7] : stock === "low_stock" ? [7, 14] : [21, 35];

  const details: ProductDetails = {
    retailer: BRAND_RETAILER[product.brand] ?? `${product.brand} Direct`,
    // Real supplier measurements only. dimensionsCm is l x w x h; the page
    // labels its three figures W x D x H, so length maps to width and width
    // to depth. Null when the feed didn't provide them — see the interface.
    dimensions: product.dimensionsCm
      ? { w: Math.round(product.dimensionsCm.l), d: Math.round(product.dimensionsCm.w), h: Math.round(product.dimensionsCm.h) }
      : null,
    materials: finalMaterials,
    colorways,
    stock,
    deliveryDays,
  };
  cache.set(product.id, details);
  return details;
}

export const STOCK_LABEL: Record<StockStatus, string> = {
  in_stock: "In stock",
  low_stock: "Low stock",
  made_to_order: "Made to order",
};
