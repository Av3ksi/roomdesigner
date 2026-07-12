/**
 * Deterministic mood → style mapping. A free-text description ("a calm
 * morning retreat", "moody dinner-party energy") is scored against each
 * style's keyword set and mapped to a ranked style plus a suggested accent —
 * the same "understand intent, resolve deterministically" split used
 * throughout the app (see lib/products.ts) rather than inventing product or
 * style data from the LLM.
 */

interface MoodProfile {
  keywords: string[];
  accent: string | null;
}

export const MOOD_PROFILES: Record<string, MoodProfile> = {
  scandinavian: { keywords: ["calm", "serene", "light", "airy", "bright", "fresh", "simple", "clean", "peaceful", "morning"], accent: null },
  japandi: { keywords: ["quiet", "zen", "meditative", "still", "balanced", "tranquil", "minimal", "wabi", "sabi", "slow"], accent: "#8A9B84" },
  modernluxury: { keywords: ["glamorous", "opulent", "sophisticated", "polished", "sleek", "chic", "editorial", "statement"], accent: "#C8A96E" },
  minimalist: { keywords: ["minimal", "sparse", "clarity", "empty", "pure", "essential", "uncluttered", "spare"], accent: null },
  industrial: { keywords: ["raw", "urban", "loft", "gritty", "edgy", "warehouse", "exposed", "masculine", "rugged"], accent: "#6E3B33" },
  organicmodern: { keywords: ["natural", "earthy", "organic", "grounded", "textured", "biophilic", "nature", "botanical"], accent: "#5A7058" },
  mediterranean: { keywords: ["sunny", "coastal", "vacation", "warm", "breezy", "holiday", "seaside", "summer", "terracotta"], accent: "#C0603A" },
  darkluxury: { keywords: ["moody", "dramatic", "sultry", "bold", "nightlife", "seductive", "cinematic", "intense", "dinner", "party"], accent: "#2B3A4A" },
  cozy: { keywords: ["cozy", "hygge", "warm", "snug", "comfort", "cabin", "fireplace", "reading", "weekend", "rainy"], accent: "#6E3B33" },
  classic: { keywords: ["timeless", "elegant", "traditional", "heritage", "refined", "formal", "stately", "old-money"], accent: null },
};

export interface MoodMatch {
  styleId: string;
  score: number;
  accent: string | null;
}

/** Scores every style against the input text and returns them ranked best-first. */
export function matchMood(text: string): MoodMatch[] {
  const t = text.toLowerCase();
  const results = Object.entries(MOOD_PROFILES).map(([styleId, profile]) => {
    const score = profile.keywords.reduce((n, kw) => (t.includes(kw) ? n + 1 : n), 0);
    return { styleId, score, accent: profile.accent };
  });
  results.sort((a, b) => b.score - a.score);
  return results;
}

/** Best single match, falling back to a safe default when nothing scores. */
export function bestMoodMatch(text: string): MoodMatch {
  const ranked = matchMood(text);
  if (ranked[0]?.score > 0) return ranked[0];
  return { styleId: "organicmodern", score: 0, accent: null };
}
