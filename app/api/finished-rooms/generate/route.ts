import { NextRequest, NextResponse } from "next/server";
import { aiEnabled } from "@/lib/ai/claude";
import { checkRenderedProductIdentity } from "@/lib/ai/identityCheck";
import { compositingEnabled, composeSceneWithProducts, reshapeBoxForProduct, type SceneItem } from "@/lib/ai/composite";
import { suggestPlacements } from "@/lib/ai/placement";
import { detectUnaccountedItems, locateExistingObject } from "@/lib/ai/locate";
import { findBestCatalogMatch } from "@/lib/productSearch";
import { loadProductCatalog } from "@/lib/productSearchDb";
import type { DetectionBox, Product } from "@/lib/types";

// sharp (compositing) needs the Node runtime, not edge.
export const runtime = "nodejs";

/**
 * Powers the in-app Looks Studio (components/LooksStudio.tsx) — the same
 * pipeline as scripts/compose-finished-room.ts, as a preview step: renders
 * the scene and reviews it, but does NOT save anything. Saving is a
 * separate, explicit POST to /api/finished-rooms once the curator has
 * actually looked at the result — same "generate, review, then commit"
 * shape as the rest of this app's paid actions.
 */
export async function POST(req: NextRequest) {
  if (!aiEnabled()) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured on the server." }, { status: 501 });
  }
  if (!compositingEnabled()) {
    return NextResponse.json({ error: "OPENAI_API_KEY not configured on the server." }, { status: 501 });
  }

  const form = await req.formData().catch(() => null);
  const roomFile = form?.get("room");
  const productIdsRaw = form?.get("productIds");
  if (!form || !(roomFile instanceof File) || typeof productIdsRaw !== "string") {
    return NextResponse.json({ error: "Missing room photo or productIds." }, { status: 400 });
  }

  let productIds: string[];
  try {
    productIds = JSON.parse(productIdsRaw);
    if (!Array.isArray(productIds) || productIds.length === 0) throw new Error("empty");
  } catch {
    return NextResponse.json({ error: "productIds must be a non-empty JSON array of ids." }, { status: 400 });
  }

  const qualityRaw = form.get("quality");
  const quality = (qualityRaw === "low" || qualityRaw === "high" ? qualityRaw : "medium") as "low" | "medium" | "high";

  // Optional: restyles the whole room (walls, lighting, staging) around the
  // products instead of leaving the photo untouched — showroom mode.
  const styleDirectionRaw = form.get("styleDirection");
  const styleDirection = typeof styleDirectionRaw === "string" && styleDirectionRaw.trim() ? styleDirectionRaw.trim() : undefined;

  const catalog = await loadProductCatalog();
  const byId = new Map(catalog.map((p) => [p.id, p]));
  const products: Product[] = [];
  const seenCategories = new Set<string>();
  for (const id of productIds) {
    const p = byId.get(id);
    if (!p) return NextResponse.json({ error: `Unknown product id "${id}".` }, { status: 400 });
    if (!p.imageUrl) return NextResponse.json({ error: `"${p.name}" has no photo — can't be composited.` }, { status: 400 });
    if (seenCategories.has(p.category)) {
      return NextResponse.json(
        { error: `Two products share the category "${p.category}" — pick one item per category.` },
        { status: 400 },
      );
    }
    seenCategories.add(p.category);
    products.push(p);
  }

  const roomPhoto = Buffer.from(await roomFile.arrayBuffer());

  try {
    const placement = await suggestPlacements(roomPhoto);
    if (!placement) {
      return NextResponse.json({ error: "Room placement analysis failed — try again." }, { status: 502 });
    }

    const items: SceneItem[] = [];
    for (const product of products) {
      const productRes = await fetch(product.imageUrl!);
      if (!productRes.ok) {
        return NextResponse.json({ error: `Failed to fetch photo for "${product.name}".` }, { status: 502 });
      }
      const productPhoto = Buffer.from(await productRes.arrayBuffer());
      const suggestion = placement.placements[product.category];
      const box = await reshapeBoxForProduct(suggestion.box, productPhoto);
      items.push({ productPhoto, category: product.category, box, wallAngleDeg: suggestion.wallAngleDeg });
    }

    const result = await composeSceneWithProducts(roomPhoto, items, quality, styleDirection);
    const finalImage = Buffer.from(result.imageBase64, "base64");

    // Where each product actually ended up in the FINAL image — the
    // pre-generation box (items[i].box) is only a placement suggestion, and
    // showroom-restyle mode is explicitly free to ignore it. Locating
    // against the finished render is what makes hotspots reliable.
    const itemBoxes: Record<string, DetectionBox> = {};
    const [checks] = await Promise.all([
      Promise.all(
        products.map(async (product, i) => {
          const check = await checkRenderedProductIdentity(items[i].productPhoto, finalImage, items[i].box);
          return { productId: product.id, name: product.name, pass: check?.pass ?? null, note: check?.note ?? null };
        }),
      ),
      Promise.all(
        products.map(async (product) => {
          const located = await locateExistingObject(finalImage, product.category);
          if (located) itemBoxes[product.id] = located.box;
        }),
      ),
    ]);

    // Showroom-restyle mode stages in extra pieces beyond what was picked
    // (a bed, a second lamp) for atmosphere — by default unlabeled and
    // unpurchasable. Try to turn genuine matches into sellable hotspots
    // too, but ONLY against our own catalog (never an external retailer —
    // we can only fulfill what our real dropship supplier carries).
    const autoMatched: { product: Product; box: DetectionBox | null }[] = [];
    if (styleDirection) {
      const extras = await detectUnaccountedItems(
        finalImage,
        products.map((p) => p.name),
      );
      for (const extra of extras) {
        const match = findBestCatalogMatch(catalog, extra.description);
        if (!match) continue;
        // Skip a category already used by an explicit pick — locating a
        // second instance of the same category can't reliably tell the two
        // apart (see lib/ai/locate.ts: "if multiple match, pick the most
        // prominent one"), risking a duplicate hotspot at the same spot.
        if (seenCategories.has(match.category)) continue;
        if (autoMatched.some((a) => a.product.id === match.id)) continue;
        const located = await locateExistingObject(finalImage, match.category);
        autoMatched.push({ product: match, box: located?.box ?? null });
        seenCategories.add(match.category);
      }
    }

    const allProducts = [...products, ...autoMatched.map((a) => a.product)];
    const allItemBoxes = { ...itemBoxes };
    for (const a of autoMatched) if (a.box) allItemBoxes[a.product.id] = a.box;

    const totalPrice = allProducts.reduce((sum, p) => sum + p.price, 0);
    const styleTags = Array.from(new Set(allProducts.flatMap((p) => p.styles)));

    return NextResponse.json({
      imageBase64: result.imageBase64,
      totalPrice,
      styleTags,
      productIds: allProducts.map((p) => p.id),
      itemBoxes: allItemBoxes,
      checks,
      autoMatched: autoMatched.map((a) => ({ productId: a.product.id, name: a.product.name, price: a.product.price })),
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
