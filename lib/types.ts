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

export interface SampleRoom {
  id: string;
  name: string;
  meta: string;
  spec: RoomStyleSpec;
  analysis: RoomAnalysis;
}
