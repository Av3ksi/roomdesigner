import { NextRequest, NextResponse } from "next/server";
import { stepPlanFor, TOTAL_WEIGHT, type GenerateEvent } from "@/lib/generateEvents";
import { aiEnabled, describeAiError } from "@/lib/ai/claude";
import { compositingEnabled, composeSceneWithProducts, reshapeBoxForProduct, type SceneItem } from "@/lib/ai/composite";
import { suggestPlacementsStrict } from "@/lib/ai/placement";
import { detectSceneItems } from "@/lib/ai/locate";
import { searchWebForProduct, extractRequestedExtras, type WebProduct } from "@/lib/ai/webProductSearch";
import { TARGET_MARKETS, type TargetMarket } from "@/lib/targetMarkets";
import { findBestCatalogMatch } from "@/lib/productSearch";
import { loadProductCatalog } from "@/lib/productSearchDb";
import { clientIp, enforceRateLimit } from "@/lib/rateLimit";
import { getOrCreateSessionId } from "@/lib/session";
import type { DetectionBox, Product, ProductCategory } from "@/lib/types";

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

  // Heaviest endpoint in the app — full Claude pipeline plus a real OpenAI
  // image render — so the tightest limit of any route here.
  const limited = await enforceRateLimit({
    name: "finished-rooms-generate",
    sessionId: await getOrCreateSessionId(),
    ip: clientIp(req),
    sessionLimit: 5,
    ipLimit: 15,
  });
  if (limited) return NextResponse.json({ error: limited.error }, { status: 429 });

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

  // Per-step wall-clock timing for the whole pipeline — the only way to tell
  // "which of the ~10 AI calls in a generate actually took the time" instead
  // of guessing. Every step logs "[vistroom] timing: <step> took Nms"; grep the
  // dev server output for "timing:" after a slow run to see the breakdown.
  const requestStart = Date.now();
  const timings: Record<string, number> = {};

  // Streamed as newline-delimited JSON rather than returned in one go. The
  // pipeline below takes 70-140 seconds, essentially all of it inside the
  // single OpenAI render, and a request that returns nothing for two minutes
  // gives the UI no way to show anything but an indeterminate spinner.
  //
  // Validation and rate limiting above still return ordinary JSON with real
  // status codes — only the long part is streamed, because once the first
  // byte is sent the status code can no longer change. Failures after that
  // point therefore arrive as an in-band {type:"error"} event.
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (event: GenerateEvent) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };

      // Progress is weighted by measured duration, not by step count. The
      // composite is ~75% of the wall clock, so a step-count bar would jump
      // to 1/7 and then sit still for over a minute, which reads as frozen.
      let doneWeight = 0;
      async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
        const step = stepPlanFor(label);
        const weight = step.weight;
        send({
          type: "step",
          label: step.human,
          progress: doneWeight / TOTAL_WEIGHT,
          // Lets the client ease the bar forward during a long step instead
          // of stalling, without ever running past the step's real end.
          expectedMs: step.expectedMs,
          spanFraction: weight / TOTAL_WEIGHT,
        });
        const start = Date.now();
        try {
          return await fn();
        } finally {
          const ms = Date.now() - start;
          timings[label] = ms;
          doneWeight += weight;
          console.log(`[vistroom] timing: ${label} took ${ms}ms`);
        }
      }

      try {
    // Strict: this is a paid curator tool, so a failed analysis must say WHY
    // (bad key, no credits, overloaded) rather than silently fall back to
    // context-blind default boxes. It also runs BEFORE the OpenAI render, so a
    // dead key fails fast and cheap instead of after paying for an image.
    const placement = await timed("placement analysis", () => suggestPlacementsStrict(roomPhoto));

    // Fetch every product photo and reshape its placement box together — one
    // slow network round-trip per product otherwise stacks up before the
    // render starts. A failed fetch throws and is handled by the outer catch.
    const productItems: SceneItem[] = await timed("product photo fetch + reshape (parallel)", () =>
      Promise.all(
        products.map(async (product): Promise<SceneItem> => {
          const productRes = await fetch(product.imageUrl!);
          if (!productRes.ok) throw new Error(`Failed to fetch photo for "${product.name}".`);
          const productPhoto = Buffer.from(await productRes.arrayBuffer());
          const suggestion = placement.placements[product.category];
          const box = await reshapeBoxForProduct(suggestion.box, productPhoto);
          return { productPhoto, category: product.category, box, wallAngleDeg: suggestion.wallAngleDeg };
        }),
      ),
    );

    // A style direction can name a specific item to add ("add a poster")
    // that isn't one of the hand-picked products — historically that only
    // reached the image model as a text hint, which it could ignore or
    // invent something ungrounded for (especially now that the restyle
    // prompt is deliberately conservative about adding anything not
    // explicitly named — see composite.ts). Parse it, source a REAL photo
    // for each named item via the same web search used for post-render
    // extras, and feed it into the render as a proper reference image, just
    // like a catalog product. Only fires when a style direction is given —
    // extractRequestedExtras returns [] for an empty one.
    const requestedExtras = await timed("extractRequestedExtras", () =>
      extractRequestedExtras(styleDirection ?? "", Array.from(seenCategories) as ProductCategory[]),
    );
    const preSourcedExternals = (
      await timed(`pre-source requested extras (${requestedExtras.length}x, parallel)`, () =>
        Promise.all(
          requestedExtras.map(async (extra) => {
            const web = await searchWebForProduct(extra.webQuery, targetMarket);
            if (!web || !web.imageUrl) return null;
            try {
              const photoRes = await fetch(web.imageUrl);
              if (!photoRes.ok) return null;
              const productPhoto = Buffer.from(await photoRes.arrayBuffer());
              const suggestion = placement.placements[extra.category];
              const box = await reshapeBoxForProduct(suggestion.box, productPhoto);
              const sceneItem: SceneItem = { productPhoto, category: extra.category, box, wallAngleDeg: suggestion.wallAngleDeg };
              return { category: extra.category, web, sceneItem };
            } catch {
              return null; // couldn't fetch the photo — skip, not fatal
            }
          }),
        ),
      )
    ).filter((e): e is { category: ProductCategory; web: WebProduct; sceneItem: SceneItem } => e !== null);

    const items: SceneItem[] = [...productItems, ...preSourcedExternals.map((e) => e.sceneItem)];

    // Includes the parallel product-description Claude calls AND the OpenAI
    // render itself — each has its own inner timing log (see composite.ts) so
    // this total can be split into "our AI calls" vs "OpenAI's render time".
    const result = await timed("composeSceneWithProducts (descriptions + OpenAI render)", () =>
      composeSceneWithProducts(roomPhoto, items, quality, styleDirection),
    );
    const finalImage = Buffer.from(result.imageBase64, "base64");

    // ONE detection pass over the finished render: every distinct object,
    // its box, and whether it's one of the placed products (by 1-based
    // index), a pre-sourced extra we explicitly asked to be placed, or an
    // unaccounted-for addition. This replaces per-product locate calls that
    // guessed independently and cross-labeled objects.
    const detected = await timed("detectSceneItems", () =>
      detectSceneItems(finalImage, [
        ...products.map((p, i) => ({ index: i + 1, name: p.name, category: p.category })),
        ...preSourcedExternals.map((e, i) => ({ index: products.length + i + 1, name: e.web.name, category: e.category })),
      ]),
    );

    const itemBoxes: Record<string, DetectionBox> = {};
    const autoMatched: { product: Product; box: DetectionBox }[] = [];
    const usedProductIds = new Set<string>();
    const usedPreSourcedIndices = new Set<number>();
    // Extras that need a web search — collected, then run in parallel.
    const webCandidates: { box: DetectionBox; query: string; description: string }[] = [];
    // Real detected objects we deliberately don't source (past the web-search
    // cap) or that the search came up empty for. Previously these were
    // silently dropped — nothing rendered them invisible on purpose, but the
    // effect was "not everything is pressable." Still surfaced as a pin (see
    // RoomHotspots' "unavailable" kind), just honestly not shoppable.
    const unavailable: { box: DetectionBox; description: string }[] = [];
    // Pre-sourced externals (poster, etc.) that actually got rendered —
    // resolved with their real on-image box from detection, same as a
    // catalog product, rather than the pre-render placement guess.
    const preSourcedFound: WebExternalItem[] = [];

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
      // Is this one of the extras we explicitly pre-sourced and asked to be placed?
      const preSourcedIdx = d.pickedIndex - products.length - 1;
      if (preSourcedIdx >= 0 && preSourcedIdx < preSourcedExternals.length) {
        if (!usedPreSourcedIndices.has(preSourcedIdx)) {
          preSourcedFound.push({ ...preSourcedExternals[preSourcedIdx].web, box: d.box });
          usedPreSourcedIndices.add(preSourcedIdx);
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
      // anyway — the piece we actually profit on is our own catalog. Anything
      // past the cap still gets a pin, just marked unavailable instead of
      // disappearing.
      if (webCandidates.length < 3) webCandidates.push({ box: d.box, query: d.webQuery, description: d.description });
      else unavailable.push({ box: d.box, description: d.description });
    }

    const webResults = await timed(`web search (${webCandidates.length}x, parallel)`, () =>
      Promise.all(webCandidates.map((c) => searchWebForProduct(c.query, targetMarket))),
    );
    const externals: WebExternalItem[] = [...preSourcedFound];
    webResults.forEach((web, i) => {
      if (web) externals.push({ ...web, box: webCandidates[i].box });
      else unavailable.push({ box: webCandidates[i].box, description: webCandidates[i].description });
    });

    // QA per placed product, derived for free from the detection pass:
    // detected → placed correctly; not detected → wasn't rendered / substituted.
    const checks = products.map((product) => ({
      productId: product.id,
      name: product.name,
      pass: usedProductIds.has(product.id),
      note: usedProductIds.has(product.id) ? null : "Not found in the render — it may have been substituted or omitted.",
    }));
    // Same QA, but for style-direction extras we found a real photo for and
    // asked to be placed (e.g. "add a poster") — so the curator can tell a
    // silently-dropped request apart from one that just wasn't sourceable.
    for (const [i, extra] of preSourcedExternals.entries()) {
      checks.push({
        productId: `extra-${i}`,
        name: extra.web.name,
        pass: usedPreSourcedIndices.has(i),
        note: usedPreSourcedIndices.has(i) ? null : "Found and sent to the render, but not visible in the result — it may not have rendered.",
      });
    }

    const allProducts = [...products, ...autoMatched.map((a) => a.product)];
    const allItemBoxes = { ...itemBoxes };
    for (const a of autoMatched) allItemBoxes[a.product.id] = a.box;

    const totalPrice = allProducts.reduce((sum, p) => sum + p.price, 0);
    const styleTags = Array.from(new Set(allProducts.flatMap((p) => p.styles)));

    console.log(`[vistroom] timing: TOTAL generate request took ${Date.now() - requestStart}ms`, timings);

        send({
          type: "result",
          result: {
            imageBase64: result.imageBase64,
            totalPrice,
            styleTags,
            productIds: allProducts.map((p) => p.id),
            itemBoxes: allItemBoxes,
            checks,
            autoMatched: autoMatched.map((a) => ({ productId: a.product.id, name: a.product.name, price: a.product.price })),
            externals,
            unavailable,
          },
        });
      } catch (err) {
        // describeAiError turns a raw Anthropic failure (no credits, bad key,
        // overloaded) into one actionable sentence instead of a stack-y blob or a
        // misleading "try again".
        send({ type: "error", error: describeAiError(err) });
      } finally {
        closed = true;
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      // Without this some proxies buffer the whole response and hand it over
      // at the end, which silently turns the stream back into the two-minute
      // wait it exists to remove.
      "X-Accel-Buffering": "no",
    },
  });
}
