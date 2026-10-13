/**
 * Measures how long each image provider actually takes for the two things
 * this app does, and prints statistics rather than a single anecdote.
 *
 * The number this exists to attack: one masked composite takes 70-140s,
 * which is the worst figure in the product. Before rewriting the pipeline
 * around Gemini or xAI, it is worth knowing whether they are meaningfully
 * faster AT THE SAME WORK — and whether they can do that work at all.
 *
 * WHAT IT MEASURES, per provider, per operation:
 *   ttfb   time until response headers — essentially the model thinking
 *   total  time until the last byte arrived — ttfb plus download
 *   bytes  payload size, which is what your uplink/downlink has to carry
 * reported as median, p90, min and max across N trials, plus a success
 * rate. Medians, because a single Cloudflare 520 or one slow call skews a
 * mean badly and this codebase has already been burned by exactly that.
 *
 * WHY TTFB AND TOTAL ARE REPORTED SEPARATELY: on a slow home uplink they
 * diverge a lot, and conflating them sent an earlier debugging session
 * chasing "OpenAI is slow" when the connection was the variable. If total
 * is much larger than ttfb, the fix is transfer size, not the provider.
 *
 * READ THE editWithMask COLUMN CAREFULLY. Only OpenAI accepts an explicit
 * edit mask. Gemini and xAI edit by prompt alone, so a faster edit time
 * from them is not a like-for-like win — losing the mask means losing the
 * guarantee that the rest of the room is untouched. The table marks this;
 * see lib/ai/imageProviders.ts for the full explanation.
 *
 * THIS COSTS REAL MONEY. Every trial generates a real image on a real
 * account. Default is 3 trials per operation per configured provider, and
 * it prints the plan and the provider list before starting.
 *
 * Usage:
 *   npx tsx scripts/bench-image-providers.ts              # 3 trials each
 *   npx tsx scripts/bench-image-providers.ts 5            # 5 trials each
 *   npx tsx scripts/bench-image-providers.ts 3 --t2i-only # skip the edits
 *
 * Set only the keys you want tested — a provider with no key is skipped,
 * not failed. Keys are read from .env and never printed.
 */
import sharp from "sharp";
import { buildMaskPng } from "../lib/ai/imageMasking";
import { IMAGE_PROVIDERS, type ImageProvider, type ImageResult } from "../lib/ai/imageProviders";

try {
  process.loadEnvFile?.();
} catch {
  // No .env file yet — the "no providers configured" message below covers it.
}

const T2I_PROMPT =
  "Photorealistic interior photograph of an empty modern living room, matte charcoal walls, " +
  "oak floor, large window with soft daylight, no furniture, shot on a 35mm lens at f/4, " +
  "natural colour, architectural photography.";

const EDIT_PROMPT =
  "Place a single dark green velvet two-seater sofa against the back wall of this room. " +
  "Keep the walls, floor, window and lighting exactly as they are. Photorealistic, matched perspective.";

interface Sample {
  ttfbMs: number;
  totalMs: number;
  bytes: number;
}

interface OperationResult {
  samples: Sample[];
  failures: string[];
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function stats(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    median: percentile(sorted, 50),
    p90: percentile(sorted, 90),
    min: sorted[0] ?? 0,
    max: sorted[sorted.length - 1] ?? 0,
  };
}

