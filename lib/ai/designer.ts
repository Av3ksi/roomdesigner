import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";
import { MODEL, aiEnabled } from "./claude";
import { suggestPlacements, type PlacementMap, type RoomDimensionsEstimate } from "./placement";
import { detectSceneItems } from "./locate";
import { searchWebForProduct, type WebProduct } from "./webProductSearch";
import { searchProductViaSerpApi, serpApiEnabled } from "../suppliers/serpApiSearch";
import { searchProducts, toAgentProductSummary } from "../productSearch";
import { DEFAULT_CATEGORY_BOX, clampBox, isValidBox, scaleBoxToRealWidth } from "../placementBoxes";
import type { DetectionBox, Product, ProductCategory } from "../types";

/**
 * Designer Agent v1 — the conversational layer of the blueprint's Phase 1
 * (docs/BLUEPRINT.md §6, §10). Claude with tool use, driving the modules
 * that already exist: product search over the supplier catalog, room-aware
 * placement, and edit proposals the UI turns into composite renders.
 *
 * The money rule carries over from the whole prototype: the agent NEVER
 * triggers a render itself. It *proposes* edits (product + placement box);
 * the user confirms each one in the UI, and only that confirmation fires
 * the billed image call. Agent turns themselves cost normal Claude usage
 * (the placement tool is one extra vision call, once per photo).
 *
 * Persistence (lib/roomPersistence.ts) and existing-furniture removal
 * (lib/ai/locate.ts + removeExistingObject) landed in later chunks — see
 * docs/BLUEPRINT.md for the roadmap. Still true: no "move" (only remove),
 * no wall/floor restyling, and the catalog is the ~200-product sample.
 */

const CATEGORIES: ProductCategory[] = [
  "sofa", "chair", "table", "lighting", "rug", "art", "plant", "storage", "decor", "textile",
];

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface Constraint {
  kind: "budget" | "style" | "color" | "material" | "supplier" | "custom";
  description: string;
}

export interface RoomContext {
  placements: PlacementMap;
  roomDimensions: RoomDimensionsEstimate | null;
  source: "claude" | "default";
}

export interface AddProposal {
  kind: "add";
  product: Product;
  category: ProductCategory;
  box: DetectionBox;
  wallAngleDeg: number;
  rationale: string;
}

/** A real product found on the open web (search_web_for_product) — not our catalog, so it's shown as clearly sourced from another retailer and never added to cart directly. */
export interface AddWebProposal {
  kind: "add-web";
  webProduct: WebProduct;
  category: ProductCategory;
  box: DetectionBox;
  wallAngleDeg: number;
  rationale: string;
}

/** Removing something already physically in the photo (Phase 2 — see lib/ai/locate.ts). No product: there's nothing to buy. */
export interface RemoveProposal {
  kind: "remove";
  category: ProductCategory;
  rationale: string;
  /** A specific item name, when this came from the upfront room inventory rather than a chat guess (e.g. "dark oak coffee table" instead of just "table"). */
  description?: string;
  /** Exact detected box, when known (the room-inventory checklist) — lets removal skip the blind locate-by-category call. */
  box?: DetectionBox;
}

export type EditProposal = AddProposal | AddWebProposal | RemoveProposal;

export interface DesignerTurnResult {
  reply: string;
  proposals: EditProposal[];
  constraints: Constraint[];
  roomContext: RoomContext | null;
}

