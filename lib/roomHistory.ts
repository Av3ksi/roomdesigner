import type { Adjustments, Product, RoomStyleSpec } from "./types";

/**
 * A single point in a room's edit timeline. Stores both the raw inputs
 * (accent, adjustments) so restoring is exact, and the derived outputs
 * (spec, products) so a thumbnail and price can be shown without recomputing.
 */
export interface RoomHistoryEntry {
  id: string;
  label: string;
  timestamp: number;
  activeIdx: number;
  variant: number;
  accent: string | null;
  adjustments: Adjustments;
  spec: RoomStyleSpec;
  products: Product[];
}
