import type { BudgetTier, Product, ProductCategory } from "./types";

/**
 * Curated marketplace catalog. In production this is fed by retail partner
 * APIs; here it's a representative slice with real-world-plausible pricing.
 */
export const PRODUCTS: Product[] = [
  // ——— Sofas ———
  { id: "sofa-oslo", name: "Oslo 3-Seater", brand: "Nordhem", category: "sofa", price: 1890, rating: 4.8, reviews: 412, styles: ["scandinavian", "minimalist", "organicmodern"], color: "#D6D1C6", blurb: "Feather-wrapped cushions in undyed bouclé, solid oak base." },
  { id: "sofa-kyo", name: "Kyō Low Sofa", brand: "Mokuzai", category: "sofa", price: 2340, rating: 4.9, reviews: 188, styles: ["japandi", "minimalist", "organicmodern"], color: "#A79680", blurb: "28cm seat height, kiln-dried ash frame, linen-hemp weave." },
  { id: "sofa-hollis", name: "Hollis Sofa", brand: "Ferndale", category: "sofa", price: 2150, rating: 4.7, reviews: 356, styles: ["cozy", "mediterranean"], color: "#C46F35", blurb: "Burnt-sienna wool twill on tapered walnut legs. Instant warmth." },
  { id: "sofa-foundry", name: "Foundry Leather Sofa", brand: "Iron & Hide", category: "sofa", price: 2890, rating: 4.8, reviews: 264, styles: ["industrial", "cozy", "classic"], color: "#9C5B3C", blurb: "Full-grain cognac leather that earns its patina, steel frame." },
  { id: "sofa-marais", name: "Marais Velvet Sofa", brand: "Élan Paris", category: "sofa", price: 3450, rating: 4.9, reviews: 143, styles: ["darkluxury"], color: "#2E5347", blurb: "Emerald cotton velvet, fluted back, brass sabots." },
  { id: "sofa-dune", name: "Dune Slipcover Sofa", brand: "Saltair", category: "sofa", price: 1720, rating: 4.6, reviews: 298, styles: ["organicmodern", "mediterranean", "scandinavian"], color: "#E4E1D6", blurb: "Washable Belgian linen slipcover, deep lounge seat." },
  { id: "sofa-lucerne", name: "Lucerne Curved Sofa", brand: "Alpina Haus", category: "sofa", price: 3280, rating: 4.9, reviews: 87, styles: ["modernluxury", "organicmodern", "darkluxury"], color: "#E3DCCD", blurb: "Sculptural crescent in cream bouclé, Swiss-made frame, 25-year warranty." },
  { id: "sofa-windsor", name: "Windsor Tailored Sofa", brand: "Harlow House", category: "sofa", price: 2680, rating: 4.7, reviews: 176, styles: ["classic", "darkluxury"], color: "#46586E", blurb: "Navy wool herringbone, turned walnut legs, hand-tied springs." },

  // ——— Chairs ———
  { id: "chair-arne", name: "Arne Lounge Chair", brand: "Nordhem", category: "chair", price: 740, rating: 4.7, reviews: 231, styles: ["scandinavian", "minimalist", "organicmodern"], color: "#B9A98C", blurb: "Steam-bent oak shell, wool-felt pad." },
  { id: "chair-ryo", name: "Ryō Accent Chair", brand: "Mokuzai", category: "chair", price: 890, rating: 4.8, reviews: 117, styles: ["japandi", "organicmodern"], color: "#6E5B44", blurb: "Paper-cord seat, charred-ash frame." },
  { id: "chair-havana", name: "Havana Rattan Chair", brand: "Terra Verde", category: "chair", price: 520, rating: 4.6, reviews: 342, styles: ["mediterranean", "organicmodern", "cozy"], color: "#C8A96E", blurb: "Hand-woven rattan wingback with kilim cushion." },
  { id: "chair-gatsby", name: "Gatsby Cocktail Chair", brand: "Élan Paris", category: "chair", price: 980, rating: 4.7, reviews: 96, styles: ["darkluxury", "modernluxury", "classic"], color: "#C8A96E", blurb: "Channel-tufted velvet barrel chair on brass ring base." },
  { id: "chair-forge", name: "Forge Sling Chair", brand: "Iron & Hide", category: "chair", price: 640, rating: 4.5, reviews: 154, styles: ["industrial", "cozy"], color: "#5E4630", blurb: "Saddle-leather sling on blackened steel frame." },

  // ——— Tables ———
  { id: "table-lumi", name: "Lumi Coffee Table", brand: "Nordhem", category: "table", price: 460, rating: 4.6, reviews: 289, styles: ["scandinavian", "minimalist", "organicmodern", "cozy"], color: "#C9A876", blurb: "White-oiled oak, soft-radius oval top. Kid-approved edges." },
  { id: "table-en", name: "En Low Table", brand: "Mokuzai", category: "table", price: 620, rating: 4.8, reviews: 134, styles: ["japandi", "minimalist"], color: "#8A6B44", blurb: "22cm-high kotatsu-inspired table in smoked oak." },
  { id: "table-jura", name: "Jura Oak Table", brand: "Zürich Atelier", category: "table", price: 780, rating: 4.8, reviews: 112, styles: ["scandinavian", "japandi", "organicmodern", "classic", "cozy"], color: "#A98F63", blurb: "Swiss oak, hand-oiled, rounded live edge. Built for generations." },
  { id: "table-girder", name: "Girder Steel Table", brand: "Iron & Hide", category: "table", price: 540, rating: 4.5, reviews: 176, styles: ["industrial"], color: "#3A3733", blurb: "Blackened steel I-beam base, reclaimed fir top." },
  { id: "table-noir", name: "Noir Marble Table", brand: "Élan Paris", category: "table", price: 1240, rating: 4.8, reviews: 87, styles: ["darkluxury", "modernluxury", "minimalist"], color: "#2B2B29", blurb: "Nero Marquina marble drum with brass reveal." },
  { id: "table-driftwood", name: "Driftwood Table", brand: "Saltair", category: "table", price: 480, rating: 4.5, reviews: 154, styles: ["mediterranean", "organicmodern"], color: "#BCA378", blurb: "Washed-teak slab on rope-wrapped legs." },
  { id: "table-carrara", name: "Carrara Oval Table", brand: "Harlow House", category: "table", price: 1080, rating: 4.7, reviews: 93, styles: ["classic", "modernluxury", "mediterranean"], color: "#D9D4CA", blurb: "White Carrara top, fluted walnut column base." },

  // ——— Lighting ———
  { id: "light-halo", name: "Halo Floor Lamp", brand: "Lumafabrik", category: "lighting", price: 320, rating: 4.7, reviews: 265, styles: ["scandinavian", "minimalist", "organicmodern"], color: "#3D3A34", blurb: "Paper-shade column, dim-to-warm LED." },
  { id: "light-akari", name: "Akari Paper Lantern", brand: "Lumafabrik", category: "lighting", price: 240, rating: 4.9, reviews: 388, styles: ["japandi", "scandinavian", "mediterranean", "cozy"], color: "#F1ECE1", blurb: "Hand-pressed washi pendant, bamboo ribs." },
  { id: "light-arc", name: "Arco Arc Lamp", brand: "Ferndale", category: "lighting", price: 580, rating: 4.8, reviews: 199, styles: ["modernluxury", "industrial", "minimalist"], color: "#B08D4F", blurb: "Sweeping brass arc with marble counterweight." },
  { id: "light-fabrik", name: "Fabrik Tripod Lamp", brand: "Iron & Hide", category: "lighting", price: 290, rating: 4.5, reviews: 142, styles: ["industrial", "cozy"], color: "#22211F", blurb: "Theatre-light tripod in raw steel." },
  { id: "light-empire", name: "Empire Table Lamp", brand: "Élan Paris", category: "lighting", price: 410, rating: 4.7, reviews: 76, styles: ["darkluxury", "classic"], color: "#C8A96E", blurb: "Stepped brass base, pleated silk shade." },
  { id: "light-glarus", name: "Glarus Brass Lamp", brand: "Alpina Haus", category: "lighting", price: 360, rating: 4.8, reviews: 104, styles: ["modernluxury", "classic", "darkluxury", "cozy"], color: "#C8A96E", blurb: "Solid Swiss brass, dim-to-warm, lifetime serviceable." },

  // ——— Rugs ———
  { id: "rug-fjord", name: "Fjord Wool Rug 250", brand: "Væv", category: "rug", price: 690, rating: 4.8, reviews: 224, styles: ["scandinavian", "minimalist", "organicmodern"], color: "#E3DDD0", blurb: "Undyed Norwegian wool, flat weave, 250×180." },
  { id: "rug-tatami", name: "Tatami Weave Rug", brand: "Væv", category: "rug", price: 560, rating: 4.7, reviews: 132, styles: ["japandi", "minimalist", "organicmodern"], color: "#D8CDB6", blurb: "Jute-wool blend in tea tones, low profile." },
  { id: "rug-souk", name: "Souk Berber Rug", brand: "Atlas Loom", category: "rug", price: 820, rating: 4.9, reviews: 301, styles: ["mediterranean", "cozy", "industrial"], color: "#C0603A", blurb: "Hand-knotted Beni Ourain style, terracotta diamond." },
  { id: "rug-deco", name: "Deco Fan Rug", brand: "Élan Paris", category: "rug", price: 940, rating: 4.6, reviews: 68, styles: ["darkluxury", "classic"], color: "#1B2F29", blurb: "Emerald ground with brass fan motif, cut pile." },
  { id: "rug-alpen", name: "Alpen Wool Rug", brand: "Zürich Atelier", category: "rug", price: 840, rating: 4.8, reviews: 96, styles: ["cozy", "classic", "modernluxury", "scandinavian"], color: "#D9C9A8", blurb: "Swiss alpine wool, dense hand-loomed pile, undyed banding." },

  // ——— Art ———
  { id: "art-line", name: "Line Study No. 4", brand: "Galerie M", category: "art", price: 260, rating: 4.7, reviews: 88, styles: ["scandinavian", "minimalist", "japandi", "modernluxury"], color: "#3D3A34", blurb: "Single-line figure print, oak float frame, 70×100." },
  { id: "art-terra", name: "Terra Forms Diptych", brand: "Galerie M", category: "art", price: 340, rating: 4.6, reviews: 74, styles: ["mediterranean", "cozy", "organicmodern"], color: "#C0603A", blurb: "Abstract earth-pigment pair, 50×70 each." },
  { id: "art-gilt", name: "Gilt Horizon", brand: "Galerie M", category: "art", price: 520, rating: 4.8, reviews: 51, styles: ["darkluxury", "modernluxury", "industrial", "classic"], color: "#C8A96E", blurb: "Gold-leaf horizon on deep green ground, 90×120." },

  // ——— Plants ———
  { id: "plant-olive", name: "Olive Tree 140cm", brand: "Verdant", category: "plant", price: 180, rating: 4.6, reviews: 412, styles: ["scandinavian", "mediterranean", "minimalist", "organicmodern", "modernluxury", "classic"], color: "#8A9B84", blurb: "Live olive in raw terracotta, 140cm." },
  { id: "plant-monstera", name: "Monstera Deliciosa", brand: "Verdant", category: "plant", price: 120, rating: 4.8, reviews: 633, styles: ["mediterranean", "cozy", "industrial", "organicmodern"], color: "#5C7350", blurb: "Statement monstera, 90cm, ceramic pot." },
  { id: "plant-bonsai", name: "Ficus Bonsai", brand: "Verdant", category: "plant", price: 210, rating: 4.7, reviews: 156, styles: ["japandi", "darkluxury"], color: "#6E7F5C", blurb: "Ten-year ficus on charred-oak stand." },

  // ——— Storage ———
  { id: "storage-frame", name: "Frame Sideboard", brand: "Nordhem", category: "storage", price: 980, rating: 4.7, reviews: 187, styles: ["scandinavian", "minimalist", "organicmodern", "cozy"], color: "#C9A876", blurb: "Reeded oak doors, push-open, cable-managed." },
  { id: "storage-shoji", name: "Shōji Cabinet", brand: "Mokuzai", category: "storage", price: 1240, rating: 4.8, reviews: 92, styles: ["japandi"], color: "#8A6B44", blurb: "Sliding washi-glass doors on smoked ash." },
  { id: "storage-vault", name: "Vault Locker Console", brand: "Iron & Hide", category: "storage", price: 760, rating: 4.5, reviews: 121, styles: ["industrial"], color: "#3A3733", blurb: "Powder-black steel console with mesh doors." },
  { id: "storage-fluted", name: "Fluted Bar Cabinet", brand: "Élan Paris", category: "storage", price: 1680, rating: 4.9, reviews: 63, styles: ["darkluxury", "classic", "modernluxury"], color: "#26443A", blurb: "Fluted walnut, mirrored interior, brass pulls." },
  { id: "storage-rialto", name: "Rialto Credenza", brand: "Harlow House", category: "storage", price: 1120, rating: 4.6, reviews: 78, styles: ["mediterranean", "classic", "modernluxury"], color: "#B98A5C", blurb: "Limewashed oak, cane doors, travertine top." },

  // ——— Decor & textiles ———
  { id: "decor-vase", name: "Kama Stone Vases (3)", brand: "Studio Ilta", category: "decor", price: 140, rating: 4.6, reviews: 203, styles: ["japandi", "scandinavian", "minimalist", "organicmodern", "modernluxury", "cozy"], color: "#B9A98C", blurb: "Hand-thrown stoneware trio in oat glazes." },
  { id: "decor-mirror", name: "Sunburst Mirror", brand: "Élan Paris", category: "decor", price: 380, rating: 4.7, reviews: 85, styles: ["darkluxury", "mediterranean", "classic"], color: "#C8A96E", blurb: "Brass-rayed 80cm wall mirror." },
  { id: "decor-candle", name: "Forge Candleholders", brand: "Iron & Hide", category: "decor", price: 95, rating: 4.5, reviews: 148, styles: ["industrial", "minimalist", "darkluxury"], color: "#22211F", blurb: "Hand-forged steel taper set." },
  { id: "textile-throw", name: "Alpaca Throw", brand: "Væv", category: "textile", price: 190, rating: 4.9, reviews: 356, styles: ["scandinavian", "minimalist", "cozy", "japandi", "organicmodern", "classic"], color: "#E9E5DC", blurb: "Baby-alpaca herringbone, undyed." },
  { id: "textile-kilim", name: "Kilim Cushion Set", brand: "Atlas Loom", category: "textile", price: 160, rating: 4.7, reviews: 267, styles: ["mediterranean", "cozy", "industrial"], color: "#C0603A", blurb: "Vintage kilim fronts, linen backs, set of 3." },
  { id: "textile-velvet", name: "Velvet Cushion Set", brand: "Élan Paris", category: "textile", price: 220, rating: 4.6, reviews: 112, styles: ["darkluxury", "modernluxury", "classic"], color: "#2E5347", blurb: "Emerald + brass piped velvet, set of 3." },
];