const TOOLS: Anthropic.Tool[] = [
  {
    name: "search_products",
    description:
      "Search the real supplier catalog (VidaXL, ~200 furniture/decor products, German titles). Returns up to `limit` matches. Use German keywords (schwarz, eiche, weiss...) since titles are German. Hard filters: category, price range, maxWidthCm (real product width). Always respect the active constraint ledger when choosing filters.",
    input_schema: {
      type: "object",
      properties: {
        category: { type: "string", enum: CATEGORIES },
        maxPrice: { type: "number" },
        minPrice: { type: "number" },
        keywords: { type: "array", items: { type: "string" } },
        maxWidthCm: { type: "number" },
        styleIds: { type: "array", items: { type: "string" } },
        limit: { type: "number" },
      },
      required: [],
    },
  },
  {
    name: "get_room_placement",
    description:
      "Get the room's placement analysis: a suggested position box and wall angle for every furniture category, plus estimated room dimensions in meters. Call this before proposing any edit so placements sit against the room's real geometry.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "propose_edit",
    description:
      "Propose placing one product into the room. The user sees this as a card with the product photo, price, and placement, and must explicitly confirm before the (billed) render happens — so propose deliberately, not speculatively. Call once per product when proposing multiple items. Use the box/wallAngleDeg from get_room_placement for the product's category, adjusted if the user asked for a specific position.",
    input_schema: {
      type: "object",
      properties: {
        productId: { type: "string" },
        box: {
          type: "object",
          properties: {
            x: { type: "number" }, y: { type: "number" }, w: { type: "number" }, h: { type: "number" },
          },
          required: ["x", "y", "w", "h"],
        },
        wallAngleDeg: { type: "number" },
        rationale: { type: "string", description: "One sentence: why this product for this room/request." },
      },
      required: ["productId", "box", "rationale"],
    },
  },
  {
    name: "set_constraint",
    description:
      "Record a persistent design constraint the user stated (budget ceiling, only certain colors/materials, style direction...). It stays active for all future searches until cleared.",
    input_schema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["budget", "style", "color", "material", "supplier", "custom"] },
        description: { type: "string" },
      },
      required: ["kind", "description"],
    },
  },
  {
    name: "clear_constraint",
    description: "Remove a previously recorded constraint the user has lifted (matched by its description).",
    input_schema: {
      type: "object",
      properties: { description: { type: "string" } },
      required: ["description"],
    },
  },
  {
    name: "remove_existing_object",
    description:
      "Propose removing an object that's already physically present in the room photo (not a catalog product — there's nothing to buy). The user sees this as a card and must explicitly confirm before the (billed) render happens. The removal only succeeds if a vision step actually locates a matching item in the photo — if it doesn't, the confirm will fail and you should acknowledge that honestly rather than insisting it worked.",
    input_schema: {
      type: "object",
      properties: {
        category: { type: "string", enum: CATEGORIES },
        rationale: { type: "string", description: "One sentence: why remove this, referencing the user's request." },
      },
      required: ["category", "rationale"],
    },
  },
  {
    name: "search_web_for_product",
    description:
      "Search the open web for one real, purchasable product when the catalog (search_products) genuinely has nothing that matches what the client asked for — e.g. a specific poster, a particular art style, a decor item the ~200-product catalog doesn't cover. This is a real, somewhat slow search (up to ~2 minutes) — only use it for a specific named item the client actually asked for, not speculatively, and don't call it more than once or twice per turn. Returns one real product from an actual European retailer with a real photo, or found:false if nothing solid turned up (tell the client honestly rather than inventing one). Use the returned webResultIndex with propose_web_edit.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "English search terms, 2-6 words, e.g. 'abstract black white poster large'." },
        category: { type: "string", enum: CATEGORIES },
      },
      required: ["query", "category"],
    },
  },
  {
    name: "propose_web_edit",
    description:
      "Propose placing a web-sourced product (found via search_web_for_product) into the room. Same confirm-before-render flow as propose_edit, but the client sees it clearly marked as sourced from another retailer, not something Maison sells directly — it links out to buy, it doesn't get added to a Maison cart.",
    input_schema: {
      type: "object",
      properties: {
        webResultIndex: { type: "number", description: "The index returned by search_web_for_product." },
        box: {
          type: "object",
          properties: {
            x: { type: "number" }, y: { type: "number" }, w: { type: "number" }, h: { type: "number" },
          },
          required: ["x", "y", "w", "h"],
        },
        wallAngleDeg: { type: "number" },
        rationale: { type: "string", description: "One sentence: why this product for this room/request." },
      },
      required: ["webResultIndex", "box", "rationale"],
    },
  },
];

