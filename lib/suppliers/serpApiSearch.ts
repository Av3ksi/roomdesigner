import type { TargetMarket } from "../targetMarkets";
import type { WebProduct } from "../ai/webProductSearch";

/**
 * Google Shopping search via SerpApi — structured JSON, no HTML scraping,
 * no agentic browsing. The primary "not in our catalog" search when
 * SERPAPI_KEY is configured, replacing lib/ai/webProductSearch.ts's
 * Claude-agentic web_search+web_fetch approach in the live flow (that
 * function stays in place, used automatically as the fallback when
 * SERPAPI_KEY isn't set — see lib/ai/designer.ts's search_web_for_product
 * tool). Built specifically to fix a confirmed reliability problem: the
 * agentic approach has to actually load and parse an arbitrary retail page
 * to find a product photo URL, which measurably timed out 100% of the time
 * on real testing even at a 100s budget. SerpApi's `thumbnail` field is
 * always a direct, already-hosted image URL — there's no page-fetch/parse
 * step to fail.
 *
 * Field names verified via multiple independent sources (SerpApi's own
 * site returns 403 to automated fetches, same as Replicate's) — not a
 * guess, but also not hand-tested against a real key yet. If a field name
 * turns out to be slightly off, this degrades to an empty/malformed
 * shopping_results array rather than crashing (parsed defensively below),
 * so the honest "no result" fallback still holds either way.
 */

export function serpApiEnabled(): boolean {
  return Boolean(process.env.SERPAPI_KEY);
}

const REGION_BY_MARKET: Record<TargetMarket, { gl: string; hl: string }> = {
  CH: { gl: "ch", hl: "de" },
  DE: { gl: "de", hl: "de" },
  AT: { gl: "at", hl: "de" },
  FR: { gl: "fr", hl: "fr" },
  IT: { gl: "it", hl: "it" },
  EU: { gl: "de", hl: "en" },
};

interface SerpApiShoppingResult {
  title?: string;
  price?: string;
  extracted_price?: number;
  product_link?: string;
  link?: string;
  thumbnail?: string;
  source?: string;
}

export async function searchProductViaSerpApi(query: string, market: TargetMarket = "CH"): Promise<WebProduct | null> {
  if (!serpApiEnabled()) return null;
  try {
    const region = REGION_BY_MARKET[market];
    const params = new URLSearchParams({
      engine: "google_shopping",
      q: query,
      api_key: process.env.SERPAPI_KEY!,
      gl: region.gl,
      hl: region.hl,
    });

    const res = await fetch(`https://serpapi.com/search.json?${params.toString()}`, {
      // A structured API call, not agentic page-fetching — should be fast.
      // Fail well short of the old approach's own (already generous) 100s
      // budget rather than risk stacking onto it if something's wrong.
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      console.error(`[maison] SerpApi search failed: ${res.status} ${await res.text()}`);
      return null;
    }

    const body = (await res.json()) as { shopping_results?: SerpApiShoppingResult[] };
    const results = Array.isArray(body.shopping_results) ? body.shopping_results : [];

    const best = results.find(
      (r) => typeof r.title === "string" && r.title.trim() && typeof r.thumbnail === "string" && (r.product_link || r.link),
    );
    if (!best) {
      console.log(`[maison] SerpApi: no usable shopping result (title + thumbnail + link) for query "${query}"`);
      return null;
    }

    const url = (best.product_link || best.link)!;
    return {
      name: best.title!.trim(),
      url,
      retailer:
        typeof best.source === "string" && best.source.trim()
          ? best.source.trim()
          : new URL(url).hostname.replace(/^www\./, ""),
      priceText: typeof best.price === "string" && best.price.trim() ? best.price.trim() : null,
      imageUrl: best.thumbnail!,
    };
  } catch (err) {
    console.error(`[maison] SerpApi search failed for query "${query}":`, err);
    return null;
  }
}