const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(2)}MB`;

/**
 * A 1536x1024 room and its edit mask, built with the pipeline's OWN
 * buildMaskPng and the same mask region a real composite logs
 * ({ x: 0, y: 0.25, w: 1, h: 0.75 }). Reusing it rather than hand-rolling
 * a mask is the point: a benchmark that constructs the operation slightly
 * differently from production measures something production never does.
 * The first attempt here did exactly that and produced a mask with no
 * editable pixels at all.
 */
async function makeEditInputs(): Promise<{ room: Buffer; mask: Buffer }> {
  const width = 1536;
  const height = 1024;
  const room = await sharp({
    create: { width, height, channels: 3, background: { r: 62, g: 66, b: 74 } },
  }).png().toBuffer();
  const mask = await buildMaskPng(width, height, { x: 0, y: 0.25, w: 1, h: 0.75 }, 0);
  return { room, mask };
}

async function runOperation(
  label: string,
  trials: number,
  call: () => Promise<ImageResult>,
): Promise<OperationResult> {
  const samples: Sample[] = [];
  const failures: string[] = [];
  for (let i = 1; i <= trials; i++) {
    process.stdout.write(`    ${label} trial ${i}/${trials}... `);
    try {
      const r = await call();
      samples.push({ ttfbMs: r.ttfbMs, totalMs: r.totalMs, bytes: r.bytes });
      console.log(`${secs(r.totalMs)} (ttfb ${secs(r.ttfbMs)}, ${mb(r.bytes)})`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      failures.push(message);
      console.log(`FAILED — ${message.slice(0, 140)}`);
    }
  }
  return { samples, failures };
}

function reportRow(provider: ImageProvider, op: string, result: OperationResult, trials: number): string {
  if (result.samples.length === 0) {
    return `  ${provider.label.padEnd(38)} ${op.padEnd(12)} no successful trial (${result.failures.length}/${trials} failed)`;
  }
  const total = stats(result.samples.map((s) => s.totalMs));
  const ttfb = stats(result.samples.map((s) => s.ttfbMs));
  const bytes = stats(result.samples.map((s) => s.bytes));
  const ok = `${result.samples.length}/${trials}`;
  return (
    `  ${provider.label.padEnd(38)} ${op.padEnd(12)} ` +
    `median ${secs(total.median).padStart(6)}  p90 ${secs(total.p90).padStart(6)}  ` +
    `ttfb ${secs(ttfb.median).padStart(6)}  ${mb(bytes.median).padStart(7)}  ok ${ok}`
  );
}

async function main() {
  const args = process.argv.slice(2);
  const t2iOnly = args.includes("--t2i-only");
  const trialArg = args.find((a) => /^\d+$/.test(a));
  const trials = Math.max(1, Math.min(Number(trialArg ?? 3), 20));

  const configured = IMAGE_PROVIDERS.filter((p) => p.enabled());
  const skipped = IMAGE_PROVIDERS.filter((p) => !p.enabled());

  if (configured.length === 0) {
    console.error("No image providers are configured. Add at least one key to .env:");
    for (const p of IMAGE_PROVIDERS) console.error(`  ${p.envVar}   (${p.label})`);
    process.exit(1);
  }

  console.log("Image provider benchmark");
  console.log(`  trials per operation: ${trials}`);
  console.log(`  operations:           text-to-image${t2iOnly ? "" : " + image edit"}`);
  console.log(`  providers:            ${configured.map((p) => p.label).join(", ")}`);
  if (skipped.length > 0) console.log(`  skipped (no key):     ${skipped.map((p) => `${p.label} [${p.envVar}]`).join(", ")}`);
  const totalCalls = configured.length * trials * (t2iOnly ? 1 : 2);
  console.log(`\n  This will generate ${totalCalls} real image(s) and bill each provider accordingly.\n`);

  const editInputs = t2iOnly ? null : await makeEditInputs();
  const rows: string[] = [];
  const notes: string[] = [];

  for (const provider of configured) {
    console.log(`${provider.label}  [model ${provider.model}]`);

    const t2i = await runOperation("text-to-image", trials, () => provider.textToImage(T2I_PROMPT, "1536x1024"));
    rows.push(reportRow(provider, "text2image", t2i, trials));

    if (editInputs) {
      const edit = await runOperation("image edit  ", trials, () =>
        provider.editImage(EDIT_PROMPT, editInputs.room, provider.supportsMask ? editInputs.mask : undefined),
      );
      rows.push(reportRow(provider, provider.supportsMask ? "edit+MASK" : "edit-no-mask", edit, trials));
      if (!provider.supportsMask && edit.samples.length > 0) {
        notes.push(
          `${provider.label} edits by prompt only — it has no mask parameter, so its edit timing is NOT ` +
            "comparable to OpenAI's. Without a mask there is no guarantee the rest of the room is left alone.",
        );
      }
      if (edit.samples.length === 0 && edit.failures.length > 0) {
        notes.push(`${provider.label} could not perform an image edit at all: ${edit.failures[0].slice(0, 160)}`);
      }
    }
    console.log("");
  }

  console.log("Results (median of successful trials; lower is better)\n");
  for (const row of rows) console.log(row);

  if (notes.length > 0) {
    console.log("\nRead before acting on the numbers:");
    for (const note of notes) console.log(`  - ${note}`);
  }

  console.log(
    "\nIf total is much larger than ttfb for every provider, the bottleneck is your connection,\n" +
      "not the model — switching providers will not fix that, smaller payloads will.",
  );
}

main().catch((err) => {
  console.error("Failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