function buildSystemPrompt(constraints: Constraint[], hasPhoto: boolean, roomContext: RoomContext | null): string {
  const constraintList = constraints.length
    ? constraints.map((c) => `- [${c.kind}] ${c.description}`).join("\n")
    : "(none yet)";
  const dims = roomContext?.roomDimensions;
  return `You are Maison's AI interior designer — warm, specific, honest, never salesy. You help the client furnish their real room with real purchasable products, conversationally.

Room state: ${hasPhoto ? "photo uploaded" : "NO photo yet — ask them to upload one before proposing placements"}.${
    dims ? ` Estimated ${dims.widthM}×${dims.depthM}m, ${dims.heightM}m ceiling.` : ""
  }
Active constraints (respect these in every search):
${constraintList}

How you work:
1. Understand what they want; record durable preferences with set_constraint.
2. search_products for candidates (German keywords — the catalog is German). Check dimensionsCm against the room when relevant. Prefer products whose title/category clearly describes a normal, self-supporting piece of furniture over ambiguous single-part listings (e.g. a bare "Tischplatte"/tabletop panel, a lone leg, a spare part) — those can't be placed anywhere that looks physically real on their own, and a client can't tell that from the product name alone. If the client asked for something specific the catalog clearly doesn't have (a poster, a particular style of art or decor), use search_web_for_product instead of saying no or substituting something unrelated — don't mention this fallback exists unless you actually need it.
3. get_room_placement once, then propose_edit (catalog) or propose_web_edit (web-sourced) for each item you recommend (max 3-4 per turn) using that category's box and wallAngleDeg. The box only needs to be a reasonable starting point, not pixel-perfect — the client can drag and resize it before confirming — but it should still put the item somewhere physically sensible for its category (resting on the floor for furniture, mounted at wall height for art/lighting, on an existing surface for small decor), never floating in open space or overlapping another object at an odd angle.
4. SWAPPING something already placed (the client says "a different sofa," "try another one," "swap/replace/change the X," or anything implying they want to see an alternative to an item you already added earlier in this conversation): there is no combined replace operation. Proposing only the new item renders it INTO the same photo the old one is already baked into, so both end up visible side by side — a real, confirmed failure, not a hypothetical. When you recognize this pattern, ALWAYS call remove_existing_object for the old item's category first, then propose_edit/propose_web_edit for the new one, in the same turn — and say plainly in your reply that this needs two confirmations (remove, then add) to complete the swap. Never propose just the addition when something of that category is already in the room.
5. Your final text reply: brief, concrete, in the client's own language. Reference the proposals you made — the UI shows them as cards the client confirms. Each confirmed render costs the client a little money, so propose what you'd genuinely stand behind.

Honest limits (say so when asked, offer the nearest real alternative): you can ADD products to the photo, from the catalog or (via search_web_for_product) real products sourced from other retailers when the catalog has nothing that fits — those are always shown to the client as external, not something Maison sells. You can also propose REMOVING a piece of furniture already physically in the photo with remove_existing_object — this depends on a vision step actually locating a matching item, so it can fail; if the confirm comes back with an error, tell the user honestly instead of pretending it worked. There's no way to just move an object in place yet, only remove it (they'd re-add a replacement afterward) — see rule 4 above for swapping. You cannot restyle walls/floors. The catalog is ~200 VidaXL products today.`;
}

interface AgentState {
  catalog: Product[];
  roomPhoto: Buffer | null;
  /**
   * The room's floor plan, when the client uploaded one — passed to the
   * placement pass (lib/ai/placement.ts) as the authoritative source for
   * real measurements. A drawn plan states the room's true geometry;
   * a photograph only implies it, so scale estimated from the plan beats
   * scale estimated from perspective cues. Null for rooms without one,
   * which is the common case.
   */
  floorplanPhoto: Buffer | null;
  roomContext: RoomContext | null;
  constraints: Constraint[];
  proposals: EditProposal[];
  /** Results from search_web_for_product this turn, referenced by index from propose_web_edit — never trust the model's own retyped copy of a URL/photo. */
  webResults: { product: WebProduct; category: ProductCategory }[];
  /** Hard cap on real web searches per turn — independent of the system prompt's own restraint, since each one costs real time/money. */
  webSearchCalls: number;
}

