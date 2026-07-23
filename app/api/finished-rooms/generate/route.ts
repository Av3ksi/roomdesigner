import { NextRequest, NextResponse } from "next/server";
import { aiEnabled, describeAiError } from "@/lib/ai/claude";
import { compositingEnabled, composeSceneWithProducts, reshapeBoxForProduct, type SceneItem } from "@/lib/ai/composite";
import { suggestPlacementsStrict } from "@/lib/ai/placement";
import { detectSceneItems } from "@/lib/ai/locate";
import { searchWebForProduct, TARGET_MARKETS, type TargetMarket, type WebProduct } from "@/lib/ai/webProductSearch";
import { findBestCatalogMatch } from "@/lib/productSearch";
import { loadProductCatalog } from "@/lib/productSearchDb";
import type { DetectionBox, Product } from "@/lib/types";

// sharp (compositing) needs the Node runtime, not edge.
export const runtime = "nodejs";

/** An external web product paired with where the item it stands in for sits in the render. */
interface WebExternalItem extends WebProduct {
  box: DetectionBox | null;
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

  // Which market web-sourced externals (posters, etc. not in our own
  // catalog) should target — see lib/ai/webProductSearch.ts. Defaults to
  // Switzerland, this business's home market.
  const marketRaw = form.get("targetMarket");
  const targetMarket: TargetMarket = TARGET_MARKETS.some((m) => m.id === marketRaw) ? (marketRaw as TargetMarket) : "CH";

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
    // Strict: this is a paid curator tool, so a failed analysis must say WHY
    // (bad key, no credits, overloaded) rather than silently fall back to
    // context-blind default boxes. It also runs BEFORE the OpenAI render, so a
    // dead key fails fast and cheap instead of after paying for an image.
    const placement = await suggestPlacementsStrict(roomPhoto);

    // Fetch every product photo and reshape its placement box together — one
    // slow network round-trip per product otherwise stacks up before the
    // render starts. A failed fetch throws and is handled by the outer catch.
    const items: SceneItem[] = await Promise.all(
      products.map(async (product): Promise<SceneItem> => {
        const productRes = await fetch(product.imageUrl!);
        if (!productRes.ok) throw new Error(`Failed to fetch photo for "${product.name}".`);
        const productPhoto = Buffer.from(await productRes.arrayBuffer());
        const suggestion = placement.placements[product.category];
        const box = await reshapeBoxForProduct(suggestion.box, productPhoto);
        return { productPhoto, category: product.category, box, wallAngleDeg: suggestion.wallAngleDeg };
      }),
    );

    const result = await composeSceneWithProducts(roomPhoto, items, quality, styleDirection);
    const finalImage = Buffer.from(result.imageBase64, "base64");

    // ONE detection pass over the finished render: every distinct object,
    // its box, and whether it's one of the placed products (by 1-based
    // index) or an extra. This replaces per-product locate calls that
    // guessed independently and cross-labeled objects.
    const detected = await detectSceneItems(
      finalImage,
      products.map((p, i) => ({ index: i + 1, name: p.name, category: p.category })),
    );

    const itemBoxes: Record<string, DetectionBox> = {};
    const autoMatched: { product: Product; box: DetectionBox }[] = [];
    const usedProductIds = new Set<string>();
    // Extras that need a web search — collected, then run in parallel.
    const webCandidates: { box: DetectionBox; query: string }[] = [];

    for (const d of detected) {
      // Is this object one of the products the designer placed?
      if (d.pickedIndex >= 1 && d.pickedIndex <= products.length) {
        const p = products[d.pickedIndex - 1];
        if (!usedProductIds.has(p.id)) {
          itemBoxes[p.id] = d.box;
          usedProductIds.add(p.id);
        }
        continue;
      }
      // An extra — try our own catalog first (real margin).
      const match = findBestCatalogMatch(catalog, d.description);
      if (match && !usedProductIds.has(match.id)) {
        autoMatched.push({ product: match, box: d.box });
        usedProductIds.add(match.id);
        continue;
      }
      // Not ours — queue a web search so the piece is still shoppable. Capped
      // low: each candidate is a full web-search call (fees + retrieved page
      // content billed as input tokens), and these are no-margin stopgap links
      // anyway — the piece we actually profit on is our own catalog.
      if (webCandidates.length < 3) webCandidates.push({ box: d.box, query: d.webQuery });
    }

    const webResults = await Promise.all(webCandidates.map((c) => searchWebForProduct(c.query, targetMarket)));
    const externals: WebExternalItem[] = [];
    webResults.forEach((web, i) => {
      if (web) externals.push({ ...web, box: webCandidates[i].box });
    });

    // QA per placed product, derived for free from the detection pass:
    // detected → placed correctly; not detected → wasn't rendered / substituted.
    const checks = products.map((product) => ({
      productId: product.id,
      name: product.name,
      pass: usedProductIds.has(product.id),
      note: usedProductIds.has(product.id) ? null : "Not found in the render — it may have been substituted or omitted.",
    }));

    const allProducts = [...products, ...autoMatched.map((a) => a.product)];
    const allItemBoxes = { ...itemBoxes };
    for (const a of autoMatched) allItemBoxes[a.product.id] = a.box;

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
    // describeAiError turns a raw Anthropic failure (no credits, bad key,
    // overloaded) into one actionable sentence instead of a stack-y blob or a
    // misleading "try again".
    return NextResponse.json({ error: describeAiError(err) }, { status: 502 });
  }
}
