# Maison 2.0 — Product & Architecture Blueprint

**Status:** Design document — the target architecture, written from first principles.
**Relationship to the current code:** The prototype in this repo validated the core loop
(real photo → real supplier product → photoreal composite → clickable hotspot → real
margin). This document designs the product that loop deserves. It deliberately does
not preserve prototype limitations; a migration roadmap from today's code is at the end.

---

## 1. Product Vision

**One sentence:** *Chat with your room.*

Upload a photo of any real room — empty, messy, or fully furnished — and talk to an AI
interior designer that sees the room the way a human designer does, redesigns it
photorealistically in seconds, fills it with real purchasable products from real
suppliers, and lets you buy the result.

**Positioning against the field:**

| Competitor | Their model | Our wedge |
|---|---|---|
| IKEA Kreativ | Excellent scan-and-furnish, single retailer, toolbar-driven | Multi-supplier catalog, conversational (no toolbars), dropship margin on every sale |
| Houzz AI / Pro tools | Marketplace + inspiration, AI bolted on | AI-native: the conversation *is* the product |
| Planner 5D / roomstyler | Dollhouse 3D you build by hand | Zero modeling. Your actual photo, photoreal, instant |
| Generic AI photo restylers | Pretty renders of fake furniture | Every object in our render is a real SKU with a price and a delivery date |

**The business loop (validated already in the prototype):** wholesale supplier feed →
Maison markup (~40% margin measured on real VidaXL data) → sale happens inside Maison →
supplier drop-ships. Every render is a shop window. The AI designer is the salesperson.

**North-star metric:** renders that convert to checkout. Everything in this document
optimizes the path *photo → wow → purchase*.

---

## 2. User Experience

### 2.1 The journey

```
Upload photo(s)
   ↓  (~5s)
Room card appears — "Here's what I see" (type, size estimate, light, existing
furniture inventory, style read). Builds trust; catches errors early.
   ↓
User talks. That's the whole interface.
   ↓  (each turn)
New version appears in a filmstrip. Previous versions never destroyed.
   ↓
Every recognizable object in every render is tappable → product drawer
(price, supplier, dimensions, variants, delivery, alternatives).
   ↓
"Add to cart" per object, or "shop this whole room."
   ↓
Maison checkout (Stripe). Supplier fulfillment happens behind the curtain.
```

### 2.2 Interface principles

1. **One canvas, one chat rail, one filmstrip.** No property panels, no transform
   gizmos, no layer trees. If a user ever needs a technical control, the conversation
   design has failed.
2. **Versions are cheap and non-destructive.** Every generation is a node in a version
   tree (not a linear history — "go back to version 2 but keep this sofa" forks).
3. **Latency is a UX problem, not an infra problem.** Renders take 10–60s. The UI must
   show the *plan* instantly (highlight of what will change, ghost-box of incoming
   product, running cost delta of the basket) while pixels generate. Never a blank
   spinner.
4. **Honest labels.** A render where every object is a purchasable SKU is marked
   *shoppable*. A free-restyle concept render is marked *inspiration* until products
   are linked. Never blur the two — trust is the product.
5. **Drag is a fallback, not the interface.** Direct manipulation (tap object → drag)
   exists for fine-tuning, but every drag has a language equivalent and vice versa.

### 2.3 The conversation, concretely

| User says | System does |
|---|---|
| "Make this Scandinavian" | Full-room restyle render (inspiration), then product-linking pass converts anchor items to real SKUs |
| "Replace the sofa" | Segment existing sofa → catalog search (fits dimensions + current style + budget) → top pick composited in its exact footprint, alternatives in drawer |
| "Move the sofa closer to the window" | Region edit: remove-inpaint at current mask, insert at new floor position (placement graph knows where the window is) |
| "Remove everything except the windows" | Inventory minus openings → mask-union inpaint → clean-room version |
| "Show me something under €800" | Constraint added to ledger; current selection re-searched under it |
| "Only oak wood, nothing black" | Persistent constraints; applies to every future search until lifted |
| "Give me three completely different concepts" | Three parallel restyle renders, filmstrip shows all three as siblings |
| "Keep the TV" | Object pinned in the Room Model; every future edit's mask excludes it |

