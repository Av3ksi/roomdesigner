import Anthropic from "@anthropic-ai/sdk";
import { MODEL, aiEnabled } from "./claude";
import { suggestPlacements, type PlacementMap, type RoomDimensionsEstimate } from "./placement";
import { replicateEnabled } from "./vision/replicate";
import { searchProducts, toAgentProductSummary } from "../productSearch";
import { DEFAULT_CATEGORY_BOX, clampBox, isValidBox } from "../placementBoxes";
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
 * v1 scope, stated honestly: no DB yet (conversation state round-trips
 * through the client), no segmentation (can't remove/move *existing*
 * furniture — the agent is told to say so instead of pretending), and the
 * catalog is the ~200-product sample. Those are the next Phase-1 chunks.
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

/** Removing something already physically in the photo (Phase 2 — needs REPLICATE_API_TOKEN; see lib/ai/vision/segmentation.ts). No product: there's nothing to buy. */
export interface RemoveProposal {
  kind: "remove";
  category: ProductCategory;
  rationale: string;
}

export type EditProposal = AddProposal | RemoveProposal;

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
];

/** Only offered when the server has REPLICATE_API_TOKEN configured — the underlying segmentation step needs it. */
const REMOVE_OBJECT_TOOL: Anthropic.Tool = {
  name: "remove_existing_object",
  description:
    "Propose removing an object that's already physically present in the room photo (not a catalog product — there's nothing to buy). The user sees this as a card and must explicitly confirm before the (billed) render happens. The removal only succeeds if an object-detection step actually finds a matching item in the photo — if it doesn't, the confirm will fail and you should acknowledge that honestly rather than insisting it worked.",
  input_schema: {
    type: "object",
    properties: {
      category: { type: "string", enum: CATEGORIES },
      rationale: { type: "string", description: "One sentence: why remove this, referencing the user's request." },
    },
    required: ["category", "rationale"],
  },
};

function buildTools(): Anthropic.Tool[] {
  return replicateEnabled() ? [...TOOLS, REMOVE_OBJECT_TOOL] : TOOLS;
}

function buildSystemPrompt(
  constraints: Constraint[],
  hasPhoto: boolean,
  roomContext: RoomContext | null,
  removalAvailable: boolean,
): string {
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
2. search_products for candidates (German keywords — the catalog is German). Check dimensionsCm against the room when relevant.
3. get_room_placement once, then propose_edit for each item you recommend (max 3-4 per turn) using that category's box and wallAngleDeg.
4. Your final text reply: brief, concrete, in the client's own language. Reference the proposals you made — the UI shows them as cards the client confirms. Each confirmed render costs the client a little money, so propose what you'd genuinely stand behind.

Honest limits (say so when asked, offer the nearest real alternative): you can ADD products to the photo. ${
    removalAvailable
      ? "You can also propose REMOVING a piece of furniture already physically in the photo with remove_existing_object — this depends on an object-detection step actually finding a matching item, so it can fail; if the confirm comes back with an error, tell the user honestly instead of pretending it worked. There's no way to just move an object in place yet, only remove it (they'd re-add a replacement afterward)."
      : "You cannot yet remove or move furniture that's already physically in the photo (that needs a vision step this deployment doesn't have configured)."
  } You cannot restyle walls/floors. The catalog is ~200 VidaXL products today.`;
}

interface AgentState {
  catalog: Product[];
  roomPhoto: Buffer | null;
  roomContext: RoomContext | null;
  constraints: Constraint[];
  proposals: EditProposal[];
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
        const suggested = await suggestPlacements(state.roomPhoto);
        state.roomContext = suggested
          ? { placements: suggested.placements, roomDimensions: suggested.roomDimensions, source: "claude" }
          : {
              placements: Object.fromEntries(
                Object.entries(DEFAULT_CATEGORY_BOX).map(([c, box]) => [c, { box, wallAngleDeg: 0 }]),
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
        box: clampBox(input.box),
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
    roomContext,
    constraints: [...constraints],
    proposals: [],
  };

  const client = new Anthropic();
  const tools = buildTools();
  const removalAvailable = replicateEnabled();
  const messages: Anthropic.MessageParam[] = [
    ...history.map((t) => ({ role: t.role, content: t.content })),
    { role: "user" as const, content: userMessage },
  ];

  let reply = "";
  for (let i = 0; i < MAX_AGENT_ITERATIONS; i++) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      thinking: { type: "adaptive" },
      system: buildSystemPrompt(state.constraints, Boolean(roomPhoto), state.roomContext, removalAvailable),
      tools,
      messages,
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

  return {
    reply: reply || "…",
    proposals: state.proposals,
    constraints: state.constraints,
    roomContext: state.roomContext,
  };
}