export const PRODUCT_MAP: Record<string, Product> = Object.fromEntries(
  PRODUCTS.map((p) => [p.id, p]),
);

/** Retail partner home country — powers "only Swiss stores"-style requests. */
export const BRAND_COUNTRY: Record<string, string> = {
  Nordhem: "Sweden",
  Mokuzai: "Japan",
  Ferndale: "USA",
  "Iron & Hide": "USA",
  "Élan Paris": "France",
  Saltair: "Australia",
  Væv: "Denmark",
  "Atlas Loom": "Morocco",
  Lumafabrik: "Germany",
  Verdant: "Netherlands",
  "Galerie M": "France",
  "Studio Ilta": "Finland",
  "Terra Verde": "Portugal",
  "Alpina Haus": "Switzerland",
  "Zürich Atelier": "Switzerland",
  "Harlow House": "UK",
};

export const BRANDS = Array.from(new Set(PRODUCTS.map((p) => p.brand))).sort();

export const brandsFromCountry = (country: string) =>
  BRANDS.filter((b) => BRAND_COUNTRY[b] === country);

/** Storefront a brand's products are fulfilled through — distinct from the brand itself. */
export const BRAND_RETAILER: Record<string, string> = {
  Nordhem: "Nordic Living Co.",
  Mokuzai: "Mokuzai Studio",
  Ferndale: "Ferndale & Co.",
  "Iron & Hide": "Forge District",
  "Élan Paris": "Maison Élan",
  Saltair: "Saltair Home",
  "Alpina Haus": "Alpina Haus Direct",
  "Harlow House": "Harlow House Interiors",
  "Terra Verde": "Terra Verde Living",
  Lumafabrik: "Lumafabrik Lighting",
  Væv: "Væv Textiles",
  "Atlas Loom": "Atlas Loom Rugs",
  "Galerie M": "Galerie M Editions",
  Verdant: "Verdant Botanicals",
  "Studio Ilta": "Studio Ilta Ceramics",
  "Zürich Atelier": "Zürich Atelier Direct",
};