---

## 3. The Core Abstraction: the Room Model

The prototype's deepest limitation: **every generation starts from pixels and a
rectangle.** Nothing persists between edits except the image itself. That makes
"move the couch," "keep the TV," and "does it fit" fundamentally unsolvable.

The redesign centers on a persistent, structured **Room Model** built once per
uploaded photo and updated after every edit:

```
RoomModel {
  photo(s): original upload(s)
  geometry: {
    depthMap                  // metric depth, per pixel
    floorPlane                // fitted plane + homography image↔floor coords
    wallPlanes[]              // plane equations + image-space angles
    scale                     // meters-per-pixel calibration (door/ceiling priors)
  }
  openings: windows[], doors[]        // polygons, never occluded by edits
  inventory: SceneObject[] {
    id, label, category
    mask                      // segmentation polygon, not a rectangle
    footprint                 // floor-space quad (from mask × depth)
    depthM, dimensions        // real-world estimates
    pinned: bool              // "keep the TV"
    product?: SKU             // linked real product, if placed by us
  }
  placementGraph: {
    freeWallRuns[]            // wall segments with nothing against them (real meters)
    openFloorZones[]          // walkable/placeable polygons
    circulationPaths[]        // never block these
  }
  style: palette, materials, lightSources, styleAffinity
  constraints: ConstraintLedger   // budget, materials, colors, pins — persists across turns
}
```

Every conversation turn *reads* this to resolve intent ("the sofa" → object id;
"closer to the window" → target coords on the floor plane) and *writes* it after
rendering (new object registered with its mask and SKU). This single structure is
what turns an image editor into a designer.

---

## 4. AI Pipeline

### 4.1 Model selection by task

Principle: **best tool per task, no single-vendor loyalty.** (Model landscape moves
fast — re-verify current leaders at implementation time; candidates listed were
current as of early 2026.)

| Task | Primary | Why / alternates |
|---|---|---|
| Scene understanding, style, quality judgment | **Claude (Opus-class, vision)** | Already proven in this codebase for analysis + placement + wall angles; best-in-class instruction-following for structured JSON scene output |
| Agent orchestration / conversation | **Claude with tool use** | The designer brain: parses intent, sequences tools, writes the constraint ledger. Sonnet-class for cost at scale, Opus-class for the planning turn |
| Object segmentation | **SAM 2 (image mode)** | The workhorse: object masks for inventory, removal, replacement footprints. Cheap, fast, open, runs on serverless GPU |
| Open-vocabulary detection | **Grounding DINO / OWL-class** | Text-prompted boxes ("find the couch") feeding SAM prompts. Claude vision detections are an acceptable v1 substitute |
| Metric depth | **Depth Anything V2 (metric)** | Floor/wall plane fitting, real-scale calibration, footprints. Small, fast, open |
| Masked object edit (add/replace/remove) | **gpt-image-1.5** *(validated in prototype)* | Multi-image reference + mask editing works today. **Evaluate head-to-head:** Google's Gemini image editing line (strong identity preservation) and FLUX Kontext-class editors; identity preservation of the reference product is THE eval criterion |
| Full-room restyle | Structure-conditioned generation (depth/edge-guided) | Keeps architecture fixed while restyling everything; then product-linking pass |
| Product identity QA | **Claude vision** | Post-render: "is the product in this crop the same product as this reference photo?" score → auto-retry gate |
| Catalog semantic search | **pgvector + text embeddings** | "cozy reading chair under 300" → embedding search over enriched product descriptions |
| Visual similarity | **CLIP/SigLIP-class image embeddings** | "more like this" from any render crop or product photo |
| Catalog enrichment (one-time batch) | **Claude (Haiku/Sonnet-class, batch)** | Replaces the prototype's keyword rules: classify each SKU into taxonomy, extract materials/style tags from title+description, normalize dimensions. Runs once per feed sync, not per request |

