import Anthropic from "@anthropic-ai/sdk";
import { MODEL, aiEnabled } from "./claude";
import type { TargetMarket } from "@/lib/targetMarkets";

/**
 * Finds a real, purchasable product on the open web for something the
 * showroom restyle staged in that our OWN catalog doesn't carry (a poster,
 * a specific lamp). Uses Claude's server-side web_search tool, so the model
 * actually searches live retailers and returns a real product page URL —
 * not a hallucinated link.
 *
 * Business note, stated plainly: an external link earns no dropship margin
 * (that only exists on our own catalog), so this is a stopgap to keep the
 * whole look shoppable until we source these items ourselves. Every result
 * is surfaced in the UI as clearly external, never mixed in with our own
 * add-to-cart products. Runs once per unmatched item at bundle-creation
 * time (curator action), never per customer.
 */

export interface WebProduct {
  name: string;
  url: string;
  retailer: string;
  /** Price in the retailer's own currency string when the model could read one, else null. */
  priceText: string | null;
}

/**
 * Market-specific retailer guidance for the search prompt. Switzerland is
 * called out specially and NOT treated as interchangeable with "EU": it's
 * outside the EU customs union, so plenty of .de/.fr retailers either won't
 * ship there or add steep customs fees at the border — a link that's fine
 * for a German customer can be a bad (or undeliverable) suggestion for a
 * Swiss one. AliExpress ships reliably to Switzerland, which is why it's
 * called out as a good default there specifically.
 */
const MARKET_GUIDANCE: Record<TargetMarket, string> = {
  CH:
    "The customer is in Switzerland. Switzerland is NOT in the EU customs union, so many German/French " +
    "retailers either don't ship there or add steep customs fees — verify shipping-to-Switzerland before " +
    "picking a listing, don't assume a .de or .fr site ships there. AliExpress ships reliably to Switzerland " +
    "and is a good default for inexpensive decor (posters, small accessories). Also good: digitec.ch, " +
    "galaxus.ch, or a supplier's own .ch site if one exists. Prefer prices in CHF; EUR is acceptable if that's " +
    "all the listing shows.",
  DE: "The customer is in Germany. Prefer amazon.de, aliexpress.com, home24.de, lampenwelt.de, or another " +
    "retailer that ships within Germany. Prefer prices in EUR.",
  AT: "The customer is in Austria. Prefer amazon.de (ships to Austria), aliexpress.com, or another retailer " +
    "confirmed to ship to Austria. Prefer prices in EUR.",
  FR: "The customer is in France. Prefer amazon.fr, aliexpress.com, la redoute, manomano, or another retailer " +
    "that ships within France. Prefer prices in EUR.",
  IT: "The customer is in Italy. Prefer amazon.it, aliexpress.com, or another retailer that ships within Italy. " +
    "Prefer prices in EUR.",
  EU: "The customer is somewhere in Europe (exact country unknown). Prefer retailers that ship broadly across " +
    "the EU — amazon (any .de/.fr/.it/.es storefront), aliexpress.com, or a major European home-goods " +
    "retailer. Prefer prices in EUR.",
};

const MARKET_EXCLUSION =
  "Never pick amazon.com or any other US-only retailer/listing unless it explicitly states it ships to " +
  "Europe — a US-only link is not something this customer can actually buy.";

// web_search_20260209 requires Opus 4.6+/Sonnet 5/4.6 — MODEL is claude-opus-4-8, which qualifies.
// max_uses caps search rounds PER product. Each round carries a per-search fee AND pulls the
// retrieved page content into context as (billed) input tokens — the single biggest variable cost
// in the pipeline. 2 rounds is enough to find a decent match for a stopgap external link; going
// higher mostly buys marginally better matches on no-margin items.
const WEB_SEARCH_TOOL = { type: "web_search_20260209", name: "web_search", max_uses: 2 } as const;

function firstJsonObject(text: string): Record<string, unknown> | null {
  // The model ends with a JSON object; grab the last {...} block and parse it.
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function searchWebForProduct(query: string, market: TargetMarket = "CH"): Promise<WebProduct | null> {
  if (!aiEnabled()) return null;
  try {
    const response = await new Anthropic().messages.create({
      model: MODEL,
      max_tokens: 2048,
      thinking: { type: "adaptive" },
      // Cast: web_search_20260209 isn't in this SDK version's tool union types yet,
      // but the server accepts it and it's the current tool version for opus-4-8.
      tools: [WEB_SEARCH_TOOL as unknown as Anthropic.Tool],
      system:
        "You find one real, in-stock, purchasable product that matches a description, for a 'shop the look' feature. " +
        "Search the web, pick a single concrete product page from a reputable retailer (not a category/listing page, " +
        `not a marketplace search URL, not a blog). ${MARKET_GUIDANCE[market]} ${MARKET_EXCLUSION} ` +
        'When you have it, end your reply with ONLY a JSON object on its own line: {"name": "...", ' +
        '"url": "https://...", "retailer": "...", "priceText": "CHF 49" or null}. If you cannot find a genuine ' +
        'product page that actually ships to the customer, end with {"name": null}.',
      messages: [
        { role: "user", content: `Find a real product to buy that matches: "${query}". Return the JSON object as instructed.` },
      ],
    });

    if (response.stop_reason === "refusal") return null;
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    const parsed = firstJsonObject(text);
    if (!parsed) return null;

    const name = typeof parsed.name === "string" ? parsed.name.trim() : "";
    const url = typeof parsed.url === "string" ? parsed.url.trim() : "";
    if (!name || !/^https?:\/\//i.test(url)) return null;

    return {
      name,
      url,
      retailer: typeof parsed.retailer === "string" && parsed.retailer.trim() ? parsed.retailer.trim() : new URL(url).hostname.replace(/^www\./, ""),
      priceText: typeof parsed.priceText === "string" && parsed.priceText.trim() ? parsed.priceText.trim() : null,
    };
  } catch (err) {
    console.error("[maison] web product search failed:", err);
    return null;
  }
}