/**
 * Classifies a product's price tier relative to its own category — the
 * bottom third of a category is "essential", the top third "luxe". Powers
 * the Essential/Signature/Luxe badge and the compare-versions panel.
 */
export function tierOf(product: Product): BudgetTier {
  const peers = [...PRODUCTS.filter((p) => p.category === product.category)].sort(
    (a, b) => a.price - b.price,
  );
  const idx = peers.findIndex((p) => p.id === product.id);
  if (idx === -1) return "signature";
  const frac = idx / Math.max(1, peers.length - 1);
  return frac < 0.34 ? "essential" : frac < 0.67 ? "signature" : "luxe";
}

/** One representative product per budget tier, for a given category + style. */
export function tierOptions(
  category: ProductCategory,
  styleId: string,
): Partial<Record<BudgetTier, Product>> {
  const pool = [...PRODUCTS.filter((p) => p.category === category && p.styles.includes(styleId))].sort(
    (a, b) => a.price - b.price,
  );
  if (pool.length === 0) return {};
  return {
    essential: pool[0],
    signature: pool[Math.floor((pool.length - 1) / 2)],
    luxe: pool[pool.length - 1],
  };
}

const CONCEPT_CATEGORIES: ProductCategory[] = [
  "sofa",
  "table",
  "rug",
  "lighting",
  "chair",
  "art",
  "storage",
  "plant",
  "textile",
  "decor",
];

