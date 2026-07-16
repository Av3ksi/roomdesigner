import type { SupplierAdapter, SupplierCatalogResult, RawSupplierProduct } from "./types";
import { mapSupplierProduct, hasKnownCategory } from "./mapping";

/**
 * VidaXL / DropshippingXL adapter, wired against their real b2b API docs:
 *
 * - Base URL: https://b2b.dropxl.com (prod) or https://sandbox.b2b.dropxl.com
 *   (sandbox — request access via support@dropXL.com before it works).
 * - Auth: HTTP Basic, username = account email, password = API token.
 *   (Not a Bearer token — an earlier version of this file guessed wrong.)
 * - Rate limit: 1 request/second.
 * - GET /api_customer/products returns a lean, flat field set — id, name,
 *   code, category_path, quantity, price, created_at, updated_at. No
 *   description, no images, no separate cost/RRP split: `price` is the
 *   wholesale cost VidaXL charges, and Maison's own markup is applied on
 *   top in mapping.ts's computeRetailPrice().
 * - Pagination via ?limit=&offset=, with the response carrying a
 *   `pagination: { offset, limit, total }` block alongside the products.
 *   The real catalog is huge (docs' sample response shows ~49,996 total
 *   products) and general-wholesaler-broad (pet supplies, kids' ride-on
 *   toys, garden tools — not just home furniture), so fetchLive() scans a
 *   handful of pages and keeps only products that hit one of Maison's
 *   known furniture/decor categories (see hasKnownCategory in mapping.ts)
 *   rather than blindly taking whatever's at offset 0. This is a stand-in
 *   for real category_path-based curation, not the final catalog scope —
 *   good enough to prove the ingestion → mapping → display pipeline works
 *   end to end with on-theme products; a full catalog sync/filter belongs
 *   in a scheduled background job (see Phase B), not a page load under a
 *   1 req/sec ceiling.
 * - Order placement exists via POST /api_customer/orders, but payment does
 *   not — orders still need to be paid manually in VidaXL's own dashboard
 *   under "Unsubmitted orders". Not implemented here yet; this adapter
 *   only reads the product catalog so far.
 *
 * Until VIDAXL_API_KEY, VIDAXL_API_URL and VIDAXL_ACCOUNT_EMAIL are all
 * configured, fetchCatalog() returns the mock feed below instead — shaped
 * like a plausible VidaXL export (richer than the real feed, including
 * description/images, so the mapping layer and UI have something to work
 * with) so the pipeline is testable without live credentials.
 */

const SUPPLIER_ID = "vidaxl";
const SUPPLIER_LABEL = "VidaXL";
const PRODUCTS_PAGE_LIMIT = 60;
const TARGET_LIVE_PRODUCT_COUNT = 40;
const MAX_PAGES_TO_SCAN = 6;

export function vidaxlEnabled(): boolean {
  return Boolean(process.env.VIDAXL_API_KEY && process.env.VIDAXL_API_URL && process.env.VIDAXL_ACCOUNT_EMAIL);
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

/** Shape of a single entry in GET /api_customer/products, per VidaXL's real docs. */
interface VidaxlApiProduct {
  id: number;
  name: string;
  code: string;
  category_path: string;
  quantity: number;
  price: number;
  created_at: string;
  updated_at: string;
}

interface VidaxlProductsResponse {
  data: VidaxlApiProduct[];
  pagination: { offset: number; limit: number; total: number };
}

function vidaxlAuthHeader(): string {
  // .trim() guards against a trailing newline/space from pasting the token
  // into .env — invisible in an editor, but enough to fail Basic auth.
  const email = (process.env.VIDAXL_ACCOUNT_EMAIL ?? "").trim();
  const token = (process.env.VIDAXL_API_KEY ?? "").trim();
  return `Basic ${Buffer.from(`${email}:${token}`).toString("base64")}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchProductsPage(baseUrl: string, offset: number): Promise<VidaxlProductsResponse> {
  const res = await fetch(`${baseUrl}/api_customer/products?limit=${PRODUCTS_PAGE_LIMIT}&offset=${offset}`, {
    headers: { Authorization: vidaxlAuthHeader() },
  });
  if (!res.ok) throw new Error(`VidaXL API error: ${res.status}`);
  return (await res.json()) as VidaxlProductsResponse;
}

async function fetchLive(): Promise<RawSupplierProduct[]> {
  const baseUrl = (process.env.VIDAXL_API_URL ?? "").trim().replace(/\/+$/, "");
  const matched: RawSupplierProduct[] = [];

  for (let page = 0; page < MAX_PAGES_TO_SCAN && matched.length < TARGET_LIVE_PRODUCT_COUNT; page++) {
    if (page > 0) await sleep(1100); // stay under VidaXL's 1 req/sec rate limit

    const offset = page * PRODUCTS_PAGE_LIMIT;
    const body = await fetchProductsPage(baseUrl, offset);

    for (const p of body.data) {
      const raw: RawSupplierProduct = {
        sku: p.code,
        title: p.name,
        vendorCategory: p.category_path,
        costPrice: p.price,
        stockQty: p.quantity,
      };
      if (hasKnownCategory(raw)) matched.push(raw);
    }

    if (offset + PRODUCTS_PAGE_LIMIT >= body.pagination.total) break; // scanned the whole catalog
  }

  return matched;
}

export async function fetchVidaxlCatalog(): Promise<SupplierCatalogResult> {
  const live = vidaxlEnabled();
  const raw = live ? await fetchLive() : MOCK_FEED;
  return {
    supplierId: SUPPLIER_ID,
    supplierLabel: SUPPLIER_LABEL,
    source: live ? "live" : "mock",
    fetchedAt: Date.now(),
    // VidaXL occasionally returns price: 0 for a SKU (unavailable/
    // discontinued variants, going by the live feed) — a zero-cost item
    // isn't sellable and would show as a free product, so drop it here
    // rather than let it render as CHF 0.
    products: raw
      .map((r) => mapSupplierProduct(r, SUPPLIER_ID, SUPPLIER_LABEL))
      .filter((p) => p.price > 0),
  };
}

export const vidaxlAdapter: SupplierAdapter = {
  id: SUPPLIER_ID,
  label: SUPPLIER_LABEL,
  isLive: vidaxlEnabled,
  fetchCatalog: fetchVidaxlCatalog,
};
