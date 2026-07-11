// Core domain types shared across the app, the AI layer, and the render engine.

/** Parametric specification consumed by the RoomScene SVG render engine. */
export interface RoomStyleSpec {
  wall: string;
  wallAccent: string;
  panel: "slats" | "arch" | "brick" | "wainscot" | "none";
  floor: string;
  floorSeam: string;
  rug: string;
  rugAccent: string;
  sofa: string;
  sofaShadow: string;
  cushions: string[];
  wood: string;
  metal: string;
  lampGlow: string;
  windowLight: string;
  art: "abstract" | "line" | "botanical" | "geo" | "none";
  artColors: string[];
  plant: boolean;
  pendant: boolean;
  /** 0–1: strength of the warm ambient light overlay. */
  warmth: number;
}

export interface DesignStyle {
  id: string;
  name: string;
  tagline: string;
  description: string;
  tags: string[];
  palette: string[];
  spec: RoomStyleSpec;
  /** Typical furnishing budget band shown on the style card. */
  budgetBand: string;
}

export interface DetectionBox {
  x: number; // 0–1, relative to image width
  y: number; // 0–1, relative to image height
  w: number;
  h: number;
}

export interface Detection {
  label: string;
  detail: string;
  confidence: number;
  box?: DetectionBox;
}

export interface RoomAnalysis {
  engine: "claude" | "demo";
  roomType: string;
  confidence: number;
  summary: string;
  dimensions: {
    widthM: number;
    depthM: number;
    heightM: number;
    areaM2: number;
  };
  walls: { count: number; condition: string; finish: string };
  windows: { count: number; orientation: string; naturalLight: string };
  doors: { count: number; note: string };
  flooring: { material: string; tone: string; condition: string };
  lighting: {
    naturalScore: number; // 0–100
    artificial: string;
    colorTemperature: string;
  };
  colorPalette: { hex: string; name: string }[];
  materials: string[];
  furniture: { item: string; condition: string; verdict: string }[];
  detections: Detection[];
  opportunities: string[];
  styleAffinity: { styleId: string; score: number }[];
}

export type ProductCategory =
  | "sofa"
  | "chair"
  | "table"
  | "lighting"
  | "rug"
  | "art"
  | "plant"
  | "storage"
  | "decor"
  | "textile";

export interface Product {
  id: string;
  name: string;
  brand: string;
  category: ProductCategory;
  price: number;
  rating: number;
  reviews: number;
  styles: string[];
  /** Dominant color used by the procedural product thumbnail. */
  color: string;
  blurb: string;
}

export interface DesignConcept {
  id: string;
  styleId: string;
  variant: number;
  name: string;
  narrative: string;
  spec: RoomStyleSpec;
  productIds: string[];
}

export interface GenerateResponse {
  engine: "claude" | "demo";
  concepts: DesignConcept[];
}

export type BudgetTier = "essential" | "signature" | "luxe";

/** Preferences collected before generation — steers products, palette and narrative. */
export interface DesignBrief {
  budget: BudgetTier;
  accent: string | null;
  lifestyle: string[];
  brands: string[];
  /** Hard ceiling for the room total; the AI re-specifies pieces to fit. */
  maxBudget: number | null;
}

/** Live modifications the AI designer (or the user directly) applies on top of a generated concept. */
export interface Adjustments {
  warmthDelta: number;
  budget: BudgetTier | null;
  brandFilter: string[] | null;
  swaps: Partial<Record<ProductCategory, Product>>;
  childFriendly: boolean;
}

/* ————— AI designer assistant ————— */

export type AssistantAction =
  | { type: "adjust_warmth"; delta: number }
  | { type: "set_accent"; hex: string | null }
  | { type: "set_budget"; tier: BudgetTier }
  | { type: "swap_product"; category: ProductCategory; direction: "cheaper" | "premium" | "different" }
  | { type: "restrict_brands"; brands: string[] }
  | { type: "child_friendly" };

export interface AssistantResponse {
  engine: "claude" | "demo";
  reply: string;
  actions: AssistantAction[];
}

export interface AssistantContext {
  styleId: string;
  styleName: string;
  budget: BudgetTier;
  total: number;
  productSummary: string;
  roomSummary: string;
}

export type UploadKind = "photo" | "floorplan";

export interface AnalyzeImagePayload {
  base64: string;
  mediaType: string;
  kind: UploadKind;
}

export interface SampleRoom {
  id: string;
  name: string;
  meta: string;
  spec: RoomStyleSpec;
  analysis: RoomAnalysis;
}

/* ————— Shopping: saved rooms, wishlist, share ————— */

export type StockStatus = "in_stock" | "low_stock" | "made_to_order";

/**
 * A fully-resolved room, snapshotted for persistence (Saved Designs) or
 * transport (Share links). Captures the exact spec and product basket the
 * user was looking at — including any AI edits, swaps or colorway tints —
 * so re-opening it is pixel-identical to the moment it was saved.
 */
export interface RoomSnapshot {
  id: string;
  name: string;
  styleId: string;
  styleName: string;
  variant: number;
  spec: RoomStyleSpec;
  products: Product[];
  createdAt: number;
}