/**
 * Deterministically assembles a shopping list for a style + variant.
 * Budget tier steers price point (essential → value picks, luxe → premium),
 * brand preferences narrow the pool when a match exists, and variants rotate
 * alternates so each concept proposes a genuinely different basket.
 */
export function buildConceptProducts(
  styleId: string,
  variant: number,
  budget: "essential" | "signature" | "luxe" = "signature",
  brands: string[] = [],
): Product[] {
  const picks: Product[] = [];
  for (const cat of CONCEPT_CATEGORIES) {
    const pool = PRODUCTS.filter(
      (p) => p.category === cat && p.styles.includes(styleId),
    );
    if (pool.length === 0) continue;
    const branded = brands.length ? pool.filter((p) => brands.includes(p.brand)) : pool;
    const candidates = branded.length ? branded : pool;
    if (budget === "signature") {
      picks.push(candidates[variant % candidates.length]);
      continue;
    }
    const byPrice = [...candidates].sort((a, b) => a.price - b.price);
    const span = Math.min(2, byPrice.length);
    const idx =
      budget === "essential"
        ? variant % span
        : byPrice.length - 1 - (variant % span);
    picks.push(byPrice[idx]);
  }
  return picks;
}

/* ————————————————————————— Shopping AI ————————————————————————— */