// Cap at 1 per turn so a chat message never waits on more than one of
// these — SerpApi (the primary path when configured) is fast, but the
// Claude-agentic fallback (lib/ai/webProductSearch.ts, used automatically
// when SERPAPI_KEY isn't set) can take up to its own 100s budget.
const MAX_WEB_SEARCHES_PER_TURN = 1;

/**
 * Applies the real-world size correction to a proposed box, using the
 * spanM the placement pass estimated for that category's position (see
 * lib/placementBoxes.ts's scaleBoxToRealWidth). Silently returns the box
 * unchanged whenever the inputs aren't trustworthy — no placement run yet,
 * a default (context-blind) placement, a category whose spanM came back
 * implausible, or a product whose feed carries no width. Scaling against a
 * number we don't have would be worse than the model's own visual guess,
 * which at least looked at the room.
 */
function scaleProposedBox(
  box: DetectionBox,
  category: ProductCategory,
  realWidthCm: number | undefined,
  state: AgentState,
): DetectionBox {
  if (!realWidthCm || state.roomContext?.source !== "claude") return box;
  const spanM = state.roomContext.placements[category]?.spanM;
  if (!spanM) return box;
  return scaleBoxToRealWidth(box, spanM, realWidthCm);
}

async function executeTool(name: string, input: Record<string, unknown>, state: AgentState): Promise<string> {
  switch (name) {
    case "search_products": {
      const results = searchProducts(state.catalog, input as Parameters<typeof searchProducts>[1]);
      return JSON.stringify(results.map(toAgentProductSummary));
    }
    case "get_room_placement": {
      if (!state.roomContext) {
        if (!state.roomPhoto) return JSON.stringify({ error: "No room photo uploaded yet." });
        const suggested = await suggestPlacements(state.roomPhoto, state.floorplanPhoto);
        state.roomContext = suggested
          ? { placements: suggested.placements, roomDimensions: suggested.roomDimensions, source: "claude" }
          : {
              placements: Object.fromEntries(
                Object.entries(DEFAULT_CATEGORY_BOX).map(([c, box]) => [c, { box, wallAngleDeg: 0, spanM: null }]),
              ) as PlacementMap,
              roomDimensions: null,
              source: "default",
            };
      }
      return JSON.stringify(state.roomContext);
    }
    case "propose_edit": {
      const productId = String(input.productId ?? "");
      const product = state.catalog.find((p) => p.id === productId);
      if (!product) return JSON.stringify({ error: `Unknown productId "${productId}" — use an id returned by search_products.` });
      if (!product.imageUrl) return JSON.stringify({ error: "That product has no photo, so it can't be rendered — pick one with hasPhoto true." });
      if (!isValidBox(input.box)) return JSON.stringify({ error: "box must be {x,y,w,h} in 0–1 image coordinates." });
      const proposal: EditProposal = {
        kind: "add",
        product,
        category: product.category,
        // The model proposes a box for the CATEGORY ("a sofa goes here");
        // this rescales it to the product's REAL width, so a 40cm side
        // table and a 180cm dining table don't get identical boxes just
        // because they're both "table". No-ops when the supplier feed has
        // no dimensions or the placement call gave no trustworthy spanM.
        box: scaleProposedBox(clampBox(input.box), product.category, product.dimensionsCm?.l, state),
        wallAngleDeg: typeof input.wallAngleDeg === "number" ? input.wallAngleDeg : 0,
        rationale: String(input.rationale ?? ""),
      };
      state.proposals.push(proposal);
      return JSON.stringify({ ok: true, proposalIndex: state.proposals.length - 1 });
    }
    case "remove_existing_object": {
      if (!state.roomPhoto) return JSON.stringify({ error: "No room photo uploaded yet." });
      const category = String(input.category ?? "");
      if (!CATEGORIES.includes(category as ProductCategory)) {
        return JSON.stringify({ error: `category must be one of: ${CATEGORIES.join(", ")}` });
      }
      const proposal: EditProposal = {
        kind: "remove",
        category: category as ProductCategory,
        rationale: String(input.rationale ?? ""),
      };
      state.proposals.push(proposal);
      return JSON.stringify({ ok: true, proposalIndex: state.proposals.length - 1 });
    }
    case "search_web_for_product": {
      if (state.webSearchCalls >= MAX_WEB_SEARCHES_PER_TURN) {
        return JSON.stringify({ error: "Web search limit reached for this turn — work with what you already found, or ask the client to try again." });
      }
      const query = String(input.query ?? "").trim();
      const category = String(input.category ?? "");
      if (!query) return JSON.stringify({ error: "query required" });
      if (!CATEGORIES.includes(category as ProductCategory)) {
        return JSON.stringify({ error: `category must be one of: ${CATEGORIES.join(", ")}` });
      }
      state.webSearchCalls += 1;
      // SerpApi (structured Google Shopping results, no page-scraping) is
      // the primary source when configured — see lib/suppliers/
      // serpApiSearch.ts for why this replaced the Claude-agentic
      // web_search+web_fetch approach in the live flow. That approach
      // stays in place as the automatic fallback when SERPAPI_KEY isn't
      // set, so nothing regresses for a setup that hasn't added it yet.
      const found = serpApiEnabled() ? await searchProductViaSerpApi(query, "CH") : await searchWebForProduct(query, "CH");
      if (!found || !found.imageUrl) {
        return JSON.stringify({
          found: false,
          note: "No real product with a usable photo was found for this search — tell the client honestly rather than inventing one.",
        });
      }
      const webResultIndex = state.webResults.push({ product: found, category: category as ProductCategory }) - 1;
      return JSON.stringify({
        found: true,
        webResultIndex,
        name: found.name,
        retailer: found.retailer,
        priceText: found.priceText,
      });
    }
    case "propose_web_edit": {
      const idx = Number(input.webResultIndex);
      const found = state.webResults[idx];
      if (!found) return JSON.stringify({ error: "Unknown webResultIndex — use one returned by search_web_for_product." });
      if (!isValidBox(input.box)) return JSON.stringify({ error: "box must be {x,y,w,h} in 0–1 image coordinates." });
      const webProposal: EditProposal = {
        kind: "add-web",
        webProduct: found.product,
        category: found.category,
        box: clampBox(input.box),
        wallAngleDeg: typeof input.wallAngleDeg === "number" ? input.wallAngleDeg : 0,
        rationale: String(input.rationale ?? ""),
      };
      state.proposals.push(webProposal);
      return JSON.stringify({ ok: true, proposalIndex: state.proposals.length - 1 });
    }
    case "set_constraint": {
      const kind = String(input.kind ?? "custom") as Constraint["kind"];
      const description = String(input.description ?? "").trim();
      if (!description) return JSON.stringify({ error: "description required" });
      if (!state.constraints.some((c) => c.description === description)) {
        state.constraints.push({ kind, description });
      }
      return JSON.stringify({ ok: true, active: state.constraints.length });
    }
    case "clear_constraint": {
      const description = String(input.description ?? "");
      state.constraints = state.constraints.filter(
        (c) => !c.description.toLowerCase().includes(description.toLowerCase()),
      );
      return JSON.stringify({ ok: true, active: state.constraints.length });
    }
    default:
      return JSON.stringify({ error: `Unknown tool ${name}` });
  }
}

