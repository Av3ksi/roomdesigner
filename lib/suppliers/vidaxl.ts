import type { SupplierAdapter, SupplierCatalogResult, RawSupplierProduct } from "./types";
import { mapSupplierProduct } from "./mapping";

/**
 * VidaXL dropship adapter. Their real program (dropshippingxl.com) is a
 * paid (~€30/mo at last check) subscription that includes API access,
 * real-time stock/price feeds and bulk import — see the account signup
 * flow for current terms, this file doesn't guess at pricing.
 *
 * Until VIDAXL_API_KEY is configured, fetchCatalog() returns this mock
 * feed instead — shaped like a plausible VidaXL export so the mapping
 * layer, pricing math and UI are all real and testable today. Swap in the
 * real HTTP call in `fetchLive()` once real credentials + endpoint docs
 * are in hand; nothing else in the app needs to change, since both paths
 * return the same normalized Product shape.
 */

const SUPPLIER_ID = "vidaxl";
const SUPPLIER_LABEL = "VidaXL";

export function vidaxlEnabled(): boolean {
  return Boolean(process.env.VIDAXL_API_KEY && process.env.VIDAXL_API_URL);
}

const MOCK_FEED: RawSupplierProduct[] = [
  {
    sku: "VDX-40211", title: "Floor Lamp Arc Black Steel", vendorCategory: "Home & Living > Lighting > Floor Lamps",
    description: "Minimalist arc floor lamp in matte black steel, dimmable LED, weighted marble-look base. Scandinavian and minimalist interiors.",
    costPrice: 62, recommendedRetailPrice: 149, stockQty: 184, images: [], weightKg: 6.2, dimensionsCm: { l: 40, w: 40, h: 165 }, brand: "vidaXL",
  },
  {
    sku: "VDX-38870", title: "Wool Area Rug Natural Undyed 200x300", vendorCategory: "Home & Living > Rugs > Area Rugs",
    description: "Hand-loomed 100% wool rug in undyed natural tones, flatweave, Nordic style, cozy texture underfoot.",
    costPrice: 118, recommendedRetailPrice: 259, stockQty: 61, images: [], weightKg: 9.8, dimensionsCm: { l: 300, w: 200, h: 1 }, brand: "vidaXL",
  },
  {
    sku: "VDX-41902", title: "Rattan Pendant Light Natural Boho", vendorCategory: "Home & Living > Lighting > Pendant Lights",
    description: "Hand-woven natural rattan pendant shade, organic and mediterranean interiors, warm ambient glow.",
    costPrice: 34, recommendedRetailPrice: 89, stockQty: 240, images: [], weightKg: 1.1, dimensionsCm: { l: 38, w: 38, h: 28 }, brand: "vidaXL",
  },
  {
    sku: "VDX-33410", title: "Solid Oak Coffee Table Round Light Wood", vendorCategory: "Furniture > Living Room > Coffee Tables",
    description: "Solid light oak coffee table, round soft-radius top, Scandinavian minimalist design, oiled natural finish.",
    costPrice: 145, recommendedRetailPrice: 299, stockQty: 47, images: [], weightKg: 18.4, dimensionsCm: { l: 90, w: 90, h: 38 }, brand: "vidaXL",
  },
  {
    sku: "VDX-29981", title: "Walnut Low Side Table Japandi", vendorCategory: "Furniture > Living Room > Side Tables",
    description: "Low profile walnut side table, Japandi style, kiln-dried hardwood, tapered legs.",
    costPrice: 58, recommendedRetailPrice: 129, stockQty: 93, images: [], weightKg: 6.7, dimensionsCm: { l: 50, w: 40, h: 32 }, brand: "vidaXL",
  },
  {
    sku: "VDX-45520", title: "Velvet Cushion Cover Emerald Set of 2", vendorCategory: "Home & Living > Textiles > Cushions",
    description: "Emerald green cotton velvet cushion covers, brass-tone zip, dark luxury and moody interiors, set of two.",
    costPrice: 19, recommendedRetailPrice: 45, stockQty: 312, images: [], weightKg: 0.4, dimensionsCm: { l: 45, w: 45, h: 2 }, brand: "vidaXL",
  },
  {
    sku: "VDX-37765", title: "Alpaca Wool Throw Blanket Undyed", vendorCategory: "Home & Living > Textiles > Throws",
    description: "Baby alpaca wool throw blanket, undyed natural tone, cozy Scandinavian texture, herringbone weave.",
    costPrice: 41, recommendedRetailPrice: 95, stockQty: 158, images: [], weightKg: 0.9, dimensionsCm: { l: 130, w: 170, h: 2 }, brand: "vidaXL",
  },
  {
    sku: "VDX-42117", title: "Terracotta Stoneware Vase Trio", vendorCategory: "Home & Living > Decor > Vases",
    description: "Hand-thrown terracotta stoneware vases, mediterranean and organic modern decor, set of three graduated sizes.",
    costPrice: 22, recommendedRetailPrice: 58, stockQty: 201, images: [], weightKg: 1.8, dimensionsCm: { l: 18, w: 18, h: 30 }, brand: "vidaXL",
  },
  {
    sku: "VDX-30044", title: "Olive Tree Artificial 150cm Potted", vendorCategory: "Home & Living > Plants > Artificial Plants",
    description: "Realistic artificial olive tree in raw terracotta pot, 150cm, low-maintenance greenery for any style.",
    costPrice: 54, recommendedRetailPrice: 119, stockQty: 76, images: [], weightKg: 4.3, dimensionsCm: { l: 50, w: 50, h: 150 }, brand: "vidaXL",
  },
  {
    sku: "VDX-31890", title: "Reeded Oak Sideboard 3-Door", vendorCategory: "Furniture > Storage > Sideboards",
    description: "Reeded solid oak door fronts, brass hardware, Scandinavian storage, push-open soft-close hinges.",
    costPrice: 312, recommendedRetailPrice: 649, stockQty: 22, images: [], weightKg: 54, dimensionsCm: { l: 180, w: 45, h: 82 }, brand: "vidaXL",
  },
  {
    sku: "VDX-44201", title: "Boucle Accent Chair Ivory Curved", vendorCategory: "Furniture > Living Room > Armchairs",
    description: "Curved boucle accent chair in ivory, organic modern silhouette, solid beech legs.",
    costPrice: 168, recommendedRetailPrice: 349, stockQty: 38, images: [], weightKg: 22, dimensionsCm: { l: 78, w: 74, h: 76 }, brand: "vidaXL",
  },
  {
    sku: "VDX-40873", title: "Blackened Steel Bookshelf Industrial", vendorCategory: "Furniture > Storage > Bookcases",
    description: "Raw blackened steel frame bookshelf with reclaimed fir shelves, industrial loft style, five tiers.",
    costPrice: 134, recommendedRetailPrice: 279, stockQty: 51, images: [], weightKg: 31, dimensionsCm: { l: 90, w: 35, h: 190 }, brand: "vidaXL",
  },
  {
    sku: "VDX-46110", title: "Linen Curtain Panel Natural Set of 2", vendorCategory: "Home & Living > Textiles > Curtains",
    description: "Washed natural linen curtain panels, mediterranean and coastal interiors, rod-pocket header, set of two.",
    costPrice: 38, recommendedRetailPrice: 89, stockQty: 172, images: [], weightKg: 1.4, dimensionsCm: { l: 140, w: 250, h: 1 }, brand: "vidaXL",
  },
  {
    sku: "VDX-28654", title: "Marble Top Side Table Brass Base", vendorCategory: "Furniture > Living Room > Side Tables",
    description: "Nero marble top round side table on a polished brass tripod base, modern luxury statement piece.",
    costPrice: 96, recommendedRetailPrice: 219, stockQty: 44, images: [], weightKg: 12, dimensionsCm: { l: 40, w: 40, h: 55 }, brand: "vidaXL",
  },
  {
    sku: "VDX-39982", title: "3-Seater Fabric Sofa Charcoal", vendorCategory: "Furniture > Living Room > Sofas",
    description: "Charcoal grey woven fabric 3-seater sofa, solid pine frame, minimalist silhouette. Bulky item — freight shipping.",
    costPrice: 289, recommendedRetailPrice: 599, stockQty: 14, images: [], weightKg: 58, dimensionsCm: { l: 210, w: 88, h: 84 }, brand: "vidaXL", bulky: true,
  },
  {
    sku: "VDX-41455", title: "Hand-Forged Iron Candle Holders Set", vendorCategory: "Home & Living > Decor > Candles",
    description: "Hand-forged raw iron taper candle holders, industrial and dark luxury decor, set of three heights.",
    costPrice: 16, recommendedRetailPrice: 42, stockQty: 267, images: [], weightKg: 0.8, dimensionsCm: { l: 12, w: 12, h: 28 }, brand: "vidaXL",
  },
];

