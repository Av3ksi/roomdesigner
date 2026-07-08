import type { Product, ProductCategory } from "./types";

/**
 * Curated marketplace catalog. In production this is fed by retail partner
 * APIs; here it's a representative slice with real-world-plausible pricing.
 */
export const PRODUCTS: Product[] = [
  // ——— Sofas ———
  { id: "sofa-oslo", name: "Oslo 3-Seater", brand: "Nordhem", category: "sofa", price: 1890, rating: 4.8, reviews: 412, styles: ["scandinavian", "minimalist", "coastal"], color: "#D6D1C6", blurb: "Feather-wrapped cushions in undyed bouclé, solid oak base." },
  { id: "sofa-kyo", name: "Kyō Low Sofa", brand: "Mokuzai", category: "sofa", price: 2340, rating: 4.9, reviews: 188, styles: ["japandi", "minimalist"], color: "#A79680", blurb: "28cm seat height, kiln-dried ash frame, linen-hemp weave." },
  { id: "sofa-hollis", name: "Hollis Sofa", brand: "Ferndale", category: "sofa", price: 2150, rating: 4.7, reviews: 356, styles: ["midcentury"], color: "#C46F35", blurb: "Burnt-sienna wool twill on tapered walnut legs. The icon." },
  { id: "sofa-foundry", name: "Foundry Leather Sofa", brand: "Iron & Hide", category: "sofa", price: 2890, rating: 4.8, reviews: 264, styles: ["industrial"], color: "#9C5B3C", blurb: "Full-grain cognac leather that earns its patina, steel frame." },
  { id: "sofa-marais", name: "Marais Velvet Sofa", brand: "Élan Paris", category: "sofa", price: 3450, rating: 4.9, reviews: 143, styles: ["artdeco"], color: "#2E5347", blurb: "Emerald cotton velvet, fluted back, brass sabots." },
  { id: "sofa-dune", name: "Dune Slipcover Sofa", brand: "Saltair", category: "sofa", price: 1720, rating: 4.6, reviews: 298, styles: ["coastal", "bohemian", "scandinavian"], color: "#E4E1D6", blurb: "Washable Belgian linen slipcover, deep lounge seat." },

  // ——— Chairs ———
  { id: "chair-arne", name: "Arne Lounge Chair", brand: "Nordhem", category: "chair", price: 740, rating: 4.7, reviews: 231, styles: ["scandinavian", "minimalist", "midcentury"], color: "#B9A98C", blurb: "Steam-bent oak shell, wool-felt pad." },
  { id: "chair-ryo", name: "Ryō Accent Chair", brand: "Mokuzai", category: "chair", price: 890, rating: 4.8, reviews: 117, styles: ["japandi"], color: "#6E5B44", blurb: "Paper-cord seat, charred-ash frame." },
  { id: "chair-havana", name: "Havana Rattan Chair", brand: "Terra Verde", category: "chair", price: 520, rating: 4.6, reviews: 342, styles: ["bohemian", "coastal"], color: "#C8A96E", blurb: "Hand-woven rattan wingback with kilim cushion." },
  { id: "chair-gatsby", name: "Gatsby Cocktail Chair", brand: "Élan Paris", category: "chair", price: 980, rating: 4.7, reviews: 96, styles: ["artdeco"], color: "#C8A96E", blurb: "Channel-tufted velvet barrel chair on brass ring base." },

  // ——— Tables ———
  { id: "table-lumi", name: "Lumi Coffee Table", brand: "Nordhem", category: "table", price: 460, rating: 4.6, reviews: 289, styles: ["scandinavian", "minimalist", "coastal"], color: "#C9A876", blurb: "White-oiled oak, soft-radius oval top." },
  { id: "table-en", name: "En Low Table", brand: "Mokuzai", category: "table", price: 620, rating: 4.8, reviews: 134, styles: ["japandi", "minimalist"], color: "#8A6B44", blurb: "22cm-high kotatsu-inspired table in smoked oak." },
  { id: "table-orbit", name: "Orbit Walnut Table", brand: "Ferndale", category: "table", price: 690, rating: 4.7, reviews: 208, styles: ["midcentury"], color: "#6B4A2E", blurb: "Elliptical walnut top with sculpted underbevel." },
  { id: "table-girder", name: "Girder Steel Table", brand: "Iron & Hide", category: "table", price: 540, rating: 4.5, reviews: 176, styles: ["industrial"], color: "#3A3733", blurb: "Blackened steel I-beam base, reclaimed fir top." },
  { id: "table-noir", name: "Noir Marble Table", brand: "Élan Paris", category: "table", price: 1240, rating: 4.8, reviews: 87, styles: ["artdeco", "minimalist"], color: "#2B2B29", blurb: "Nero Marquina marble drum with brass reveal." },
  { id: "table-driftwood", name: "Driftwood Table", brand: "Saltair", category: "table", price: 480, rating: 4.5, reviews: 154, styles: ["coastal", "bohemian"], color: "#BCA378", blurb: "Washed-teak slab on rope-wrapped legs." },

  // ——— Lighting ———
  { id: "light-halo", name: "Halo Floor Lamp", brand: "Lumafabrik", category: "lighting", price: 320, rating: 4.7, reviews: 265, styles: ["scandinavian", "minimalist", "coastal"], color: "#3D3A34", blurb: "Paper-shade column, dim-to-warm LED." },
  { id: "light-akari", name: "Akari Paper Lantern", brand: "Lumafabrik", category: "lighting", price: 240, rating: 4.9, reviews: 388, styles: ["japandi", "scandinavian", "bohemian"], color: "#F1ECE1", blurb: "Hand-pressed washi pendant, bamboo ribs." },
  { id: "light-arc", name: "Arco Arc Lamp", brand: "Ferndale", category: "lighting", price: 580, rating: 4.8, reviews: 199, styles: ["midcentury", "industrial", "minimalist"], color: "#B08D4F", blurb: "Sweeping brass arc with marble counterweight." },
  { id: "light-fabrik", name: "Fabrik Tripod Lamp", brand: "Iron & Hide", category: "lighting", price: 290, rating: 4.5, reviews: 142, styles: ["industrial"], color: "#22211F", blurb: "Theatre-light tripod in raw steel." },
  { id: "light-empire", name: "Empire Table Lamp", brand: "Élan Paris", category: "lighting", price: 410, rating: 4.7, reviews: 76, styles: ["artdeco"], color: "#C8A96E", blurb: "Stepped brass base, pleated silk shade." },

  // ——— Rugs ———
  { id: "rug-fjord", name: "Fjord Wool Rug 250", brand: "Væv", category: "rug", price: 690, rating: 4.8, reviews: 224, styles: ["scandinavian", "minimalist", "coastal"], color: "#E3DDD0", blurb: "Undyed Norwegian wool, flat weave, 250×180." },
  { id: "rug-tatami", name: "Tatami Weave Rug", brand: "Væv", category: "rug", price: 560, rating: 4.7, reviews: 132, styles: ["japandi", "minimalist"], color: "#D8CDB6", blurb: "Jute-wool blend in tea tones, low profile." },
  { id: "rug-souk", name: "Souk Berber Rug", brand: "Atlas Loom", category: "rug", price: 820, rating: 4.9, reviews: 301, styles: ["bohemian", "midcentury", "industrial"], color: "#C0603A", blurb: "Hand-knotted Beni Ourain style, terracotta diamond." },
  { id: "rug-deco", name: "Deco Fan Rug", brand: "Élan Paris", category: "rug", price: 940, rating: 4.6, reviews: 68, styles: ["artdeco"], color: "#1B2F29", blurb: "Emerald ground with brass fan motif, cut pile." },

  // ——— Art ———
  { id: "art-line", name: "Line Study No. 4", brand: "Galerie M", category: "art", price: 260, rating: 4.7, reviews: 88, styles: ["scandinavian", "minimalist", "japandi"], color: "#3D3A34", blurb: "Single-line figure print, oak float frame, 70×100." },
  { id: "art-terra", name: "Terra Forms Diptych", brand: "Galerie M", category: "art", price: 340, rating: 4.6, reviews: 74, styles: ["bohemian", "midcentury", "coastal"], color: "#C0603A", blurb: "Abstract earth-pigment pair, 50×70 each." },
  { id: "art-gilt", name: "Gilt Horizon", brand: "Galerie M", category: "art", price: 520, rating: 4.8, reviews: 51, styles: ["artdeco", "industrial"], color: "#C8A96E", blurb: "Gold-leaf horizon on deep green ground, 90×120." },

  // ——— Plants ———
  { id: "plant-olive", name: "Olive Tree 140cm", brand: "Verdant", category: "plant", price: 180, rating: 4.6, reviews: 412, styles: ["scandinavian", "coastal", "minimalist", "japandi"], color: "#8A9B84", blurb: "Live olive in raw terracotta, 140cm." },
  { id: "plant-monstera", name: "Monstera Deliciosa", brand: "Verdant", category: "plant", price: 120, rating: 4.8, reviews: 633, styles: ["bohemian", "midcentury", "industrial"], color: "#5C7350", blurb: "Statement monstera, 90cm, ceramic pot." },
  { id: "plant-bonsai", name: "Ficus Bonsai", brand: "Verdant", category: "plant", price: 210, rating: 4.7, reviews: 156, styles: ["japandi", "artdeco"], color: "#6E7F5C", blurb: "Ten-year ficus on charred-oak stand." },

  // ——— Storage ———
  { id: "storage-frame", name: "Frame Sideboard", brand: "Nordhem", category: "storage", price: 980, rating: 4.7, reviews: 187, styles: ["scandinavian", "minimalist", "midcentury"], color: "#C9A876", blurb: "Reeded oak doors, push-open, cable-managed." },
  { id: "storage-shoji", name: "Shōji Cabinet", brand: "Mokuzai", category: "storage", price: 1240, rating: 4.8, reviews: 92, styles: ["japandi"], color: "#8A6B44", blurb: "Sliding washi-glass doors on smoked ash." },
  { id: "storage-vault", name: "Vault Locker Console", brand: "Iron & Hide", category: "storage", price: 760, rating: 4.5, reviews: 121, styles: ["industrial"], color: "#3A3733", blurb: "Powder-black steel console with mesh doors." },
  { id: "storage-fluted", name: "Fluted Bar Cabinet", brand: "Élan Paris", category: "storage", price: 1680, rating: 4.9, reviews: 63, styles: ["artdeco"], color: "#26443A", blurb: "Fluted walnut, mirrored interior, brass pulls." },

  // ——— Decor & textiles ———
  { id: "decor-vase", name: "Kama Stone Vases (3)", brand: "Studio Ilta", category: "decor", price: 140, rating: 4.6, reviews: 203, styles: ["japandi", "scandinavian", "minimalist", "coastal"], color: "#B9A98C", blurb: "Hand-thrown stoneware trio in oat glazes." },
  { id: "decor-mirror", name: "Sunburst Mirror", brand: "Élan Paris", category: "decor", price: 380, rating: 4.7, reviews: 85, styles: ["artdeco", "bohemian"], color: "#C8A96E", blurb: "Brass-rayed 80cm wall mirror." },
  { id: "decor-candle", name: "Forge Candleholders", brand: "Iron & Hide", category: "decor", price: 95, rating: 4.5, reviews: 148, styles: ["industrial", "minimalist"], color: "#22211F", blurb: "Hand-forged steel taper set." },
  { id: "textile-throw", name: "Alpaca Throw", brand: "Væv", category: "textile", price: 190, rating: 4.9, reviews: 356, styles: ["scandinavian", "minimalist", "coastal", "japandi"], color: "#E9E5DC", blurb: "Baby-alpaca herringbone, undyed." },
  { id: "textile-kilim", name: "Kilim Cushion Set", brand: "Atlas Loom", category: "textile", price: 160, rating: 4.7, reviews: 267, styles: ["bohemian", "midcentury", "industrial"], color: "#C0603A", blurb: "Vintage kilim fronts, linen backs, set of 3." },
  { id: "textile-velvet", name: "Velvet Cushion Set", brand: "Élan Paris", category: "textile", price: 220, rating: 4.6, reviews: 112, styles: ["artdeco"], color: "#2E5347", blurb: "Emerald + brass piped velvet, set of 3." },
];

export const PRODUCT_MAP: Record<string, Product> = Object.fromEntries(
  PRODUCTS.map((p) => [p.id, p]),
);

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

export const BRANDS = Array.from(new Set(PRODUCTS.map((p) => p.brand))).sort();

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

export function conceptTotal(products: Product[]): number {
  return products.reduce((sum, p) => sum + p.price, 0);
}

export const formatPrice = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
