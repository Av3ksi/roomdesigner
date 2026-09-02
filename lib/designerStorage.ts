/**
 * Shared localStorage/sessionStorage key names for the Designer's
 * cross-page room-continuity mechanisms — kept in their own tiny,
 * dependency-free module so a page that only needs the key name (e.g.
 * LookDetail's "Customize in Designer" button) doesn't have to import all
 * of components/Designer.tsx just to get it.
 */

/** Which live Designer room (lib/roomPersistence.ts's `rooms` table) to rehydrate on mount. */
export const ROOM_ID_STORAGE_KEY = "vistroom_room_id";

/**
 * Set by a source page right before navigating to /designer, to seed a
 * BRAND NEW room from an existing rendered photo (a Complete Room or a My
 * Rooms save) that the visiting session doesn't own as a live Designer
 * room. Designer.tsx reads and clears this on mount, taking priority over
 * ROOM_ID_STORAGE_KEY — the writer is expected to clear that key too, so
 * the two mechanisms never race over which room wins.
 */
export const SEED_ROOM_STORAGE_KEY = "vistroom_seed_room";
