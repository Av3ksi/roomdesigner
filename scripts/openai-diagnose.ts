/**
 * Isolates WHY OpenAI image generation is failing, without burning money
 * guessing. Runs three escalating checks and reports where the failure
 * starts — each step is designed so a failure narrows the cause to one
 * thing.
 *
 * Written after repeated Cloudflare 520s from api.openai.com's image
 * endpoint spanning many hours, while Anthropic/CJ/Postgres calls in the
 * same runs all succeeded. A 520 that persists that long on one endpoint
 * is not a transient outage, so this stops assuming and measures.
 *
 * Cost: step 1 is free. Step 2 is the cheapest possible image call
 * (low quality, smallest size). Step 3 is one full-price image at the
 * exact settings the showroom script uses — it only runs if step 2
 * succeeded, so a broken setup never reaches it.
 *
 * Never prints the API key. Safe to paste the whole output back.
 *
 * Usage:
 *   npx tsx scripts/openai-diagnose.ts
 */

// Own module scope — see scripts/cj-test-fetch.ts for why.
export {};

try {
  process.loadEnvFile?.();
} catch {
  // No .env file — the check below gives a clearer error.
}

const MODEL = "gpt-image-1.5";

function preview(text: string, max = 600): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  return collapsed.length > max ? `${collapsed.slice(0, max)}… [${collapsed.length} chars total]` : collapsed;
}

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("OPENAI_API_KEY is not set in .env.");
    process.exit(1);
  }
  console.log(`Key loaded: ${apiKey.length} chars, starts "${apiKey.slice(0, 7)}…" (never printing the rest).`);
  console.log(`Model under test: ${MODEL}\n`);

  // --- Step 1: auth + connectivity, no cost -------------------------------
  console.log("[1/3] GET /v1/models — checks network, key validity, nothing else. Free.");
  const t1 = Date.now();
  try {
    const res = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const body = await res.text();
    console.log(`  HTTP ${res.status} in ${Date.now() - t1}ms`);
    if (!res.ok) {
      console.log(`  Body: ${preview(body)}`);
      console.error("\n  -> Your key or network is the problem, not image generation. Stopping.");
      return;
    }
    const parsed = JSON.parse(body) as { data?: { id?: string }[] };
    const ids = (parsed.data ?? []).map((m) => m.id).filter(Boolean) as string[];
    console.log(`  OK — ${ids.length} models visible to this key.`);
    const imageModels = ids.filter((id) => id.includes("image"));
    console.log(`  Image-capable models on this key: ${imageModels.length > 0 ? imageModels.join(", ") : "NONE FOUND"}`);
    if (!imageModels.includes(MODEL)) {
      console.log(`  ⚠ "${MODEL}" is NOT in this key's model list — that alone could explain the failures.`);
    }
  } catch (err) {
    console.error(`  Network-level failure: ${err instanceof Error ? err.message : err}`);
    console.error("\n  -> Couldn't reach api.openai.com at all. Stopping.");
    return;
  }

  // --- Step 2: cheapest possible image call -------------------------------
  console.log("\n[2/3] POST /v1/images/generations — smallest, cheapest settings. Costs ~1 cent.");
  const t2 = Date.now();
  const cheap = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, prompt: "A plain red square.", quality: "low", size: "1024x1024", n: 1 }),
  });
  const cheapBody = await cheap.text();
  console.log(`  HTTP ${cheap.status} in ${Date.now() - t2}ms`);
  if (!cheap.ok) {
    console.log(`  Body: ${preview(cheapBody)}`);
    console.error(
      "\n  -> Even the cheapest image call fails. The problem is this key's access to image " +
        "generation (billing, verification, or model availability) — NOT the size/quality settings. Stopping.",
    );
    return;
  }
  console.log(`  OK — image generated, ${cheapBody.length} bytes of JSON returned.`);

  // --- Step 3: the exact settings the showroom script uses ----------------
  console.log("\n[3/3] Same call at the showroom script's real settings (high / 1536x1024). Costs a few cents.");
  const t3 = Date.now();
  const real = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      prompt: "An empty, unfurnished Scandinavian living room with soft natural daylight. No furniture.",
      quality: "high",
      size: "1536x1024",
      n: 1,
    }),
  });
  const realBody = await real.text();
  console.log(`  HTTP ${real.status} in ${Date.now() - t3}ms`);
  if (!real.ok) {
    console.log(`  Body: ${preview(realBody)}`);
    console.error(
      "\n  -> Cheap call works, expensive one doesn't. The trigger is the high quality and/or " +
        "1536x1024 size (likely a long request the connection drops before finishing). " +
        "Fix: drop the showroom script to medium quality / smaller size.",
    );
    return;
  }
  console.log(`  OK — ${realBody.length} bytes returned.`);
  console.log("\nAll three passed. Image generation works right now; the earlier 520s were genuinely transient.");
}

main().catch((err) => {
  console.error("Failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
