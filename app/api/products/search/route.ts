import { NextRequest, NextResponse } from "next/server";
import { loadProductCatalog } from "@/lib/productSearchDb";
import { searchProducts } from "@/lib/productSearch";
import { clientIp, enforceRateLimit } from "@/lib/rateLimit";
import { getOrCreateSessionId } from "@/lib/session";

export const runtime = "nodejs";

/**
 * Backs the product pickers on /publish and the Designer's catalog-add panel.
 * Returns full Product objects — the Designer needs category/dimensionsCm/
 * supplier to build a real add-proposal, not just display fields. Read-only,
 * no AI cost.
 */
export async function GET(req: NextRequest) {
  const limited = await enforceRateLimit({
    name: "products-search",
    sessionId: await getOrCreateSessionId(),
    ip: clientIp(req),
    sessionLimit: 60,
    ipLimit: 180,
  });
  if (limited) return NextResponse.json({ error: limited.error }, { status: 429 });

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!q) return NextResponse.json({ products: [] });

  const catalog = await loadProductCatalog();
  const results = searchProducts(catalog, { keywords: q.split(/\s+/).filter(Boolean), limit: 12 });

  return NextResponse.json({ products: results });
}
