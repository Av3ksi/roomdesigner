/**
 * The two pieces of OpenAI configuration that both lib/ai/composite.ts and
 * lib/ai/openaiImageGen.ts need.
 *
 * This module exists purely to break a circular import: composite.ts owns
 * the compositing calls and openaiImageGen.ts owns the shared retry logic
 * those calls go through, so each needed something from the other. A cycle
 * typechecks fine but is fragile at runtime under ESM — whichever module
 * initializes second can observe the other's bindings uninitialized. One
 * leaf module both can depend on removes the cycle entirely.
 *
 * composite.ts re-exports both names, so the many existing
 * `import { compositingEnabled } from "./composite"` call sites across the
 * app keep working unchanged.
 */

export function compositingEnabled(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

export const MODEL = "gpt-image-1.5";
