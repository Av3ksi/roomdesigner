import Anthropic from "@anthropic-ai/sdk";
import { MODEL, aiEnabled } from "./claude";
import type { TargetMarket } from "@/lib/targetMarkets";
import type { ProductCategory } from "@/lib/types";

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
  /**
   * Direct URL of the product's real photo, when the model could find one on
   * the product page (via web_fetch). Needed to actually composite the real
   * item into a render as a reference image — without this, an "add a
   * poster"-type request only reaches the image model as a text hint, which
   * it may ignore or invent something ungrounded for. Null if no reliable
   * image URL was found — the caller should treat the item as link-only.
   */
  imageUrl: string | null;
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

// web_search_20260209 / web_fetch_20260209 require Opus 4.6+/Sonnet 5/4.6 — MODEL is
// claude-opus-4-8, which qualifies. max_uses caps rounds PER product; each round carries a fee
// AND pulls retrieved content into context as (billed) input tokens — the single biggest variable
// cost in the pipeline. web_fetch is what lets the model actually open the product page it found
// and read off the real photo URL, rather than guessing one from the search snippet alone.
const WEB_SEARCH_TOOL = { type: "web_search_20260209", name: "web_search", max_uses: 2 } as const;
const WEB_FETCH_TOOL = { type: "web_fetch_20260209", name: "web_fetch", max_uses: 2 } as const;

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
      // Cast: web_search_20260209 / web_fetch_20260209 aren't in this SDK version's tool
      // union types yet, but the server accepts them and they're the current tool versions
      // for opus-4-8.
      tools: [WEB_SEARCH_TOOL as unknown as Anthropic.Tool, WEB_FETCH_TOOL as unknown as Anthropic.Tool],
      system:
        "You find one real, in-stock, purchasable product that matches a description, for a 'shop the look' feature " +
        "that composites the ACTUAL product photo into a room render — so the real photo matters as much as the link. " +
        "Search the web, pick a single concrete product page from a reputable retailer (not a category/listing page, " +
        `not a marketplace search URL, not a blog). ${MARKET_GUIDANCE[market]} ${MARKET_EXCLUSION} ` +
        "Once you've picked a product page, use web_fetch to open it and find the direct URL of its main product " +
        "photo (an <img> src, an Open Graph og:image, or a product-schema image field — not a logo, icon, or " +
        "unrelated thumbnail). " +
        'When you have it, end your reply with ONLY a JSON object on its own line: {"name": "...", ' +
        '"url": "https://...", "retailer": "...", "priceText": "CHF 49" or null, "imageUrl": "https://..." or null ' +
        'if you could not confidently find the real product photo URL}. If you cannot find a genuine product page ' +
        'that actually ships to the customer, end with {"name": null}.',
      messages: [
        { role: "user", content: `Find a real product to buy that matches: "${query}". Return the JSON object as instructed.` },
      ],
    }, {
      // The SDK default (10 min timeout x up to 3 attempts with retries =
      // up to 30 min for ONE call) is what turned a single stuck search into
      // a 24-minute generate request. A real web search (a couple of rounds,
      // reading a few pages) normally finishes in well under a minute.
      // maxRetries: 0 is deliberate — the SDK retries a *timeout* exactly
      // like any other connection error, so maxRetries: 1 here silently
      // doubles the worst case (measured: a real request hit this and took
      // ~4 minutes end to end, not the ~2 the single timeout implied).
      // Retrying an already-slow web search rarely helps; fail once, fail
      // fast, and let this function's existing fallback (return null,
      // degrade gracefully) kick in — the caller (the chat agent) can
      // decide whether to try again with a different query.
      timeout: 60_000,
      maxRetries: 0,
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

    const imageUrl = typeof parsed.imageUrl === "string" ? parsed.imageUrl.trim() : "";

    return {
      name,
      url,
      retailer: typeof parsed.retailer === "string" && parsed.retailer.trim() ? parsed.retailer.trim() : new URL(url).hostname.replace(/^www\./, ""),
      priceText: typeof parsed.priceText === "string" && parsed.priceText.trim() ? parsed.priceText.trim() : null,
      imageUrl: /^https?:\/\//i.test(imageUrl) ? imageUrl : null,
    };
  } catch (err) {
    console.error("[maison] web product search failed:", err);
    return null;
  }
}

