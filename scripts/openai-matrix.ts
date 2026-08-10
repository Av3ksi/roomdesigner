/**
 * Narrows the OpenAI image 520 to a single parameter.
 *
 * Established by scripts/openai-diagnose.ts on a real key:
 *   quality=low,  size=1024x1024 -> HTTP 200 in 12.7s
 *   quality=high, size=1536x1024 -> HTTP 520 in 2.9s
 *
 * The 2.9s failure is the important detail: a dropped long-running
 * connection takes tens of seconds, so this is a fast *rejection*, not a
 * timeout. Two variables changed at once between those two calls, so this
 * changes one at a time to find which one triggers it.
 *
 * Each call is a real generation and costs real money — low/medium sizes
 * are cents. Runs sequentially and reports a table at the end.
 *
 * Never prints the API key.
 *
 * Usage:
 *   npx tsx scripts/openai-matrix.ts
 */

// Own module scope — see scripts/cj-test-fetch.ts for why.
export {};

try {
  process.loadEnvFile?.();
} catch {
  // No .env file — the check below gives a clearer error.
}

const MODEL = "gpt-image-1.5";
const PROMPT = "An empty, unfurnished living room with soft natural daylight. No furniture.";

interface Probe {
  label: string;
  quality: "low" | "medium" | "high";
  size: "1024x1024" | "1536x1024" | "1024x1536";
  /** What a failure here would tell us. */
  meaning: string;
}

// Ordered cheapest-first so a decisive early answer costs the least.
const PROBES: Probe[] = [
  { label: "low  / 1536x1024", quality: "low", size: "1536x1024", meaning: "the WIDE SIZE is the trigger, independent of quality" },
  { label: "high / 1024x1024", quality: "high", size: "1024x1024", meaning: "HIGH QUALITY is the trigger, independent of size" },
  { label: "medium / 1536x1024", quality: "medium", size: "1536x1024", meaning: "wide size fails even at medium quality" },
];

async function probe(apiKey: string, p: Probe): Promise<{ ok: boolean; status: number; ms: number }> {
  const started = Date.now();
  try {
    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODEL, prompt: PROMPT, quality: p.quality, size: p.size, n: 1 }),
    });
    const ms = Date.now() - started;
    if (!res.ok) {
      const body = await res.text();
      const isCloudflare = body.includes("cloudflare") || body.includes("<!DOCTYPE html>");
      console.log(`  ${p.label}: HTTP ${res.status} in ${ms}ms ${isCloudflare ? "(Cloudflare HTML error page)" : ""}`);
      if (!isCloudflare) console.log(`    ${body.replace(/\s+/g, " ").slice(0, 300)}`);
      return { ok: false, status: res.status, ms };
    }
    const bytes = (await res.text()).length;
    console.log(`  ${p.label}: HTTP 200 in ${ms}ms — ${(bytes / 1_000_000).toFixed(2)} MB returned`);
    return { ok: true, status: 200, ms };
  } catch (err) {
    const ms = Date.now() - started;
    console.log(`  ${p.label}: network failure in ${ms}ms — ${err instanceof Error ? err.message : err}`);
    return { ok: false, status: 0, ms };
  }
}

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("OPENAI_API_KEY is not set in .env.");
    process.exit(1);
  }

  console.log(`Model: ${MODEL}. Testing one variable at a time.\n`);
  const results: { p: Probe; ok: boolean }[] = [];
  for (const p of PROBES) {
    const r = await probe(apiKey, p);
    results.push({ p, ok: r.ok });
  }

  console.log("\n--- Conclusion ---");
  const failed = results.filter((r) => !r.ok);
  if (failed.length === 0) {
    console.log("Everything passed. The 520 is intermittent rather than parameter-driven —");
    console.log("re-run scripts/openai-diagnose.ts to confirm, and keep the retry logic.");
    return;
  }
  for (const f of failed) console.log(`FAILED ${f.p.label} -> ${f.p.meaning}`);

  const wideFailed = results.some((r) => !r.ok && r.p.size === "1536x1024");
  const squareHighFailed = results.some((r) => !r.ok && r.p.size === "1024x1024" && r.p.quality === "high");
  if (wideFailed && !squareHighFailed) {
    console.log("\n=> Fix: keep high quality, switch the wide 1536x1024 size to 1024x1024.");
  } else if (squareHighFailed && !wideFailed) {
    console.log("\n=> Fix: keep the wide size, drop quality from high to medium.");
  } else {
    console.log("\n=> Both dimensions implicated — safest fix is medium quality at 1024x1024.");
  }
}

main().catch((err) => {
  console.error("Failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
