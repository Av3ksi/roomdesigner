import type { SupplierAdapter, SupplierCatalogResult, RawSupplierProduct } from "./types";
import { mapSupplierProduct, hasKnownCategory } from "./mapping";
import sampleFeedData from "./data/vidaxl-sample.json";

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
 * configured, fetchCatalog() returns the sample feed below instead — a
 * real, static 200-product snapshot ingested from VidaXL's bulk product
 * feed (see scripts/ingest-vidaxl-feed.py), not synthetic placeholder
 * data. Real prices, real stock, real photo URLs — just not queried live,
 * so it can go stale. Category coverage skews toward whatever the
 * ingestion script's category allowlist + row order happened to surface
 * (a lot of garden furniture) rather than a deliberately curated
 * assortment — good enough to prove photos/pricing/mapping work end to
 * end, not the final product selection.
 */

const SUPPLIER_ID = "vidaxl";
const SUPPLIER_LABEL = "VidaXL";
const PRODUCTS_PAGE_LIMIT = 60;
const TARGET_LIVE_PRODUCT_COUNT = 40;
const MAX_PAGES_TO_SCAN = 6;

export function vidaxlEnabled(): boolean {
  return Boolean(process.env.VIDAXL_API_KEY && process.env.VIDAXL_API_URL && process.env.VIDAXL_ACCOUNT_EMAIL);
}

/** Shape written by scripts/ingest-vidaxl-feed.py into data/vidaxl-sample.json. */
interface VidaxlSampleProduct {
  sku: string;
  title: string;
  category: string;
  description: string;
  color: string;
  weightKg: number | null;
  brand: string;
  costPrice: number;
  webshopPrice: number | null;
  stock: number;
  images: string[];
  ean: string;
  packaging: string;
}

function sampleToRaw(p: VidaxlSampleProduct): RawSupplierProduct {
  return {
    sku: p.sku,
    ean: p.ean || undefined,
    title: p.title,
    vendorCategory: p.category,
    description: p.description || undefined,
    costPrice: p.costPrice,
    stockQty: p.stock,
    images: p.images,
    weightKg: p.weightKg ?? undefined,
    brand: p.brand || undefined,
    // "pallet" packaging is VidaXL's own bulky/freight-shipping signal.
    bulky: p.packaging === "pallet",
  };
}

const SAMPLE_FEED: RawSupplierProduct[] = (sampleFeedData as VidaxlSampleProduct[]).map(sampleToRaw);

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
  const raw = live ? await fetchLive() : SAMPLE_FEED;
  return {
    supplierId: SUPPLIER_ID,
    supplierLabel: SUPPLIER_LABEL,
    source: live ? "live" : "sample",
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