const CATEGORIES: ProductCategory[] = [
  "sofa", "chair", "table", "lighting", "rug", "art", "plant", "storage", "decor", "textile",
];

export interface RequestedExtra {
  category: ProductCategory;
  /** English phrase to feed into searchWebForProduct. */
  webQuery: string;
}

const REQUESTED_EXTRAS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["category", "webQuery"],
        properties: {
          category: { type: "string", enum: CATEGORIES },
          webQuery: { type: "string" },
        },
      },
    },
  },
} as const;

/**
 * Parses a free-text style direction for any SPECIFIC item the curator
 * wants added ("add a poster", "put a floor lamp in the corner") — as
 * opposed to pure mood/aesthetic language ("make it cozy", "warmer tones")
 * that describes how to treat what's already there, not a new object to
 * source.
 *
 * This exists because composeSceneWithProducts only ever gets real
 * reference photos for the products the curator explicitly picked — a
 * poster mentioned only in free text reaches the image model as a
 * description, not a photo, which it may ignore (especially now that the
 * restyle prompt is deliberately conservative about adding anything not
 * explicitly named) or render as something ungrounded/hallucinated. Running
 * this BEFORE compositing lets the caller source a REAL photo for each
 * named item via searchWebForProduct and feed it in as a proper reference
 * image, exactly like a catalog product — not a guess made after the fact.
 */
export async function extractRequestedExtras(
  styleDirection: string,
  coveredCategories: ProductCategory[],
): Promise<RequestedExtra[]> {
  if (!aiEnabled() || !styleDirection.trim()) return [];
  try {
    const response = await new Anthropic().messages.create({
      model: MODEL,
      max_tokens: 512,
      system:
        "You read a free-text room styling direction and pull out any SPECIFIC, NAMED physical item the person " +
        "wants added to the room — e.g. 'add a poster', 'put in a floor lamp', 'a small side table would be nice'. " +
        "Do NOT include pure mood, color, or lighting-quality language with no new object named — 'make it cozy', " +
        "'warmer tones', 'more natural light' describe how to treat the existing room, not something to source and " +
        "add. For each real named item, return its closest category from the allowed list and a short English web " +
        `search query (2-6 words) to find a real purchasable version of it. Skip these categories — already ` +
        `covered by a hand-picked product: ${coveredCategories.length ? coveredCategories.join(", ") : "(none)"}. ` +
        "If nothing concrete is requested, return an empty items array.",
      output_config: {
        format: { type: "json_schema", schema: REQUESTED_EXTRAS_SCHEMA as unknown as Record<string, unknown> },
      },
      messages: [{ role: "user", content: `Style direction: "${styleDirection.trim()}"` }],
    }, {
      // Tiny, single-turn, no-thinking, no-tools call — normally a couple of
      // seconds. See searchWebForProduct above for why an explicit timeout
      // matters at all, and why maxRetries: 0 — the SDK retries a timeout
      // like any other connection error, silently doubling the wait.
      timeout: 45_000,
      maxRetries: 0,
    });

    if (response.stop_reason === "refusal") return [];
    const text = response.content.find((b) => b.type === "text")?.text;
    if (!text) return [];
    const parsed = JSON.parse(text) as { items?: unknown };
    if (!Array.isArray(parsed.items)) return [];

    return parsed.items
      .filter((i): i is Record<string, unknown> => typeof i === "object" && i !== null)
      .filter(
        (i) =>
          typeof i.category === "string" &&
          (CATEGORIES as readonly string[]).includes(i.category) &&
          typeof i.webQuery === "string" &&
          i.webQuery.trim(),
      )
      .map((i) => ({ category: i.category as ProductCategory, webQuery: (i.webQuery as string).trim() }))
      .slice(0, 5);
  } catch (err) {
    console.error("[maison] extractRequestedExtras failed:", err);
    return [];
  }
}
