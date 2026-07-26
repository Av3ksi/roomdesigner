/**
 * Regression-test agent for the finished-rooms generate pipeline
 * (app/api/finished-rooms/generate/route.ts — the same code Looks Studio's
 * "Generate scene" button calls). Runs a fixed set of real scenarios you
 * define once, and flags exactly the kinds of regressions this session kept
 * finding by hand: a product that didn't render, a room that drifted from
 * the original photo, objects with no pin at all.
 *
 * Calls the route's POST handler directly, in-process — not a re-
 * implementation of the pipeline (which would drift out of sync the next
 * time route.ts changes) and not an HTTP call to a separately-running dev
 * server (one less thing that has to be up and configured right).
 *
 * Setup (once):
 *   cp scripts/test-scenarios.example.json scripts/test-scenarios.json
 *   Edit that file: your own room photo path(s) + real product ids (find
 *   ids with `npx tsx scripts/list-products.ts`). This file is gitignored —
 *   it's your personal local paths, not something to commit.
 *
 * Usage:
 *   npx tsx scripts/test-generate.ts
 *
 * Real money: every scenario is a full generate call — same cost as
 * clicking "Generate scene" in Looks Studio. Keep the scenario list short
 * (a handful) and quality "low" for routine regression checks; this is a
 * spot-check tool, not a large test suite to run on every keystroke.
 */
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import type { NextRequest } from "next/server";
import { POST } from "../app/api/finished-rooms/generate/route";

try {
  process.loadEnvFile?.();
} catch {
  // No .env file yet — fall through to the route's own "not configured" errors below.
}

interface Scenario {
  name: string;
  roomPhotoPath: string;
  productIds: string[];
  styleDirection?: string;
  quality?: "low" | "medium" | "high";
  targetMarket?: string;
}

interface GenerateResponseBody {
  error?: string;
  totalPrice?: number;
  productIds?: string[];
  externals?: unknown[];
  unavailable?: unknown[];
  checks?: { name: string; pass: boolean | null; note: string | null }[];
}

const SCENARIOS_PATH = join(process.cwd(), "scripts", "test-scenarios.json");
const EXAMPLE_PATH = join(process.cwd(), "scripts", "test-scenarios.example.json");

// Past this many pinless objects, treat it as a regression worth flagging —
// a couple of unavailable pins is normal (uncataloged decor), a pile of them
// usually means something upstream (detection, catalog matching) broke.
const UNAVAILABLE_WARN_THRESHOLD = 3;

async function runScenario(scenario: Scenario): Promise<boolean> {
  console.log(`\n=== ${scenario.name} ===`);

  if (!existsSync(scenario.roomPhotoPath)) {
    console.error(`  ✗ room photo not found: ${scenario.roomPhotoPath}`);
    return false;
  }

  const form = new FormData();
  form.append("room", new Blob([new Uint8Array(readFileSync(scenario.roomPhotoPath))]), "room.jpg");
  form.append("productIds", JSON.stringify(scenario.productIds));
  form.append("quality", scenario.quality ?? "low");
  if (scenario.styleDirection) form.append("styleDirection", scenario.styleDirection);
  if (scenario.targetMarket) form.append("targetMarket", scenario.targetMarket);

  // A plain Request satisfies everything the route actually uses (req.formData())
  // — casting to NextRequest avoids depending on Next's server runtime just to
  // construct one.
  const req = new Request("http://localhost/api/finished-rooms/generate", { method: "POST", body: form });

  const start = Date.now();
  let res: Response;
  try {
    res = await POST(req as unknown as NextRequest);
  } catch (err) {
    console.error(`  ✗ threw: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
  const ms = Date.now() - start;
  const body = (await res.json()) as GenerateResponseBody;

  if (!res.ok) {
    console.error(`  ✗ HTTP ${res.status} after ${ms}ms: ${body.error}`);
    return false;
  }

  const problems: string[] = [];
  const failedChecks = (body.checks ?? []).filter((c) => c.pass === false);
  if (failedChecks.length > 0) {
    problems.push(`${failedChecks.length} item(s) failed QA: ${failedChecks.map((c) => `"${c.name}" (${c.note})`).join("; ")}`);
  }
  const unavailableCount = body.unavailable?.length ?? 0;
  if (unavailableCount > UNAVAILABLE_WARN_THRESHOLD) {
    problems.push(`${unavailableCount} detected objects have no pin at all — more than usual, worth a look`);
  }

  if (problems.length > 0) {
    console.warn(`  ⚠ completed in ${ms}ms with issues:`);
    problems.forEach((p) => console.warn(`     - ${p}`));
    return false;
  }

  console.log(
    `  ✓ passed in ${ms}ms — CHF ${body.totalPrice}, ${body.productIds?.length ?? 0} product(s), ` +
      `${body.externals?.length ?? 0} external(s), ${unavailableCount} unavailable`,
  );
  return true;
}

async function main() {
  if (!existsSync(SCENARIOS_PATH)) {
    console.error(`No scenarios file found at ${SCENARIOS_PATH}.`);
    console.error(`Copy ${EXAMPLE_PATH} to test-scenarios.json and fill in your own room photo path(s) + real`);
    console.error(`product ids (find real ids with: npx tsx scripts/list-products.ts).`);
    process.exit(1);
  }

  const scenarios: Scenario[] = JSON.parse(readFileSync(SCENARIOS_PATH, "utf8"));
  if (!Array.isArray(scenarios) || scenarios.length === 0) {
    console.error(`${SCENARIOS_PATH} has no scenarios — add at least one (see test-scenarios.example.json).`);
    process.exit(1);
  }

  let passCount = 0;
  for (const scenario of scenarios) {
    if (await runScenario(scenario)) passCount++;
  }

  console.log(`\n${passCount}/${scenarios.length} scenario(s) passed.`);
  if (passCount < scenarios.length) process.exit(1);
}

main().catch((err) => {
  console.error("Test run failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