### 4.2 The render pipeline (per edit operation)

```
User message
  → Designer Agent (Claude + tools) resolves intent against RoomModel
  → EditPlan: [{op: replace, target: obj_17, product: sku_247598, position: …}, …]
  → UI immediately shows the plan overlay (free)
  → For each op, RenderWorker:
      1. Build mask from SceneObject polygon (+ dilation for shadow room)
         — never a hand-drawn rectangle
      2. Preprocess product photo: background-strip, perspective pre-warp
         toward the target wall angle (homography from RoomModel geometry)
      3. Compose edit-model call: room image + product reference + mask +
         geometry-aware prompt (wall angle, scale in px, lighting direction)
      4. Generate (low quality for iterations; high only on "finalize/share")
      5. QA: re-detect object in result (SAM), Claude identity check vs
         reference; one auto-retry with corrective prompt on failure
      6. Update RoomModel: register/replace SceneObject with real mask
         from the *result*, link SKU
  → New version node; hotspots come from result-space masks (accurate
    polygons, not the input rectangle — fixes a real prototype bug class)
```

Multi-op requests ("replace the sofa and add two plants") sequence ops on the same
canvas within one version. "Three concepts" fans out parallel single-op pipelines.

### 4.3 Cost reality (design constraint, not afterthought)

Per iteration: segmentation+depth ~$0.001–0.01 (amortized, cached per photo), designer
turn ~$0.01–0.05, render ~$0.01 (low) to ~$0.13–0.17 (high). **A heavy session is
$0.50–2.00 of COGS.** This dictates: free tier = limited iterations at low quality;
high-quality renders on finalize only; caching of RoomModel aggressively. The margin
on one sofa sale (~CHF 100+) pays for hundreds of sessions — conversion is the
economics, not subscription.

---

## 5. Supplier Integration

### 5.1 Catalog (redesign of the prototype's JSON-in-repo)

- **Postgres as source of truth.** Nightly sync worker streams each supplier's bulk
  feed (validated: VidaXL Main Feed 1.65GB CSV with photos/dimensions/URLs + Stock &
  Price feed for fresh cost/stock, joined by SKU — the prototype's ingestion script
  becomes this worker).
- **Enrichment at sync time, once per SKU:** batch LLM classification into our
  taxonomy (kills the keyword-rules bug class permanently — "Pawprints"≠art,
  German compounds handled), dimension parsing, style/material/color tags, text +
  image embeddings.
