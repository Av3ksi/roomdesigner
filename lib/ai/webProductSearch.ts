import Anthropic from "@anthropic-ai/sdk";
import { MODEL, aiEnabled } from "./claude";

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

export async function searchWebForProduct(query: string): Promise<WebProduct | null> {
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
        "not a marketplace search URL, not a blog). Prefer retailers that ship broadly. When you have it, end your " +
        'reply with ONLY a JSON object on its own line: {"name": "...", "url": "https://...", "retailer": "...", ' +
        '"priceText": "CHF 49" or null}. If you cannot find a genuine product page, end with {"name": null}.',
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