const MAX_AGENT_ITERATIONS = 8;

/**
 * The tool-calling loop shared by a normal chat turn and the upload kickoff
 * below — only the system prompt (rebuilt fresh each iteration, since tool
 * calls mid-turn change state.roomContext/constraints) and initial message
 * differ between the two.
 */
async function runAgentLoop(
  state: AgentState,
  messages: Anthropic.MessageParam[],
  buildSystem: (state: AgentState) => string,
  tools: Anthropic.Tool[] = TOOLS,
): Promise<string> {
  const client = new Anthropic();
  let reply = "";
  for (let i = 0; i < MAX_AGENT_ITERATIONS; i++) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      thinking: { type: "adaptive" },
      // Sonnet 5 defaults adaptive thinking to "high" effort when unset — a
      // real measured turn (search tool call + follow-up reply) took ~299s
      // end to end, consistent with several ~60s-bounded iterations each
      // spending most of their budget on high-effort thinking. "medium" is
      // the documented lever for this (thinking depth/latency, not a token
      // budget — budget_tokens 400s on this model) and this is a chat agent
      // picking a tool and writing a reply, not a task that needs max depth.
      output_config: { effort: "medium" },
      system: buildSystem(state),
      tools,
      messages,
    }, {
      // See lib/ai/webProductSearch.ts for why an explicit timeout matters at
      // all: the SDK default (10 min x up to 3 attempts) turned one stuck
      // call into a real 24-minute production hang. A normal turn is a
      // couple of seconds; even one that just got back a slow tool result
      // (search_web_for_product has its own separate budget) only needs fast
      // text/tool-call inference here, not another long wait on top of it.
      // maxRetries: 0 because the SDK retries a timeout like any other
      // connection error — with maxRetries: 1 a single slow turn could
      // silently take up to 120s instead of the 60s this comment implies.
      timeout: 60_000,
      maxRetries: 0,
    });

    const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    const textBlocks = response.content.filter((b): b is Anthropic.TextBlock => b.type === "text");
    if (textBlocks.length) reply = textBlocks.map((b) => b.text).join("\n");

    if (response.stop_reason !== "tool_use" || toolUses.length === 0) break;

    messages.push({ role: "assistant", content: response.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const tu of toolUses) {
      const output = await executeTool(tu.name, tu.input as Record<string, unknown>, state);
      results.push({ type: "tool_result", tool_use_id: tu.id, content: output });
    }
    messages.push({ role: "user", content: results });
  }
  return reply;
}