- **Multi-supplier by construction:** the adapter interface from the prototype
  survives; BigBuy / Artisan Furniture next. Products carry supplier, wholesale cost,
  our price, stock, shipping class (parcel/freight — VidaXL's parcel/pallet flag).
- **Search API the agent calls:** structured filters (category, dims-fit, price,
  stock, supplier) × semantic query × visual similarity, returning ranked SKUs with
  *fit scores* against the current RoomModel (does it physically fit the target
  footprint — real dimensions vs. placement graph, generalizing the prototype's
  advisory check).

### 5.2 Orders & fulfillment (the money path)

Constraint discovered and verified in the prototype: **VidaXL order creation is API,
payment is manual** in their dashboard. Design accordingly:

```
Customer: cart → Maison checkout (Stripe: cards + TWINT for CH) → order confirmed
Backend:  order record → fulfillment queue → per-supplier task:
            - VidaXL: POST /api_customer/orders (API) → ops pays in dashboard
              (manual step, tracked in an internal ops console) → status/tracking
              polled from their order API → customer notified
Customer sees: normal e-commerce order tracking. Never sees the supplier.
```

Ops console (internal page): pending supplier payments, margin per order, stock
mismatches, returns. Boring, essential, cheap to build.

**Returns/liability note (pre-launch homework):** dropship returns policy per
supplier, Swiss consumer law, who eats freight damage on pallet goods — resolve
before real customers, not after.

---

## 6. Conversation & Memory Architecture

- **Designer Agent** = Claude with tools: `analyze_room`, `search_products`,
  `plan_edits`, `render`, `manage_constraints`, `recall_history`.
- **Context per turn:** compact RoomModel summary (not pixels; the vision pass
  already distilled them), constraint ledger, version-tree summary, last N messages.
- **Constraint ledger is the memory that matters:** budget ceilings, material/color
  rules, pinned objects, supplier restrictions, style direction — explicit, inspectable
  ("what am I working with?" → the agent lists them), lift-able ("forget the budget").
- **Cross-session memory:** persisted per user (style profile, home rooms, past
  purchases) → "design my bedroom to match my living room."
- **Escape hatch honesty:** when the user asks for something the pipeline can't do
  yet (structural renovation, exact paint SKUs), the agent says so and offers the
  nearest real capability. No silent failure, no fake confidence.

---

## 7. Backend Architecture

```
Next.js (Vercel)                    — app, auth, API routes (thin)
Postgres (Neon/Supabase) + pgvector — users, rooms, versions, catalog, orders
Blob storage (S3/R2)               — photos, renders, masks, depth maps
Queue + workers (Modal or Fly + Redis)
    RenderWorker      — the §4.2 pipeline (long-running, retries, idempotent)
    VisionWorker      — SAM/depth/detection on serverless GPU (Modal/Replicate/Fal)
    CatalogSyncWorker — nightly feeds → enrich → embed
    FulfillmentWorker — supplier order creation, status polling
Realtime: SSE from workers → UI (plan → progress → done)
```

Why a queue is non-negotiable: renders are 10–60s, retryable, and parallel ("three
concepts"); request/response API routes (the prototype pattern) cannot carry the
product experience.

### Database schema (core)

```sql
users(id, email, style_profile jsonb, created_at)
rooms(id, user_id, title, photos jsonb, room_model jsonb, model_assets jsonb) -- masks/depth in blob refs
room_versions(id, room_id, parent_id, render_url, edit_plan jsonb,
              label, quality, created_at)          -- version DAG
version_objects(id, version_id, scene_object_id, product_id,
                mask_ref, bbox, source)            -- hotspots & shoppability
messages(id, room_id, role, content, tool_calls jsonb, version_id?)
constraints(id, room_id, kind, value jsonb, active bool)
suppliers(id, name, adapter, config jsonb)
products(id, supplier_id, sku, title, category, style_tags text[],
         price, cost, stock, dimensions jsonb, images jsonb,
         product_url, shipping_class, embedding vector, img_embedding vector)
carts / cart_items / orders / order_items(product_id, price_at_purchase, supplier_order_ref)
fulfillment_tasks(order_item_id, supplier_id, state, supplier_ref, tracking, notes)
```

---

## 8. Frontend Architecture

- **Stack stays:** Next.js + React + Tailwind + Zustand (server state per room via
  queries/SSE; Zustand for canvas UI state only).
- **Canvas component:** layered — base render, hotspot polygons (from masks, hover
  glow), plan-overlay layer (incoming edits), pinned-object badges. Click → product
  drawer. Optional drag emits the same edit ops as language.
- **Chat rail:** streaming agent responses, inline plan cards ("Replacing *Sofa* with
  **vidaXL Sofa Grün** · CHF 624 · fits your 3.2m wall — rendering…"), constraint
  chips always visible.
- **Filmstrip:** version DAG as horizontally scrollable branches; tap to jump,
  long-press to fork/compare.
- **Product drawer:** photo, price, dimensions with a fit badge against *this room*,
  variants, delivery estimate, cheaper/premium/similar rails (embedding search),
  add-to-cart.
- **Mobile-first.** The upload device is a phone. Desktop is the bonus, not the target.

---

## 9. Honest Critique of the Current Prototype

What the prototype got **right** (and the redesign keeps): real supplier data end-to-end
with margin math; explicit real/sample/mock honesty; paid calls only behind explicit
buttons; graceful key-less degradation; verify-before-build discipline on external APIs;
human-confirm placement before spending.

What is **architecturally dead-ended** (and why it doesn't carry forward):

1. **Rectangle masks.** Real objects aren't rectangles; removal/replacement of existing
   furniture is impossible without segmentation. → SAM polygons everywhere.
2. **No persistent scene state.** Each generation forgets everything. "Move it left"
   is unanswerable. → RoomModel.
3. **One product per generation.** A room is 5–15 objects. → EditPlan with multi-op
   sequencing.
4. **Keyword taxonomy mapping.** Already broke twice on real data (Pawprints→art,
   German compounds); unfixable by adding keywords. → batch LLM enrichment at sync.
5. **Catalog as JSON in the repo.** No stock freshness, no search, 200-item ceiling.
   → Postgres + embeddings + nightly sync.
6. **Request/response renders.** 60s inside an API route: no progress, no retries, no
   parallelism. → queue + workers + SSE.
7. **The procedural Three.js walkthrough** is a *demo asset*, not this product. Real
   walkthrough (3D from photos) stays out of scope until the 2D loop prints money —
   revisit with Gaussian-splatting-class tech as a Phase-5 wow, not a foundation.
8. **No accounts/persistence.** Sessions die with the tab. → auth + rooms from Phase 1.

---

## 10. Roadmap

**Phase 1 — Conversational core on today's stack (2–4 weeks)**
Auth + persistent rooms/versions (Postgres). Catalog → Postgres + batch LLM enrichment
+ embeddings (kills keyword bugs, unlocks "under €800 in oak"). Chat rail wired to a
Designer Agent that drives the *existing* placement + composite pipeline. Multi-op
sequential edits. Hotspots from result-space re-detection. Queue for renders.
*Exit criterion: a user chats an empty room into a 5-item shoppable render without
touching a control.*

**Phase 2 — See the room like a designer (4–6 weeks)**
VisionWorker: SAM 2 + metric depth + detection → full RoomModel with placement graph.
Occupied rooms: remove/replace existing furniture by mask. Pinning, constraint ledger,
version DAG UI. Product photo pre-warp from geometry. Identity QA + auto-retry.
*Exit criterion: upload a furnished room, say "replace the sofa, keep everything
else," get a correct shoppable render.*

**Phase 3 — Money (3–4 weeks, overlaps 2)**
Stripe checkout (cards + TWINT), orders, fulfillment queue + ops console, VidaXL
order-API integration with the manual-payment ops step, returns policy. Second
supplier (BigBuy) through the same adapter to prove multi-supplier.
*Exit criterion: a real customer buys a rendered room; ops fulfills it without
touching a spreadsheet.*

**Phase 4 — Magic & scale (ongoing)**
Full-room restyle + product-linking pass ("make it Japandi" on a furnished room).
"Three concepts" parallel fan-out. Quality evals (identity, placement, photorealism
scored on a fixed room/product test set — regression-gate every model/prompt change).
Latency: plan-overlay UX, streaming previews. Pricing: free tier caps, credits.
Style-profile memory across rooms.

**Phase 5 — The moat compounds**
More suppliers = better selection = better designs. Purchase-outcome data = better
recommendations. Room library = "redesign my whole flat." 3D walkthrough revisited
as a share/wow layer on top of the proven 2D economics.

---

## 11. What I would do first, Monday morning

1. Postgres + auth + rooms/versions/messages schema (one day of plumbing that
   everything else needs).
2. Catalog sync worker from the existing ingestion script + batch enrichment of the
   full relevant VidaXL range (not 200 samples) + embeddings.
3. Designer Agent v1: Claude tool-use loop in front of the existing
   placement/composite/matching modules — ship the chat, even before SAM. The moment
   users can *talk*, everything else becomes visible priorities.
