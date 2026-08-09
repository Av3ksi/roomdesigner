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
// Confirmed working — a real run returned a real product (see git history
// of this file's commit message / chat for the sample response).
const PRODUCT_LIST_URL = "https://developers.cjdropshipping.com/api2.0/v1/product/list";
// Unverified guess, same basis as the list endpoint was before it got
// confirmed. This is the one that matters most: the list endpoint's
// response has no dimension fields (only productWeight, as a range), so
// this probe fetches full detail for the first listed product to check
// whether length/width/height show up there instead. If this 404s, paste
// the error body back and I'll correct the path.
const PRODUCT_DETAIL_URL = "https://developers.cjdropshipping.com/api2.0/v1/product/query";

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
  const productBody = (await productRes.json().catch(() => null)) as
    | { data?: { list?: { pid?: string }[] } }
    | null;

  if (!productRes.ok) {
    console.error(`Product list failed: HTTP ${productRes.status}`);
    console.error(JSON.stringify(productBody, null, 2));
    console.error("\nThe endpoint path above is an unverified guess — paste this error back and I'll fix it.");
    process.exit(1);
  }

  console.log("\n--- Paste everything below this line back into chat ---\n");
  console.log(JSON.stringify(productBody, null, 2));

  const pid = productBody?.data?.list?.[0]?.pid;
  if (!pid) return;

  console.log(`\nFetching full detail for product ${pid} (checking for real dimensions)...`);
  const detailRes = await fetch(`${PRODUCT_DETAIL_URL}?pid=${encodeURIComponent(pid)}`, {
    headers: { "CJ-Access-Token": accessToken },
  });
  const detailBody = await detailRes.json().catch(() => null);

  if (!detailRes.ok) {
    console.error(`Product detail failed: HTTP ${detailRes.status}`);
    console.error(JSON.stringify(detailBody, null, 2));
    console.error("\nThe detail endpoint path is an unverified guess — paste this error back and I'll fix it.");
    return;
  }

  console.log("\n--- And paste everything below this line too ---\n");
  console.log(JSON.stringify(detailBody, null, 2));
}

main().catch((err) => {
  console.error("Failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