export async function runDesignerTurn(
  history: ChatTurn[],
  userMessage: string,
  catalog: Product[],
  roomPhoto: Buffer | null,
  constraints: Constraint[],
  roomContext: RoomContext | null,
): Promise<DesignerTurnResult> {
  if (!aiEnabled()) throw new Error("ANTHROPIC_API_KEY not configured");

  const state: AgentState = {
    catalog,
    roomPhoto,
    // Turns run after kickoff, which already computed and persisted
    // roomContext from the floor plan when there was one — so there's
    // nothing left for a plan to inform here.
    floorplanPhoto: null,
    roomContext,
    constraints: [...constraints],
    proposals: [],
    webResults: [],
    webSearchCalls: 0,
  };

  const messages: Anthropic.MessageParam[] = [
    ...history.map((t) => ({ role: t.role, content: t.content })),
    { role: "user" as const, content: userMessage },
  ];

  const reply = await runAgentLoop(state, messages, (s) => buildSystemPrompt(s.constraints, Boolean(roomPhoto), s.roomContext));

  return {
    reply: reply || "…",
    proposals: state.proposals,
    constraints: state.constraints,
    roomContext: state.roomContext,
  };
}

export interface InventoryItem {
  box: DetectionBox;
  description: string;
  category: ProductCategory;
}

export interface DesignerKickoffResult extends DesignerTurnResult {
  /** Every real object the vision pass found already in the room, for a "here's what's changeable" checklist. */
  inventory: InventoryItem[];
}

const KICKOFF_MAX_CONTEXT_EDGE = 1024;
// Kickoff stays catalog-only and fast — no removal (see buildKickoffSystemPrompt)
// and no web search (a real, ~2-min-worst-case call) on the automatic first look.
const KICKOFF_TOOLS = TOOLS.filter((t) => t.name !== "remove_existing_object" && t.name !== "search_web_for_product" && t.name !== "propose_web_edit");

