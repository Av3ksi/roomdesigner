/**
 * Probes the AliExpress API with one signed search and shows exactly what
 * came back, including the gateway's own error text when it rejects the
 * call.
 *
 * Run this BEFORE wiring AliExpress into anything. lib/suppliers/aliexpress.ts
 * was written from documentation rather than against live responses — unlike
 * the CJ adapter, which was built from real probe output — so the parts most
 * likely to be wrong are the signature and the response shape. Both are
 * visible in this output.
 *
 * SETUP, which is more than pasting a key. AliExpress uses the Alibaba open
 * platform gateway: you need an App Key and an App Secret, and every request
 * is signed. Register an app at openservice.aliexpress.com and enable the
 * Affiliate API (that is the surface which allows product search; the
 * Dropshipping/DS API needs an approved partner account and OAuth on top).
 *
 * Add to .env YOURSELF — never paste a secret into a chat:
 *   ALIEXPRESS_APP_KEY=...
 *   ALIEXPRESS_APP_SECRET=...
 *   ALIEXPRESS_TRACKING_ID=...        optional, defaults to "default"
 *   ALIEXPRESS_SIGN_METHOD=md5        optional, only if hmac-sha256 is rejected
 *
 * Usage:
 *   npx tsx scripts/aliexpress-test-fetch.ts
 *   npx tsx scripts/aliexpress-test-fetch.ts "rgb led strip"
 *   npx tsx scripts/aliexpress-test-fetch.ts "gaming mouse pad" --raw
 *
 * Never prints your key, your secret, or the signature.
 */
import { aliexpressEnabled, callAliexpress, searchAliexpressProducts } from "../lib/suppliers/aliexpress";

try {
  process.loadEnvFile?.();
} catch {
  // No .env file yet — the check below gives a clearer error.
}

async function main() {
  const args = process.argv.slice(2);
  const raw = args.includes("--raw");
  const keyword = args.find((a) => !a.startsWith("--")) ?? "rgb led strip";

  if (!aliexpressEnabled()) {
    console.error("AliExpress is not configured. Add BOTH to .env:");
    console.error("  ALIEXPRESS_APP_KEY=...");
    console.error("  ALIEXPRESS_APP_SECRET=...");
    console.error("\nGet them by registering an app at openservice.aliexpress.com and");
    console.error("enabling the Affiliate API. Unlike CJ, a single API key is not enough —");
    console.error("every request is signed with the secret.");
    process.exit(1);
  }

  console.log(`Searching AliExpress for "${keyword}"...\n`);

  // The low-level call first: it reports the gateway's own error, which is
  // what distinguishes "signature wrong" from "no results" — two failures
  // that look identical from the outside and have completely different fixes.
  const result = await callAliexpress("aliexpress.affiliate.product.query", {
    keywords: keyword,
    page_no: "1",
    page_size: "5",
    target_currency: "USD",
    target_language: "EN",
    tracking_id: process.env.ALIEXPRESS_TRACKING_ID ?? "default",
  });

  console.log(`HTTP ${result.httpStatus}`);
  if (result.apiError) {
    console.error(`\nThe API rejected the call: ${result.apiError}\n`);
    console.error("Common causes, in the order worth checking:");
    console.error("  - IncompleteSignature / InvalidSignature -> the signing rule differs.");
    console.error("    Try ALIEXPRESS_SIGN_METHOD=md5 in .env and re-run.");
    console.error("  - AppCallLimited / permission denied  -> the Affiliate API isn't");
    console.error("    enabled for this app yet, or it's still pending approval.");
    console.error("  - Invalid timestamp -> your clock is off from UTC.");
    console.log("\nRaw body:");
    console.log(JSON.stringify(result.body, null, 2).slice(0, 2000));
    process.exit(1);
  }

  if (raw) {
    console.log("Raw body:");
    console.log(JSON.stringify(result.body, null, 2).slice(0, 4000));
    console.log("");
  }

  // Then the mapped view — this is what a room would actually receive.
  const products = await searchAliexpressProducts(keyword, 5);
  console.log(`Mapped ${products.length} product(s):\n`);
  if (products.length === 0) {
    console.log("  (none)");
    console.log("\nThe call succeeded but nothing mapped. Either the search genuinely has");
    console.log("no results, or the response shape differs from what extractProducts()");
    console.log("expects. Re-run with --raw to see which.");
    return;
  }
  for (const p of products) {
    console.log(`  ${p.name}`);
    console.log(`    id ${p.id}  CHF ${p.price}  [${p.category}]  styles: ${p.styles.join(", ") || "none"}`);
    console.log(`    image: ${p.imageUrl ? "yes" : "NO — unusable, a room needs a photo"}`);
  }
  console.log("\nIf these look relevant to the keyword, AliExpress is a better accent");
  console.log("source than CJ, which returned a butter dish for four different queries.");
}

main().catch((err) => {
  console.error("Failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
