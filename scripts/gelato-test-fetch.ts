/**
 * One-off probe for Gelato's Product Catalog API — NOT a real supplier
 * adapter yet, same purpose as scripts/cj-test-fetch.ts: get real
 * confirmed API responses before writing lib/suppliers/gelato.ts, rather
 * than building against docs alone.
 *
 * Unlike CJ/VidaXL, Gelato isn't a wholesale inventory feed — it's
 * print-on-demand. There's no fixed "catalog of products with stock,"
 * there's a catalog of PRINTABLE PRODUCT TYPES (poster sizes, paper
 * formats, framing options) that only becomes a real orderable product
 * once you supply your own print-ready image. This probe is here to
 * confirm what attributes/sizes are actually available for posters
 * specifically — the category Vistroom would use this for (real wall art,
 * printed on demand and matched to each room's style, instead of sourcing
 * generic prints from a wholesaler).
 *
 * Auth: X-API-KEY header (confirmed from Gelato's own docs — unlike CJ,
 * no token exchange step, the raw key goes straight on every request).
 *
 * Prints catalog/product JSON to your terminal — never the API key.
 * Safe to paste that output back into chat.
 *
 * Usage:
 *   npx tsx scripts/gelato-test-fetch.ts
 *
 * Reads GELATO_API_KEY from .env.
 */

// Makes this its own module instead of a global script — see the same note
// in scripts/cj-test-fetch.ts for why that matters.
export {};

try {
  process.loadEnvFile?.();
} catch {
  // No .env file yet — the check below gives a clearer error.
}

const BASE = "https://product.gelatoapis.com/v3";

async function getJson(url: string, apiKey: string): Promise<{ ok: boolean; status: number; body: unknown }> {
  const res = await fetch(url, { headers: { "X-API-KEY": apiKey } });
  const body = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, body };
}

async function main() {
  const apiKey = process.env.GELATO_API_KEY;
  if (!apiKey) {
    console.error("GELATO_API_KEY is not set. Add it to .env first:");
    console.error('  echo GELATO_API_KEY=your-real-key-here>>.env   (cmd.exe)');
    console.error('  Add-Content .env "GELATO_API_KEY=your-real-key-here"   (PowerShell)');
    process.exit(1);
  }

  console.log("Fetching the list of catalogs...");
  const catalogs = await getJson(`${BASE}/catalogs`, apiKey);
  if (!catalogs.ok) {
    console.error(`List catalogs failed: HTTP ${catalogs.status}`);
    console.error(JSON.stringify(catalogs.body, null, 2));
    console.error("\nIf this is 401/403, the key itself may be the problem — double check it saved correctly in .env.");
    process.exit(1);
  }
  console.log("\n--- Paste everything below this line back into chat ---\n");
  console.log(JSON.stringify(catalogs.body, null, 2));

  console.log('\nFetching the "posters" catalog (attributes: orientation, paper format, etc.)...');
  const posterCatalog = await getJson(`${BASE}/catalogs/posters`, apiKey);
  if (!posterCatalog.ok) {
    console.error(`Get posters catalog failed: HTTP ${posterCatalog.status}`);
    console.error(JSON.stringify(posterCatalog.body, null, 2));
  } else {
    console.log("\n--- And paste this too ---\n");
    console.log(JSON.stringify(posterCatalog.body, null, 2));
  }

  // Unverified guess at the request body shape — confirmed endpoint/method
  // (POST .../products:search) but not the exact filter fields. An empty
  // body is the safest guess for "just give me something back."
  console.log("\nSearching for one real poster product...");
  const searchRes = await fetch(`${BASE}/catalogs/posters/products:search`, {
    method: "POST",
    headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ limit: 1 }),
  });
  const searchBody = (await searchRes.json().catch(() => null)) as
    | { products?: { productUid?: string }[] }
    | null;

  if (!searchRes.ok) {
    console.error(`Product search failed: HTTP ${searchRes.status}`);
    console.error(JSON.stringify(searchBody, null, 2));
    console.error("\nThe request body shape above is an unverified guess — paste this error back and I'll fix it.");
    return;
  }
  console.log("\n--- And this ---\n");
  console.log(JSON.stringify(searchBody, null, 2));

  const productUid = searchBody?.products?.[0]?.productUid;
  if (!productUid) return;

  console.log(`\nFetching full detail for product ${productUid}...`);
  const detail = await getJson(`${BASE}/products/${encodeURIComponent(productUid)}`, apiKey);
  if (!detail.ok) {
    console.error(`Get product failed: HTTP ${detail.status}`);
    console.error(JSON.stringify(detail.body, null, 2));
    return;
  }
  console.log("\n--- And finally this ---\n");
  console.log(JSON.stringify(detail.body, null, 2));
}

main().catch((err) => {
  console.error("Failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
