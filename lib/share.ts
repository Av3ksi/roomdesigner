import type { RoomSnapshot } from "./types";

/**
 * Stateless share links: the entire room (spec + resolved product basket)
 * is encoded into the URL itself, so a shared room reconstructs pixel-exact
 * without a backend. UTF-8 safe (brand names carry accents).
 */

function toBase64Url(json: string): string {
  const bytes = new TextEncoder().encode(json);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(encoded: string): string {
  const padded = encoded.replace(/-/g, "+").replace(/_/g, "/").padEnd(encoded.length + ((4 - (encoded.length % 4)) % 4), "=");
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function encodeSnapshot(snapshot: RoomSnapshot): string {
  return toBase64Url(JSON.stringify(snapshot));
}

export function decodeSnapshot(encoded: string): RoomSnapshot | null {
  try {
    const parsed = JSON.parse(fromBase64Url(encoded)) as RoomSnapshot;
    if (!parsed || !parsed.spec || !Array.isArray(parsed.products)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function shareUrlFor(snapshot: RoomSnapshot): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/shared?d=${encodeSnapshot(snapshot)}`;
}