async function toContextJpegBase64(photo: Buffer): Promise<string> {
  const jpeg = await sharp(photo)
    .rotate()
    .resize(KICKOFF_MAX_CONTEXT_EDGE, KICKOFF_MAX_CONTEXT_EDGE, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();
  return jpeg.toString("base64");
}

function buildKickoffSystemPrompt(state: AgentState): string {
  const dims = state.roomContext?.roomDimensions;
  return `You are Maison's AI interior designer — warm, specific, honest, never salesy. This is the FIRST look at a room the client just uploaded — they haven't said anything yet, so don't ask what they want or wait for a request.

Instead: call get_room_placement to understand the room's geometry${dims ? ` (already estimated: ${dims.widthM}×${dims.depthM}m, ${dims.heightM}m ceiling)` : ""}, then search_products (German keywords — the catalog is German) for real catalog pieces that would genuinely elevate THIS room, and propose_edit for 2–4 of them — spanning different categories where it makes sense (e.g. a rug, a piece of wall art, a plant, not four sofas). Check dimensionsCm against the room when relevant. Prefer products that clearly read as a normal, self-supporting piece of furniture over ambiguous single-part listings (e.g. a bare "Tischplatte"/tabletop panel, a lone leg, a spare part) — those can't be placed anywhere that looks physically real. Each box only needs to be a reasonable starting point (the client can drag/resize it before confirming), but it should put the item somewhere physically sensible for its category — resting on the floor, mounted at wall height, on an existing surface — never floating in open space.

A separate part of the app already shows the client every existing object in their photo as a checklist they control directly — don't call remove_existing_object here, focus only on additions that would make the room more stylish.

Your final text reply: 2–3 warm, specific sentences — what you noticed about the room, and a brief lead-in to what you suggested below. The client sees your suggestions as cards they can accept or ignore.`;
}

/**
 * Runs automatically the moment a room photo is uploaded, before any chat
 * message — the "auto-suggest" half of the unified Designer flow. Two things
 * happen in parallel: a deterministic full-room inventory (detectSceneItems,
 * same call the finished-rooms hotspot pipeline uses) finds every real
 * object already in the photo for the checklist, while the agent looks at
 * the room (plus any extra angle photos / floor plan, included as additional
 * vision context only — the composite/render step never touches them) and
 * proactively proposes a few catalog additions via the normal propose_edit
 * tool, exactly like a chat-driven proposal.
 */
export async function runDesignerKickoff(
  catalog: Product[],
  primaryPhoto: Buffer,
  extraPhotos: Buffer[],
  floorplanPhoto: Buffer | null,
): Promise<DesignerKickoffResult> {
  if (!aiEnabled()) throw new Error("ANTHROPIC_API_KEY not configured");

  const state: AgentState = {
    catalog,
    roomPhoto: primaryPhoto,
    floorplanPhoto,
    roomContext: null,
    constraints: [],
    proposals: [],
    webResults: [],
    webSearchCalls: 0,
  };

  const [inventoryItems, primaryJpeg, extraJpegs, floorplanJpeg] = await Promise.all([
    detectSceneItems(primaryPhoto, []),
    toContextJpegBase64(primaryPhoto),
    Promise.all(extraPhotos.map(toContextJpegBase64)),
    floorplanPhoto ? toContextJpegBase64(floorplanPhoto) : Promise.resolve(null),
  ]);

  const content: Anthropic.ContentBlockParam[] = [
    { type: "text", text: "Primary room photo:" },
    { type: "image", source: { type: "base64", media_type: "image/jpeg", data: primaryJpeg } },
  ];
  extraJpegs.forEach((jpeg, i) => {
    content.push({ type: "text", text: `Additional angle ${i + 1}:` });
    content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: jpeg } });
  });
  if (floorplanJpeg) {
    content.push({ type: "text", text: "Floor plan:" });
    content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: floorplanJpeg } });
  }
  content.push({ type: "text", text: "Take a first look at this room and suggest a few real products that would make it more stylish." });

  const messages: Anthropic.MessageParam[] = [{ role: "user", content }];
  const reply = await runAgentLoop(state, messages, buildKickoffSystemPrompt, KICKOFF_TOOLS);

  return {
    reply: reply || "…",
    proposals: state.proposals,
    constraints: state.constraints,
    roomContext: state.roomContext,
    inventory: inventoryItems.map((i) => ({ box: i.box, description: i.description, category: i.category })),
  };
}
