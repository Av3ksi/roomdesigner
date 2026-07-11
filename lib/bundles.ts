import { PRODUCTS } from "./products";
import type { Product, ProductCategory } from "./types";

/**
 * Curated shopping bundles — a themed group of categories assembled
 * deterministically from the catalog (in-style, not already owned), priced
 * with a small bundle discount. Same "AI understands intent, catalog
 * resolves the actual products" split used everywhere else in the app.
 */
export interface BundleDef {
  id: string;
  name: string;
  description: string;
  categories: ProductCategory[];
}

const BUNDLE_DEFS: BundleDef[] = [
  { id: "reading-corner", name: "Reading Corner", description: "A dedicated spot to slow down with a book.", categories: ["chair", "lighting", "textile"] },
  { id: "entertaining-ready", name: "Entertaining Ready", description: "Everything for hosting well, from the first guest to the last.", categories: ["decor", "textile", "art"] },
  { id: "botanical-refresh", name: "Botanical Refresh", description: "Bring the room to life with greenery and texture.", categories: ["plant", "decor"] },
  { id: "layered-light", name: "Layered Light", description: "Warm, considered lighting instead of one overhead source.", categories: ["lighting", "decor"] },
  { id: "finishing-touches", name: "Finishing Touches", description: "The small details that make a room feel done.", categories: ["art", "decor", "textile"] },
];

export interface ResolvedBundle extends BundleDef {
  products: Product[];
  total: number;
  bundlePrice: number;
  savings: number;
}

const BUNDLE_DISCOUNT = 0.92;

/**
 * Bundles with at least 2 resolvable products. Most style tags only have a
 * single product per category in this catalog, so an unowned, in-style pick
 * often doesn't exist — the resolver falls back first to any unowned
 * in-style product, then to the closest unowned product in that category
 * regardless of style, rather than silently dropping the bundle.
 */
export function resolveBundles(styleId: string, ownedIds: string[]): ResolvedBundle[] {
  const owned = new Set(ownedIds);
  const usedAcrossBundles = new Set<string>();
  const results: ResolvedBundle[] = [];

  const pickForCategory = (cat: ProductCategory): Product | undefined => {
    const available = (p: Product) => !owned.has(p.id) && !usedAcrossBundles.has(p.id) && p.category === cat;
    return (
      PRODUCTS.find((p) => available(p) && p.styles.includes(styleId)) ??
      PRODUCTS.find(available)
    );
  };

  for (const def of BUNDLE_DEFS) {
    const products: Product[] = [];
    for (const cat of def.categories) {
      const pick = pickForCategory(cat);
      if (pick) {
        products.push(pick);
        usedAcrossBundles.add(pick.id);
      }
    }
    if (products.length < 2) continue;
    const total = products.reduce((n, p) => n + p.price, 0);
    const bundlePrice = Math.round(total * BUNDLE_DISCOUNT);
    results.push({ ...def, products, total, bundlePrice, savings: total - bundlePrice });
  }
  return results;
}
