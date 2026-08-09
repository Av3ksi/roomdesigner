import type { Product } from "../types";
import type { RawSupplierProduct } from "./types";
import { mapSupplierProduct } from "./mapping";

/**
 * CJ Dropshipping adapter — confirmed real against live API responses
 * (scripts/cj-test-fetch.ts), not built from docs alone. Deliberately
 * search-on-demand only, not a bulk feed like VidaXL: CJ's catalog is
 * 1.4M+ general dropshipping products (fashion, electronics, toys —
 * confirmed via a real unfiltered probe that returned a dress), not
 * furniture-focused, so there's no sensible "ingest everything" step the
 * way scripts/ingest-vidaxl-feed.py does. Fetch exactly what a caller
 * asks for by keyword, when they ask for it.
 *
 * dimensionsCm is DELIBERATELY never populated from CJ's data. Confirmed
 * against two real products: a dress with variant dimensions
 * 300x200x30mm, and a "sofa" with 450x400x230mm — both match a folded/
 * packed shipping size (a "sofa" that's 45cm wide is physically
 * impossible as a real seat), not the item's real footprint. Feeding
 * that into the render pipeline's scale-grounding
 * (lib/placementBoxes.ts's scaleBoxToRealWidth) would actively produce
 * WRONG scale, worse than having no dimension data — leaving it unset
 * falls back to the AI's own visual size estimate, the same honest
 * degrade every other dimension-less product in the catalog already
 * gets.
 *
 * Pricing note: CJ's sellPrice is USD; this app's Product.price field is
 * treated as CHF everywhere else (VidaXL is priced directly in CHF).
 * Currently passed through as if 1:1 — a known simplification, not a
 * real FX conversion. Fine for showroom/demo content; revisit before
 * this becomes a real checkout price.
 */

const AUTH_URL = "https://developers.cjdropshipping.com/api2.0/v1/authentication/getAccessToken";
const PRODUCT_LIST_URL = "https://developers.cjdropshipping.com/api2.0/v1/product/list";

// CJ's own docs describe access tokens as valid ~180 days — cached for
// the process lifetime with a conservative refresh margin. A short-lived
// script (scripts/generate-showroom-rooms.ts) only ever needs one token
// per run regardless; this matters more once something long-running
// (a server route) calls this repeatedly.
let cachedToken: { token: string; obtainedAt: number } | null = null;
const TOKEN_TTL_MS = 170 * 24 * 60 * 60 * 1000;

export function cjEnabled(): boolean {
  return Boolean(process.env.CJ_API_KEY);
}

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() - cachedToken.obtainedAt < TOKEN_TTL_MS) return cachedToken.token;

  const apiKey = process.env.CJ_API_KEY;
  if (!apiKey) throw new Error("CJ_API_KEY not configured");

  const res = await fetch(AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey }),
  });
  const body = (await res.json().catch(() => null)) as { data?: { accessToken?: string } } | null;
  const token = body?.data?.accessToken;
  if (!res.ok || !token) throw new Error(`CJ auth failed: HTTP ${res.status}`);

  cachedToken = { token, obtainedAt: Date.now() };
  return token;
}

interface CjListProduct {
  pid: string;
  productNameEn: string;
  productSku: string;
  productImage: string;
  sellPrice: string;
  categoryName: string;
}

function toRawSupplierProduct(p: CjListProduct): RawSupplierProduct {
  return {
    sku: p.productSku,
    title: p.productNameEn,
    vendorCategory: p.categoryName,
    costPrice: Number(p.sellPrice) || 0,
    stockQty: 999,
    images: p.productImage ? [p.productImage] : undefined,
  };
}

/**
 * English keywords work directly (unlike VidaXL, whose feed is German) —
 * CJ's productNameEn field plus this app's existing bilingual
 * CATEGORY_KEYWORDS/STYLE_KEYWORDS (lib/suppliers/mapping.ts) already
 * cover English terms, so no CJ-specific keyword list was needed.
 * Search by material+object ("rattan basket"), not style name — CJ has
 * no concept of Vistroom's style taxonomy, confirmed via its category
 * list not resembling one.
 */
export async function searchCjProducts(keyword: string, limit = 5): Promise<Product[]> {
  const token = await getAccessToken();
  const res = await fetch(
    `${PRODUCT_LIST_URL}?pageNum=1&pageSize=${limit}&productNameEn=${encodeURIComponent(keyword)}`,
    { headers: { "CJ-Access-Token": token } },
  );
  const body = (await res.json().catch(() => null)) as { data?: { list?: CjListProduct[] } } | null;
  if (!res.ok || !body?.data?.list) return [];

  return body.data.list
    .filter((p) => p.productImage)
    .map((p) => mapSupplierProduct(toRawSupplierProduct(p), "cj", "CJ Dropshipping"));
}
