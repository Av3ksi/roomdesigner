import { NextRequest, NextResponse } from "next/server";
import { productAspectRatio } from "@/lib/ai/composite";

// sharp needs the Node runtime, not edge.
export const runtime = "nodejs";

/**
 * Computes a product photo's real (padding-trimmed) width:height ratio
 * server-side — see lib/ai/composite.ts's productAspectRatio doc comment
 * for why this can't reliably run in the browser: canvas pixel access to a
 * cross-origin image needs the image host to send CORS headers, and a real,
 * confirmed failure showed vidaXL's product-image host doesn't, so the
 * client silently fell back to the untrimmed (near-square, padded) file
 * ratio — producing a mask a wide sofa then had to be squeezed into. A
 * server-to-server fetch has no such restriction.
 */
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) return NextResponse.json({ error: "Missing url" }, { status: 400 });

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 });
  }
  if (!isSafeExternalUrl(parsed)) {
    return NextResponse.json({ error: "URL not allowed" }, { status: 400 });
  }

  try {
    const res = await fetch(parsed, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return NextResponse.json({ error: `Failed to fetch image: ${res.status}` }, { status: 502 });
    const buffer = Buffer.from(await res.arrayBuffer());
    const aspectRatio = await productAspectRatio(buffer);
    return NextResponse.json({ aspectRatio });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

/**
 * Basic SSRF guard — this route fetches a caller-supplied URL server-side,
 * so it must not be usable to reach internal/loopback/link-local addresses
 * (e.g. cloud metadata endpoints). Only a plain hostname/IP-literal check,
 * not DNS-rebinding-proof — proportionate to what this route does (reads
 * image bytes, returns a single derived number), not a general-purpose
 * fetch proxy.
 */
function isSafeExternalUrl(url: URL): boolean {
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local")) return false;
  if (host === "0.0.0.0" || host === "::1" || host === "[::1]") return false;
  if (/^127\./.test(host)) return false;
  if (/^10\./.test(host)) return false;
  if (/^192\.168\./.test(host)) return false;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false;
  if (/^169\.254\./.test(host)) return false;
  return true;
}