/** Similar / cheaper / premium alternatives for a product within its category. */
export function alternativesFor(
  product: Product,
  styleId?: string,
): { similar: Product[]; cheaper: Product[]; premium: Product[] } {
  const pool = PRODUCTS.filter(
    (p) =>
      p.id !== product.id &&
      p.category === product.category &&
      (!styleId || p.styles.includes(styleId) || p.styles.some((s) => product.styles.includes(s))),
  );
  return {
    similar: pool
      .filter((p) => Math.abs(p.price - product.price) <= product.price * 0.3)
      .slice(0, 3),
    cheaper: pool
      .filter((p) => p.price < product.price)
      .sort((a, b) => b.price - a.price)
      .slice(0, 3),
    premium: pool
      .filter((p) => p.price > product.price)
      .sort((a, b) => a.price - b.price)
      .slice(0, 3),
  };
}

/** Resolves an in-place swap for the AI assistant / hotspot swap buttons. */
export function resolveSwap(
  current: Product,
  styleId: string,
  direction: "cheaper" | "premium" | "different",
  brands: string[] = [],
): Product | null {
  const alts = alternativesFor(current, styleId);
  let pool =
    direction === "cheaper"
      ? alts.cheaper
      : direction === "premium"
        ? alts.premium
        : [...alts.similar, ...alts.cheaper, ...alts.premium];
  if (brands.length) {
    const branded = pool.filter((p) => brands.includes(p.brand));
    if (branded.length) pool = branded;
  }
  return pool[0] ?? null;
}

