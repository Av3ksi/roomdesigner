/**
 * One-off probe for CJ Dropshipping's API — NOT a real supplier adapter
 * yet. lib/suppliers/vidaxl.ts's adapter was built against confirmed real
 * API responses; this exists to get the same for CJ before writing one,
 * since the public docs (developers.cjdropshipping.com) don't fully
 * confirm the fields that matter most here — specifically whether a
 * product carries real physical dimensions (length/width/height), which
 * the render pipeline needs for correct on-image scale (see
 * lib/placementBoxes.ts's scaleBoxToRealWidth). Weight alone isn't enough.
 *
 * Prints ONE real product's raw JSON to your terminal — never the API key
 * or the access token it exchanges for. Safe to paste that JSON output
 * back into chat.
 *
 * Usage:
 *   npx tsx scripts/cj-test-fetch.ts
 *
 * Reads CJ_API_KEY from .env.
 */

try {
  process.loadEnvFile?.();
} catch {
  // No .env file yet — the check below gives a clearer error.
}

const AUTH_URL = "https://developers.cjdropshipping.com/api2.0/v1/authentication/getAccessToken";
// Best guess at the product-list endpoint from public docs — unverified,
// since this app's outbound network can't reach CJ's docs site directly to
// confirm. If this 404s, the printed error body should say why; paste that
// back and I'll correct the path.
const PRODUCT_LIST_URL = "https://developers.cjdropshipping.com/api2.0/v1/product/list";

async function main() {
  const apiKey = process.env.CJ_API_KEY;
  if (!apiKey) {
    console.error("CJ_API_KEY is not set. Add it to .env first:");
    console.error('  Add-Content .env "CJ_API_KEY=CJUserNum@api@..."');
    process.exit(1);
  }

  console.log("Requesting an access token...");
  const authRes = await fetch(AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey }),
  });
  const authBody = (await authRes.json().catch(() => null)) as
    | { code?: number; result?: boolean; message?: string; data?: { accessToken?: string } }
    | null;

  if (!authRes.ok || !authBody?.data?.accessToken) {
    console.error(`Auth failed: HTTP ${authRes.status}`);
    // Deliberately printing the body, not the key — CJ's error messages
    // (wrong key format, IP not whitelisted, etc.) go straight back to me
    // if you paste this.
    console.error(JSON.stringify(authBody, null, 2));
    process.exit(1);
  }
  console.log("Auth succeeded.");

  const accessToken = authBody.data.accessToken;
  console.log("Fetching one page of products...");
  const productRes = await fetch(`${PRODUCT_LIST_URL}?pageNum=1&pageSize=1`, {
    headers: { "CJ-Access-Token": accessToken },
  });
  const productBody = await productRes.json().catch(() => null);

  if (!productRes.ok) {
    console.error(`Product list failed: HTTP ${productRes.status}`);
    console.error(JSON.stringify(productBody, null, 2));
    console.error("\nThe endpoint path above is an unverified guess — paste this error back and I'll fix it.");
    process.exit(1);
  }

  console.log("\n--- Paste everything below this line back into chat ---\n");
  console.log(JSON.stringify(productBody, null, 2));
}

main().catch((err) => {
  console.error("Failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