async function fetchLive(): Promise<RawSupplierProduct[]> {
  // Real endpoint/auth pattern is unconfirmed until we have VidaXL's actual
  // API docs in hand — wire it up here once credentials exist. Expect to
  // adjust field names to match their real response shape.
  const res = await fetch(`${process.env.VIDAXL_API_URL}/catalog`, {
    headers: { Authorization: `Bearer ${process.env.VIDAXL_API_KEY}` },
  });
  if (!res.ok) throw new Error(`VidaXL API error: ${res.status}`);
  const data = (await res.json()) as { products: RawSupplierProduct[] };
  return data.products;
}

export async function fetchVidaxlCatalog(): Promise<SupplierCatalogResult> {
  const live = vidaxlEnabled();
  const raw = live ? await fetchLive() : MOCK_FEED;
  return {
    supplierId: SUPPLIER_ID,
    supplierLabel: SUPPLIER_LABEL,
    source: live ? "live" : "mock",
    fetchedAt: Date.now(),
    products: raw.map((r) => mapSupplierProduct(r, SUPPLIER_ID, SUPPLIER_LABEL)),
  };
}

export const vidaxlAdapter: SupplierAdapter = {
  id: SUPPLIER_ID,
  label: SUPPLIER_LABEL,
  isLive: vidaxlEnabled,
  fetchCatalog: fetchVidaxlCatalog,
};