/** Matching accessories (decor, textiles, plants, art) for a style not already owned. */
export function matchingAccessories(styleId: string, ownedIds: string[]): Product[] {
  const owned = new Set(ownedIds);
  const inCategory = (p: Product) => !owned.has(p.id) && ["decor", "textile", "plant", "art"].includes(p.category);
  // Most style tags only carry one product per accessory category, so once
  // the base concept owns it, nothing in-style is left — fall back to the
  // closest unowned accessory of any style rather than showing nothing.
  const inStyle = PRODUCTS.filter((p) => inCategory(p) && p.styles.includes(styleId));
  if (inStyle.length >= 3) return inStyle.slice(0, 3);
  const rest = PRODUCTS.filter((p) => inCategory(p) && !inStyle.includes(p));
  return [...inStyle, ...rest].slice(0, 3);
}

/**
 * Budget AI: greedily swaps the priciest pieces for their cheapest in-style
 * alternates until the room lands under maxBudget (or no swaps remain).
 */
export function fitToBudget(
  products: Product[],
  styleId: string,
  maxBudget: number,
): { products: Product[]; changed: number } {
  let list = [...products];
  let changed = 0;
  const total = () => list.reduce((n, p) => n + p.price, 0);
  for (let guard = 0; guard < 20 && total() > maxBudget; guard++) {
    let bestIdx = -1;
    let bestSaving = 0;
    let bestSwap: Product | null = null;
    list.forEach((p, i) => {
      const cheapest = PRODUCTS.filter(
        (c) =>
          c.category === p.category &&
          c.id !== p.id &&
          c.styles.includes(styleId) &&
          c.price < p.price &&
          !list.some((l) => l.id === c.id),
      ).sort((a, b) => a.price - b.price)[0];
      if (cheapest && p.price - cheapest.price > bestSaving) {
        bestSaving = p.price - cheapest.price;
        bestIdx = i;
        bestSwap = cheapest;
      }
    });
    if (bestIdx === -1 || !bestSwap) {
      // No cheaper alternates left — drop the priciest accessory-tier item.
      const dropIdx = list
        .map((p, i) => ({ p, i }))
        .filter(({ p }) => ["decor", "textile", "art", "plant", "chair"].includes(p.category))
        .sort((a, b) => b.p.price - a.p.price)[0]?.i;
      if (dropIdx === undefined) break;
      list.splice(dropIdx, 1);
      changed++;
      continue;
    }
    list = list.map((p, i) => (i === bestIdx ? bestSwap! : p));
    changed++;
  }
  return { products: list, changed };
}

export function conceptTotal(products: Product[]): number {
  return products.reduce((sum, p) => sum + p.price, 0);
}

export const formatPrice = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "CHF", maximumFractionDigits: 0 });

/* ————————————————————————— Pricing panel ————————————————————————— */

const FURNITURE_CATS: ProductCategory[] = ["sofa", "chair", "table", "storage"];
const DECOR_CATS: ProductCategory[] = ["rug", "art", "plant", "decor", "textile"];

export interface PricingBreakdown {
  furniture: number;
  lighting: number;
  decoration: number;
  installation: number;
  delivery: number;
  total: number;
  monthly: number;
}

/** Estimated white-glove assembly cost, scaled by furniture piece count. */
function estimateInstallation(products: Product[]): number {
  const furniturePieces = products.filter((p) => FURNITURE_CATS.includes(p.category)).length;
  if (furniturePieces === 0) return 0;
  return Math.round(129 + furniturePieces * 42);
}

/** Estimated delivery cost, scaled by total item count. */
function estimateDelivery(products: Product[]): number {
  if (products.length === 0) return 0;
  return Math.min(249, Math.round(59 + products.length * 11));
}

/**
 * Category-grouped pricing for the premium pricing panel. Installation and
 * delivery are previews — the real chooser lives at checkout.
 */
export function pricingBreakdown(products: Product[]): PricingBreakdown {
  const furniture = products
    .filter((p) => FURNITURE_CATS.includes(p.category))
    .reduce((n, p) => n + p.price, 0);
  const lighting = products
    .filter((p) => p.category === "lighting")
    .reduce((n, p) => n + p.price, 0);
  const decoration = products
    .filter((p) => DECOR_CATS.includes(p.category))
    .reduce((n, p) => n + p.price, 0);
  const installation = estimateInstallation(products);
  const delivery = estimateDelivery(products);
  const total = furniture + lighting + decoration + installation + delivery;
  return { furniture, lighting, decoration, installation, delivery, total, monthly: Math.ceil(total / 12) };
}
