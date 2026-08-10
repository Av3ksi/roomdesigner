# Vistroom — agent context

Canonical orientation file for any AI agent working in this repo. Written to
be read start-to-finish before touching code. `CLAUDE.md` points here.

**Note:** `README.md` is partly stale (it describes an eight-style `/studio`
flow that no longer exists). Where the two disagree, this file is correct.

---

## 1. What this is

Next.js 15 (App Router) + TypeScript + Tailwind + Zustand, Postgres on Neon.
An AI interior-design storefront: a customer photographs their room, talks to
an AI designer, and every object rendered into the result is a real
purchasable product from a supplier feed with a clickable buy-pin.

The commercial promise is the constraint that shapes the whole codebase:
**everything visible in a render must map to a catalogue entry.** An
invented rug is unpurchasable, unpinnable, and a lie about what the customer
is buying. Image models fight this constantly — they "helpfully" stage extra
props — which is why `lib/ai/prompts.ts` carries explicit catalogue-only
language on every image call.

### Two distinct product surfaces

| Surface | Route | What it does |
|---|---|---|
| **Designer** (live product) | `/designer` | Conversational: upload a room, chat, confirm each edit. Spends credits. |
| **Looks** (curated content) | `/looks`, `/looks/[id]` | Pre-built "shop the whole look" rooms with clickable hotspots. Built offline by scripts. |

`/studio` and `/designs` are **retired** — both `redirect()` elsewhere
(`/designer` and `/my-rooms`). `components/studio/Studio.tsx` and its
children are orphaned; nothing in `app/` imports them. Don't build on them.

---

## 2. Commands

```bash
npm run dev          # next dev
npm run build        # next build  — run before every commit
npm run typecheck    # tsc --noEmit — run before every commit
```

There is **no test suite and no linter configured.** `typecheck` + `build`
are the full verification gate. Both must pass before committing.

### Scripts that cost real money

Every script below makes paid image-generation calls. Read the module doc
comment before running one.

```bash
npx tsx scripts/generate-showroom-rooms.ts        # ONE curated room (default)
npx tsx scripts/generate-showroom-rooms.ts 5      # first N concepts
npx tsx scripts/generate-looks.ts <count> [style] [quality]
npx tsx scripts/seed-products.ts                  # load catalogue into Postgres
npx tsx scripts/fix-room-pin.ts <roomId>          # repair a hotspot, no regeneration
```

Diagnostics (cheap, safe, never print secrets):

```bash
npx tsx scripts/openai-diagnose.ts    # is image generation working at all
npx tsx scripts/openai-matrix.ts      # is a failure parameter-driven or intermittent
npx tsx scripts/cj-test-fetch.ts [kw] # CJ Dropshipping API probe
npx tsx scripts/gelato-test-fetch.ts  # Gelato print-on-demand probe
```

---

## 3. Architecture

### The render pipeline

```
room photo
  -> lib/ai/placement.ts      suggestPlacements()  one Claude vision call:
                              box + wallAngleDeg + spanM per category,
                              plus whole-room dimension estimate
  -> lib/placementBoxes.ts    scaleBoxToRealWidth(box, spanM, realWidthCm)
                              converts image space to world space
  -> lib/ai/composite.ts      composeSceneWithProducts()  ONE OpenAI edit
                              call containing every product reference image
  -> lib/ai/identityCheck.ts  did the right product appear? any invented
                              objects? (one billed vision call answers both)
  -> lib/ai/locate.ts         detectSceneItems()  where did each item land,
                              for the clickable hotspots
  -> lib/finishedRooms.ts     createFinishedRoom()
```

`spanM` is the load-bearing idea: the real-world metres a suggested box
spans *at its own depth in that photo*. It is the only bridge between pixel
coordinates and physical size, so a product's real `dimensionsCm` can be
turned into a correctly-sized box. Without it every object renders at a
plausible-looking but arbitrary scale.

### Provider split

- **Anthropic (Claude)** — all vision and reasoning: room analysis,
  placement, product description, identity/QA checks, the designer agent.
- **OpenAI (`gpt-image-1.5`)** — all image generation and editing. Claude
  has no image generation capability; this is a genuinely separate provider,
  separately billed.
- **Replicate (optional)** — Grounded-SAM + FLUX Fill, the preferred path
  for *removing* existing furniture. Falls back to OpenAI when unset or
  failing.

### Key modules

| File | Responsibility |
|---|---|
| `lib/ai/prompts.ts` | Every image-edit prompt, composed from shared blocks. Change prompts **here**, never at a call site. |
| `lib/ai/composite.ts` | OpenAI image edits: insert product, remove object, compose scene. |
| `lib/ai/openaiImageGen.ts` | Shared retry/backoff for both OpenAI image endpoints. |
| `lib/ai/openaiConfig.ts` | `MODEL` + `compositingEnabled`. Exists only to break a `composite` <-> `openaiImageGen` import cycle. |
| `lib/ai/placement.ts` | Placement vision call and its JSON schema. |
| `lib/ai/designer.ts` | The conversational agent loop and its tools. |
| `lib/suppliers/mapping.ts` | Supplier feed -> `Product`. Category/style/colour inference, retail markup. |
| `lib/productSearchDb.ts` | Catalogue load (cached), marketplace pagination, `upsertProduct`. |
| `lib/store.ts` | Zustand store. Credits live here — see §5. |

---

## 4. Environment

All optional; each unset key degrades one feature rather than crashing.
`.env.example` documents every variable with real operational detail — read
it, it is not boilerplate.

