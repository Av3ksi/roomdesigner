import { NextRequest, NextResponse } from "next/server";
import { loadProductCatalog } from "@/lib/productSearchDb";
import { searchProducts } from "@/lib/productSearch";
import { clientIp, enforceRateLimit } from "@/lib/rateLimit";
import { getOrCreateSessionId } from "@/lib/session";

export const runtime = "nodejs";

/** Backs the product picker on /publish (and anywhere else a client needs catalog search as JSON). Read-only, no AI cost. */
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

  return NextResponse.json({
    products: results.map((p) => ({
      id: p.id,
      name: p.name,
      brand: p.brand,
      price: p.price,
      imageUrl: p.imageUrl ?? null,
      category: p.category,
    })),
  });
}
