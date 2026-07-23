/**
 * Markets Maison's web-sourced "shop the look" extras (posters, items not
 * in our own catalog) can be scoped to. Deliberately client-safe — no SDK
 * imports — so it can be imported from both the server-only search prompt
 * (lib/ai/webProductSearch.ts) and the client-side Looks Studio form
 * (components/LooksStudio.tsx). Keeping this out of webProductSearch.ts
 * matters: that file pulls in the Anthropic SDK at module scope, and a
 * client component importing from it drags the whole server-only SDK chain
 * into the browser bundle — which is what broke Looks Studio's build.
 */
export type TargetMarket = "CH" | "DE" | "AT" | "FR" | "IT" | "EU";

export const TARGET_MARKETS: { id: TargetMarket; label: string }[] = [
  { id: "CH", label: "Switzerland" },
  { id: "DE", label: "Germany" },
  { id: "AT", label: "Austria" },
  { id: "FR", label: "France" },
  { id: "IT", label: "Italy" },
  { id: "EU", label: "Europe (general)" },
];
