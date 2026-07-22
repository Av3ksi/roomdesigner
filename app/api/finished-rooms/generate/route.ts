import { NextRequest, NextResponse } from "next/server";
import { aiEnabled } from "@/lib/ai/claude";
import { checkRenderedProductIdentity } from "@/lib/ai/identityCheck";
import { compositingEnabled, composeSceneWithProducts, reshapeBoxForProduct, type SceneItem } from "@/lib/ai/composite";
import { suggestPlacements } from "@/lib/ai/placement";
import { detectUnaccountedItems, locateExistingObject, locateProductInImage } from "@/lib/ai/locate";
import { searchWebForProduct, type WebProduct } from "@/lib/ai/webProductSearch";
import { findBestCatalogMatch } from "@/lib/productSearch";
import { loadProductCatalog } from "@/lib/productSearchDb";
import type { DetectionBox, Product, ProductCategory } from "@/lib/types";

// sharp (compositing) needs the Node runtime, not edge.
export const runtime = "nodejs";

/** An external web product paired with where the item it stands in for sits in the render. */
interface WebExternalItem extends WebProduct {
  box: DetectionBox | null;
}

/** Fetch a catalog match's photo and locate that exact product in the render (null on any failure). */
async function locateMatchedProduct(finalImage: Buffer, imageUrl: string, category: ProductCategory): Promise<DetectionBox | null> {
  try {
    const res = await fetch(imageUrl);
    if (!res.ok) return null;
    const photo = Buffer.from(await res.arrayBuffer());
    const located = await locateProductInImage(finalImage, photo, category);
    return located?.box ?? null;
  } catch {
    return null;
  }
}

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

    // Where each product actually ended up in the FINAL image — located by
    // matching the product's OWN photo against the render (not "any object
    // of this category"), so a hotspot can't attach to a different piece the
    // restyle staged in. A product that isn't visibly present gets no box.
    const itemBoxes: Record<string, DetectionBox> = {};
    const [checks] = await Promise.all([
      Promise.all(
        products.map(async (product, i) => {
          const check = await checkRenderedProductIdentity(items[i].productPhoto, finalImage, items[i].box);
          return { productId: product.id, name: product.name, pass: check?.pass ?? null, note: check?.note ?? null };
        }),
      ),
      Promise.all(
        products.map(async (product, i) => {
          const located = await locateProductInImage(finalImage, items[i].productPhoto, product.category);
          if (located) itemBoxes[product.id] = located.box;
        }),
      ),
    ]);

    // Showroom-restyle mode stages in extra pieces beyond what was picked (a
    // bed, a poster). Make each shoppable: first try our OWN catalog (real
    // dropship margin); if we don't carry it, fall back to a live web search
    // for a real product page the customer can buy from (a stopgap — no
    // margin, clearly marked external, until we source it ourselves).
    const autoMatched: { product: Product; box: DetectionBox | null }[] = [];
    const externals: WebExternalItem[] = [];
    if (styleDirection) {
      const extras = await detectUnaccountedItems(
        finalImage,
        products.map((p) => p.name),
      );
      for (const extra of extras) {
        // One instance per category — locating a second item of a category
        // already used can't reliably distinguish the two.
        if (seenCategories.has(extra.category)) continue;
        seenCategories.add(extra.category);

        const match = findBestCatalogMatch(catalog, extra.description);
        if (match && !autoMatched.some((a) => a.product.id === match.id)) {
          const box = match.imageUrl ? await locateMatchedProduct(finalImage, match.imageUrl, match.category) : null;
          autoMatched.push({ product: match, box });
          continue;
        }

        const web = await searchWebForProduct(extra.webQuery);
        if (web) {
          const located = await locateExistingObject(finalImage, extra.category);
          externals.push({ ...web, box: located?.box ?? null });
        }
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
      externals,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
