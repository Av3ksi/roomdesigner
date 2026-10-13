import { createHash, createHmac } from "crypto";
import type { Product } from "../types";
import type { RawSupplierProduct } from "./types";
import { mapSupplierProduct } from "./mapping";

/**
 * AliExpress adapter, same shape as ./cjdropshipping.ts: search-on-demand
 * by keyword, never a bulk ingest. AliExpress is a general marketplace of
 * hundreds of millions of listings, so "fetch everything" is not a
 * meaningful operation the way scripts/ingest-vidaxl-feed.py is for a
 * furniture wholesaler.
 *
 * BUILT FROM DOCUMENTATION, NOT YET CONFIRMED AGAINST A LIVE RESPONSE —
 * unlike the CJ adapter, which was written against real probe output.
 * Verify it with scripts/aliexpress-test-fetch.ts before wiring it into
 * anything that costs money. Every failure path below surfaces the API's
 * own error text verbatim rather than a generic message, precisely so
 * that probe is enough to tell what needs correcting.
 *
 * HOW IT DIFFERS FROM CJ, and why this is more setup than pasting a key:
 * AliExpress uses the Taobao/Alibaba open-platform gateway, which needs an
 * App Key AND an App Secret, and every request carries an HMAC signature
 * over its own parameters. There is no simple bearer token. You register
 * an app at openservice.aliexpress.com and use the Affiliate API, which is
 * the surface that permits product search; the Dropshipping (DS) API
 * additionally requires an approved partner account and OAuth, which is a
 * bigger step and is deliberately not attempted here.
 *
 * dimensionsCm is DELIBERATELY never populated, for the same reason as CJ:
 * marketplace listings state package size, not the object's real
 * footprint, and feeding package size into the render pipeline's scale
 * grounding (lib/placementBoxes.ts) produces confidently wrong scale —
 * worse than no dimensions, which fall back to the model's visual
 * estimate.
 *
 * Pricing is passed through as if 1:1 with CHF, the same known
 * simplification the CJ adapter carries. Fine for showroom content; wrong
 * for a real checkout. Revisit before charging anyone.
 */

/** Singapore gateway. Region gateways exist (.com, -us, -eu); this one is the general default. */
const GATEWAY = "https://api-sg.aliexpress.com/sync";
const SEARCH_METHOD = "aliexpress.affiliate.product.query";

export function aliexpressEnabled(): boolean {
  return Boolean(process.env.ALIEXPRESS_APP_KEY && process.env.ALIEXPRESS_APP_SECRET);
}

/**
 * The open-platform signature: sort every parameter by key, concatenate
 * them as key+value with no separators, then sign that string with the app
 * secret and uppercase the hex.
 *
 * Two signing methods exist and both are still accepted; which one is used
 * is declared in the request itself via sign_method, so this supports
 * both. hmac-sha256 is the default because the md5 variant additionally
 * wraps the payload in the secret (secret + payload + secret) and is the
 * older scheme.
 */
function signRequest(params: Record<string, string>, secret: string, method: "hmac-sha256" | "md5"): string {
  const concatenated = Object.keys(params)
    .sort()
    .map((key) => `${key}${params[key]}`)
    .join("");

  if (method === "md5") {
    return createHash("md5").update(`${secret}${concatenated}${secret}`, "utf8").digest("hex").toUpperCase();
  }
  return createHmac("sha256", secret).update(concatenated, "utf8").digest("hex").toUpperCase();
}

/** The gateway wants "yyyy-MM-dd HH:mm:ss" in UTC, not an ISO string or an epoch. */
function gatewayTimestamp(now = new Date()): string {
  return now.toISOString().replace("T", " ").slice(0, 19);
}

export interface AliexpressCallResult {
  /** Parsed JSON body, whatever shape it came back as. */
  body: unknown;
  httpStatus: number;
  /** The gateway's own error text when it reported one, else null. */
  apiError: string | null;
}

/**
 * One signed gateway call. Exported so the probe script can show the raw
 * response — the fastest way to correct a wrong assumption in here is to
 * look at what the API actually said.
 */
