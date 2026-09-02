import type { GenerateEvent, GenerateResultPayload } from "./generateEvents";

/**
 * Reads the NDJSON progress stream from /api/finished-rooms/generate.
 *
 * Two things it has to get right, both of which are easy to get subtly
 * wrong and produce a bar that looks broken rather than an error:
 *
 * 1. A chunk is not a line. `ReadableStream` hands over arbitrary byte
 *    boundaries, so a JSON object can and does arrive split across two
 *    reads. Anything after the last newline is held back as a partial.
 *
 * 2. A long step must not look frozen. The render step alone is ~80
 *    seconds, and a bar that sits still for that long reads as a hang. So
 *    between real events the bar is eased forward on a timer toward — but
 *    never past — the end of the current step. The easing is an estimate
 *    and is deliberately capped: it can arrive early and wait, but it can
 *    never claim progress the server hasn't reported.
 */
export interface GenerateStreamHandlers {
  onStep: (step: { label: string; progress: number }) => void;
  /** Smooth interpolation between real events. */
  onEase: (value: number) => void;
  onResult: (result: GenerateResultPayload) => void;
  onError: (message: string) => void;
}

const EASE_TICK_MS = 400;
/**
 * How far into a step the easing is allowed to travel. Short of 1 on
 * purpose: the bar should still visibly jump when the step genuinely
 * completes, and a bar sitting at 100% of a step that hasn't finished is
 * the same lie as a frozen one.
 */
const EASE_CEILING = 0.9;

export async function readGenerateStream(
  body: ReadableStream<Uint8Array>,
  handlers: GenerateStreamHandlers,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffered = "";

  let easeTimer: ReturnType<typeof setInterval> | null = null;
  const stopEasing = () => {
    if (easeTimer !== null) {
      clearInterval(easeTimer);
      easeTimer = null;
    }
  };

  const startEasing = (from: number, span: number, expectedMs: number) => {
    stopEasing();
    const startedAt = Date.now();
    easeTimer = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const ratio = Math.min(EASE_CEILING, elapsed / Math.max(expectedMs, 1) * EASE_CEILING);
      handlers.onEase(Math.min(1, from + span * ratio));
    }, EASE_TICK_MS);
  };

  const handle = (event: GenerateEvent) => {
    if (event.type === "step") {
      handlers.onStep({ label: event.label, progress: event.progress });
      startEasing(event.progress, event.spanFraction, event.expectedMs);
      return;
    }
    stopEasing();
    if (event.type === "result") handlers.onResult(event.result);
    else handlers.onError(event.error);
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffered += decoder.decode(value, { stream: true });

      const lines = buffered.split("\n");
      // The last element is whatever came after the final newline — an
      // incomplete object unless the chunk happened to end cleanly. Keep it.
      buffered = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        handle(JSON.parse(trimmed) as GenerateEvent);
      }
    }
    const tail = buffered.trim();
    if (tail) handle(JSON.parse(tail) as GenerateEvent);
  } finally {
    stopEasing();
    reader.releaseLock();
  }
}
