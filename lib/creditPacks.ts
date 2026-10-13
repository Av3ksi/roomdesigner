/**
 * Placeholder credit packs (see components/BuyCreditsModal.tsx and
 * app/api/checkout/credits) — kept in their own dependency-free module,
 * not exported from the modal component itself, so the (server-side)
 * checkout route doesn't pull a "use client" component and its React/icon
 * imports into the server bundle just to read this array.
 */
export const CREDIT_PACKS = [
  { id: "pack-10", credits: 10, priceChf: 5 },
  { id: "pack-30", credits: 30, priceChf: 12 },
  { id: "pack-100", credits: 100, priceChf: 30 },
];
