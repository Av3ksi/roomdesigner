/**
 * Delivery/installation options and their prices — shared by the client
 * (Checkout.tsx, for display) and the server (the checkout session route,
 * for the actual charge) so the two can never drift apart. Never trust a
 * price the client sends; look these ids up here instead.
 */
export const DELIVERY = [
  { id: "standard", label: "Standard delivery", note: "5–7 business days, to your door", price: 0, min: 5, max: 7 },
  { id: "express", label: "Express delivery", note: "2–3 business days", price: 49, min: 2, max: 3 },
  { id: "whiteglove", label: "White-glove delivery", note: "Scheduled window, unboxed & placed in the room", price: 199, min: 6, max: 9 },
] as const;

export const INSTALLATION = [
  { id: "none", label: "No installation", note: "I'll set it up myself", price: 0 },
  { id: "assembly", label: "Professional assembly", note: "Every piece assembled & packaging removed", price: 149 },
  { id: "styling", label: "Assembly + designer styling visit", note: "A Maison designer stages the room to the concept", price: 399 },
] as const;

export type DeliveryId = (typeof DELIVERY)[number]["id"];
export type InstallId = (typeof INSTALLATION)[number]["id"];