| Variable | Enables |
|---|---|
| `ANTHROPIC_API_KEY` | All vision/reasoning. Without it, demo mode. |
| `OPENAI_API_KEY` | All image generation/editing. |
| `DATABASE_URL` | Postgres persistence (Neon). Schema auto-creates. |
| `REPLICATE_API_TOKEN` | Preferred furniture-removal path. |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Real payments + Premium. |
| `RESEND_API_KEY` / `EMAIL_FROM` | Transactional email. |
| `CJ_API_KEY` | CJ Dropshipping accent items. |
| `GELATO_API_KEY` | Print-on-demand wall art (not yet wired into a supplier adapter). |
| `SERPAPI_KEY` | Google Shopping fallback search. |

**There is no `schema.sql` and no migration step.** `lib/db.ts`'s
`ensureSchema()` creates every table idempotently on first touch. Any
instruction telling you to run a schema file is describing a different app.

---

## 5. Hard-won knowledge

These were each discovered by something breaking in production use. They are
not derivable from reading the code.

### Anthropic structured outputs
- **`minItems` / `maxItems` are not supported** (nor `minimum`, `maxLength`,
  other "complex" constraints). `enum`, `const`, `anyOf`, `$ref` are fine.
- **Don't build a schema as N duplicated object properties.** Ten
  per-category copies of the same shape blew the grammar-size limit
  (`"The compiled grammar is too large"`) and broke *every* placement call.
  Use one array with a reused item schema. See `lib/ai/placement.ts`.
- On Sonnet 5+, an omitted `thinking` field silently runs *adaptive*
  thinking. Set `thinking: { type: "disabled" }` explicitly on calls meant
  to be fast.

### OpenAI image calls
- **Retry generously.** On a poor connection ~3 of 4 image requests returned
  a Cloudflare 520. `lib/ai/openaiImageGen.ts` uses 8 attempts with
  exponential backoff. A 520 produces no image and is **not billed**, so
  retrying costs time, not money.
- **A Cloudflare HTML error page is not a rejected request.** It means
  upstream/network trouble. Never parse it as JSON; log the status only.
- **Upload size is the bottleneck, not download.** A scene composite POSTs
  the room plus one reference image per item in one multipart body.
  Reference photos go through `toReferenceImageBlob` (1024px, JPEG q88,
  ~73% smaller). The room canvas and mask keep full resolution — they define
  the output.
- Symptoms of a bad path: TCP connect in 90ms but 20s total; identical
  requests both succeeding and failing. That is intermittent, **not** a
  parameter problem — don't go changing quality/size settings chasing it.

### Cost discipline in batch scripts
Ordering matters financially. Run the cheap failure-prone step **before** the
expensive ones. `generate-showroom-rooms.ts` learned this the hard way: it
generated two images per concept *before* validating placement, so a
placement bug burned five rooms' worth of image spend per run for zero
output. It now: base room -> placement (cheap, fails often) -> poster ->
composite, defaults to one room, and aborts the batch if the first room
fails with none succeeded.

### Supplier data
- **VidaXL's feed is German.** Search it with German keywords ("eiche",
  "samt", "teppich"). Style/category inference in
  `lib/suppliers/mapping.ts` is bilingual for this reason — an English-only
  keyword list silently matched almost nothing and dumped every product into
  a default style pair.
- **CJ Dropshipping dimensions are packaging size, not item size.**
  Confirmed against real products: a "sofa" reported 45×40×23cm. Never feed
  CJ dimensions into scale grounding. `lib/suppliers/cjdropshipping.ts`
  deliberately leaves `dimensionsCm` unset, and CJ is used only for small
  decor accents where on-image scale barely matters.
- CJ's search relevance for home decor is poor ("brass candle holder"
  returned an incense tray). Treat picks as needing human review.
- `mapping.ts` enforces a CHF 5 price floor — cheap CJ items otherwise
  rounded to CHF 0.

### Content honesty
Fabricated marketing content has been removed from this codebase
deliberately, and framed as a legal matter (misleading advertising, Swiss
UWG Art. 3), not a style preference. Do not add invented testimonials,
customer counts, ratings, or precision figures. `lib/legalEntity.ts` holds
real business details as `null` and renders them as a visible
"to be added before launch" marker rather than plausible-looking fake data.
Keep that pattern.

---

## 6. Conventions

- **Comments explain *why*, especially when the code looks odd.** Most
  non-obvious lines here encode a real failure. Preserve that context when
  editing; don't strip a comment that records why something is the way it is.
- Prompts belong in `lib/ai/prompts.ts`, composed from shared blocks, so a
  wording fix lands on every provider at once.
- Every integration degrades rather than crashes when its key is missing.
- `quality` tiering for image calls: `"high"` for permanent public content
  (curated looks, adding a product), `"medium"` for one-offs, `"low"` for
  disposable previews.
- Credits live in the shared Zustand store (`lib/store.ts`), never in local
  component state, and are excluded from `persist` — they must come from the
  server. `CreditBadge` is the single fetch trigger app-wide.

---

## 7. Known gaps

Real, current, and deliberately unfixed rather than forgotten:

- **Gelato is not a supplier adapter.** `lib/ai/posterArt.ts` generates
  poster art and stores a `gelato` supplier id, but its `productUid` is a
  constructed guess and its price (CHF 45) is a **placeholder, not a real
  quote**. No ordering integration exists.
- **CJ has no bulk ingest** — search-on-demand only, by design (1.4M mostly
  non-furniture products).
- **Hotspot detection misassigns soft furnishings.** Throws, duvets and
  cushions all read as "white soft textile". Repair with
  `scripts/fix-room-pin.ts` rather than regenerating a room.
- **A product can be listed and priced into a look without appearing in the
  render.** Nothing reconciles the two; check visually.
- `lib/legalEntity.ts` needs real operator details before launch, and the
  FADP cross-border transfer section needs a lawyer.
- Replicate model slugs are env-overridable because availability drifts and
  the defaults may go stale.