export async function callAliexpress(
  method: string,
  businessParams: Record<string, string>,
): Promise<AliexpressCallResult> {
  const appKey = process.env.ALIEXPRESS_APP_KEY;
  const appSecret = process.env.ALIEXPRESS_APP_SECRET;
  if (!appKey || !appSecret) throw new Error("ALIEXPRESS_APP_KEY / ALIEXPRESS_APP_SECRET not configured");

  const signMethod = (process.env.ALIEXPRESS_SIGN_METHOD === "md5" ? "md5" : "hmac-sha256") as "md5" | "hmac-sha256";

  const params: Record<string, string> = {
    app_key: appKey,
    method,
    format: "json",
    v: "2.0",
    sign_method: signMethod,
    timestamp: gatewayTimestamp(),
    ...businessParams,
  };
  params.sign = signRequest(params, appSecret, signMethod);

  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });

  const text = await res.text();
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    return { body: text.slice(0, 600), httpStatus: res.status, apiError: `non-JSON response: ${text.slice(0, 200)}` };
  }

  // The gateway answers HTTP 200 even for rejected calls, putting the real
  // outcome in error_response. Treating status alone as success is the
  // classic way to "succeed" with zero results and no idea why.
  const err = (body as { error_response?: { msg?: string; sub_msg?: string; code?: string | number } }).error_response;
  const apiError = err ? `${err.code ?? "?"} ${err.msg ?? ""}${err.sub_msg ? ` — ${err.sub_msg}` : ""}`.trim() : null;

  return { body, httpStatus: res.status, apiError };
}

interface AliexpressProduct {
  product_id?: string | number;
  product_title?: string;
  product_main_image_url?: string;
  target_sale_price?: string;
  sale_price?: string;
  first_level_category_name?: string;
  second_level_category_name?: string;
}

/**
 * The response nests the useful array several levels down and the exact
 * path has varied between API versions, so this walks defensively rather
 * than asserting one shape. Returns [] instead of throwing when the
 * structure is unfamiliar — the probe script prints the raw body, which is
 * the right place to discover a changed shape.
 */
function extractProducts(body: unknown): AliexpressProduct[] {
  const root = body as Record<string, unknown>;
  const responseKey = Object.keys(root ?? {}).find((k) => k.endsWith("_response"));
  const response = responseKey ? (root[responseKey] as Record<string, unknown>) : null;
  const result = (response?.resp_result ?? response?.result) as Record<string, unknown> | undefined;
  const inner = (result?.result ?? result) as Record<string, unknown> | undefined;
  const products = (inner?.products ?? inner?.product) as unknown;

  if (Array.isArray(products)) return products as AliexpressProduct[];
  if (products && typeof products === "object") {
    const nested = (products as Record<string, unknown>).product;
    if (Array.isArray(nested)) return nested as AliexpressProduct[];
  }
  return [];
}

function toRawSupplierProduct(p: AliexpressProduct): RawSupplierProduct {
  const price = Number(p.target_sale_price ?? p.sale_price ?? 0);
  return {
    sku: String(p.product_id ?? ""),
    title: p.product_title ?? "",
    vendorCategory: p.second_level_category_name ?? p.first_level_category_name ?? "",
    costPrice: Number.isFinite(price) ? price : 0,
    stockQty: 999,
    images: p.product_main_image_url ? [p.product_main_image_url] : undefined,
  };
}

/**
 * English keywords, same as CJ — listings are titled in English, and this
 * app's bilingual category/style inference (./mapping.ts) already covers
 * English terms. Search by material + object ("rattan storage basket"),
 * never by style name: a marketplace has no concept of Vistroom's style
 * taxonomy.
 */
export async function searchAliexpressProducts(keyword: string, limit = 5): Promise<Product[]> {
  const { body, apiError } = await callAliexpress(SEARCH_METHOD, {
    keywords: keyword,
    page_no: "1",
    page_size: String(limit),
    target_currency: "USD",
    target_language: "EN",
    // Required by the affiliate API; a placeholder is accepted for search
    // even before real tracking is set up.
    tracking_id: process.env.ALIEXPRESS_TRACKING_ID ?? "default",
  });
  if (apiError) throw new Error(`AliExpress: ${apiError}`);

  return extractProducts(body)
    .filter((p) => p.product_main_image_url && p.product_title)
    .slice(0, limit)
    .map((p) => mapSupplierProduct(toRawSupplierProduct(p), "aliexpress", "AliExpress"));
}
