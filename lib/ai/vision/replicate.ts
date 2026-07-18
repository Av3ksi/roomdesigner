/**
 * Replicate-hosted vision models — Phase 2's segmentation/depth stack
 * (docs/BLUEPRINT.md's AI Pipeline section). A new provider beyond the
 * Claude/OpenAI ones already integrated, gated behind REPLICATE_API_TOKEN
 * and completely inert without it, same as every other integration in this
 * app. Model choice is deliberately an env var, not a hardcoded version
 * hash — Replicate models get deprecated/renamed; verify the exact
 * `owner/name` slug you want on replicate.com before setting it, the same
 * "verify on your machine" pattern used for VidaXL/OpenAI/Claude here.
 */

export function replicateEnabled(): boolean {
  return Boolean(process.env.REPLICATE_API_TOKEN);
}

const API_BASE = "https://api.replicate.com/v1";
const POLL_INTERVAL_MS = 1500;
const MAX_POLLS = 60; // ~90s ceiling — generous for a single-image vision model

interface ReplicatePrediction {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output: unknown;
  error: string | null;
}

function authHeader(): Record<string, string> {
  return { Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}` };
}

/**
 * Runs a Replicate model to completion via its `owner/name` slug — always
 * that model's latest version, so there's no version hash to keep in sync
 * as the model updates. Throws on failure/timeout; callers decide how to
 * degrade (every caller in this codebase treats vision failures as
 * "feature unavailable this turn", never a hard crash).
 */
export async function runReplicateModel(modelSlug: string, input: Record<string, unknown>): Promise<unknown> {
  if (!replicateEnabled()) throw new Error("REPLICATE_API_TOKEN not configured");

  const createRes = await fetch(`${API_BASE}/models/${modelSlug}/predictions`, {
    method: "POST",
    headers: { ...authHeader(), "Content-Type": "application/json" },
    body: JSON.stringify({ input }),
  });
  if (!createRes.ok) {
    throw new Error(`Replicate prediction create failed: ${createRes.status} ${await createRes.text()}`);
  }
  let prediction = (await createRes.json()) as ReplicatePrediction;

  for (
    let i = 0;
    i < MAX_POLLS && prediction.status !== "succeeded" && prediction.status !== "failed" && prediction.status !== "canceled";
    i++
  ) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    const pollRes = await fetch(`${API_BASE}/predictions/${prediction.id}`, { headers: authHeader() });
    if (!pollRes.ok) throw new Error(`Replicate prediction poll failed: ${pollRes.status}`);
    prediction = (await pollRes.json()) as ReplicatePrediction;
  }

  if (prediction.status === "failed" || prediction.status === "canceled") {
    throw new Error(`Replicate prediction ${prediction.status}: ${prediction.error ?? "unknown error"}`);
  }
  if (prediction.status !== "succeeded") {
    throw new Error("Replicate prediction timed out");
  }
  return prediction.output;
}

/** Replicate outputs are usually URLs to the generated asset, not inline data — fetches one into a Buffer. */
export async function fetchReplicateOutput(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch Replicate output: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}
