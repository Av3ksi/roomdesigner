# Maison — Your AI Interior Designer

Upload a photo of your room. Maison's AI reads the space — dimensions, walls,
windows, doors, flooring, furniture, lighting, colors, materials, spatial
layout — then designs it back to you in eight signature styles. Every concept
is fully shoppable: the furniture in the render maps to real marketplace
products you can buy in one click.

**The experience:** _"I uploaded my room and AI created my dream home."_

## Product surface

| Route | What it is |
| --- | --- |
| `/` | Landing page — hero with live before/after slider, spatial-intelligence showcase, styles, pricing |
| `/studio` | The core product: upload → AI analysis → style selection → 3 generated concepts → compare → customize → shop |
| `/styles` | All 8 design languages, each rendered in its 3 concept variants |
| `/marketplace` | Curated product catalog, filterable by category and style |
| `/pricing` | Plans + FAQ |

## The studio flow

1. **Upload** a room photo (drag & drop; downscaled client-side to 1568px),
   or pick one of three sample rooms.
2. **Analysis** — the AI returns a structured model of the space: dimensions,
   walls, windows + orientation, doors, flooring, lighting score + color
   temperature, extracted palette, materials, per-item furniture verdicts
   (keep/replace), localized detections with bounding boxes, design
   opportunities, and a per-style match score.
3. **Style selection** — 8 signature styles ranked by fit for *your* room.
4. **Generation** — three concepts (Signature / Editorial / Warm Hour), each
   with a designer narrative grounded in the analysis, a parametric room
   render, and a shoppable product list.
5. **Compare & customize** — before/after slider, accent recoloring, per-item
   include/exclude with a live room total.
6. **Buy the room** — one click adds the whole look to the cart.

## The AI intelligence layer

Maison behaves like a professional interior designer, in five systems:

1. **Room understanding** — vision analysis of architecture, dimensions,
   furniture placement, lighting, materials and colors (multi-angle photos +
   floor plan cross-referencing).
2. **Style generation** — ten complete design languages: Scandinavian,
   Japandi, Modern Luxury, Minimalist, Industrial, Organic Modern,
   Mediterranean, Dark Luxury, Cozy, Classic — each with 3 concept variants.
3. **AI conversation** (`/api/assistant`) — a designer chat inside the result
   view. "Make it warmer", "Replace the sofa", "Make it cheaper", "Use only
   Swiss stores", "Make it more luxurious", "Create a child-friendly
   version" — free text is interpreted into structured room actions (Claude
   structured outputs; keyword engine in demo mode) and applied instantly:
   lighting, accents, budget tier, product swaps, brand/country restrictions.
4. **Budget AI** — max budget, preferred brands and quality tier steer
   specification; `fitToBudget` greedily re-specifies the priciest pieces
   until the room lands under the ceiling.
5. **Shopping AI** — every rendered object maps to a purchasable product,
   with similar / cheaper / premium alternatives one tap away (hotspot
   popovers + list swaps) and AI-picked matching accessories.

## AI architecture

```
app/api/analyze  ──►  lib/ai/claude.ts ── Claude (claude-opus-4-8) vision +
                      structured JSON output (output_config.format), adaptive thinking
                        │
                        └── falls back to lib/analysis.ts (deterministic demo engine)

app/api/generate ──►  concept assembly (styles × catalog, deterministic)
                        └── designer narratives via Claude when enabled,
                            template fallback otherwise
```

- **With `ANTHROPIC_API_KEY` set**, uploaded photos are analyzed by Claude
  vision with a strict JSON schema (`lib/ai/claude.ts`), and concept
  narratives are written by Claude against the actual analysis.
- **Without a key**, the platform runs fully in demo mode: sample rooms carry
  hand-built expert analyses; uploads get a clearly-labeled simulated
  analysis. Nothing breaks, nothing is faked silently — the UI states which
  engine produced each result.

Rendering is handled by a **parametric SVG room engine**
(`components/room/RoomScene.tsx`): a one-point-perspective scene (walls,
window with light shaft, plank flooring, sofa, cushions, rug, tables, lamps,
art, plants, wall treatments) driven entirely by a `RoomStyleSpec`. The same
engine renders the dated "before" rooms, all 24 style×variant concepts, and
the style gallery — with zero external image dependencies. In production this
layer is the seam where a diffusion-based photoreal renderer plugs in; the
spec objects are the conditioning payload.

## Running it

```bash
npm install
cp .env.example .env      # optionally add ANTHROPIC_API_KEY
npm run dev               # http://localhost:3000
```

Production: `npm run build && npm start`.

## Stack

Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS ·
Zustand (persisted cart) · `@anthropic-ai/sdk` · zero external images/fonts.

## Roadmap

- Photoreal generation: pipe `RoomStyleSpec` + analysis into an image-to-image
  model conditioned on the user's photo
- Keep-item placement (analysis already emits keep/replace verdicts)
- Projects & mood boards, multi-room homes
- Retail partner API integration + live inventory/pricing
- AR walkthrough of generated concepts
