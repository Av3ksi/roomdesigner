/**
 * The operating entity behind Vistroom, in ONE place — the /legal/* pages,
 * email footers and order documents all read from here, so a single edit
 * updates every legally-required disclosure at once instead of leaving one
 * page stating something different from another.
 *
 * ─────────────────────────────────────────────────────────────────────
 *  TODO BEFORE LAUNCH — fields marked `null` below are legally required
 *  and are deliberately left empty rather than filled with plausible
 *  placeholder data. The pages render a visible "not yet registered"
 *  notice wherever a field is null, so nothing on the site ever states a
 *  business fact that isn't true.
 *
 *    legalName  — the registered company name, or your own full legal
 *                 name if you trade as a sole proprietorship
 *                 (Einzelunternehmen). Required.
 *    address    — full street address, postal code, city, canton.
 *                 Required: a postal address is not optional for a Swiss
 *                 e-commerce provider (UWG Art. 3 para. 1 lit. s).
 *    uid        — the Swiss business identification number (CHE-xxx.xxx.xxx).
 *                 Only exists once you're entered in the commercial
 *                 register / registered for VAT. Mandatory on the site
 *                 once VAT-registered.
 *    vatNumber  — the same UID with the "MWST" suffix, once VAT-registered
 *                 (compulsory above CHF 100,000 annual turnover).
 *    phone      — optional in law, expected by consumers for a store.
 * ─────────────────────────────────────────────────────────────────────
 */
export interface LegalEntity {
  tradeName: string;
  legalName: string | null;
  address: { street: string; postalCode: string; city: string; canton: string; country: string } | null;
  email: string;
  phone: string | null;
  uid: string | null;
  vatNumber: string | null;
  /** The natural person answerable for the site's content. */
  responsibleForContent: string | null;
}

export const VISTROOM_ENTITY: LegalEntity = {
  tradeName: "Vistroom",
  legalName: null,
  address: null,
  email: "hello@vistroom.ch",
  phone: null,
  uid: null,
  vatNumber: null,
  responsibleForContent: null,
};

/** Countries the store currently ships to — mirrors the Stripe Checkout allow-list in app/api/checkout/session/route.ts. Keep the two in sync: shipping somewhere not listed here means shipping somewhere these policies don't describe. */
export const SHIPPING_COUNTRIES = ["Switzerland", "Germany", "Austria", "France", "Italy"];

/**
 * Every third party that processes personal data on Vistroom's behalf, and
 * where. Rendered directly into the privacy policy — the FADP's information
 * duty (Art. 19) requires naming the recipient countries, and Art. 16-17
 * require a legal basis for each cross-border disclosure. Adding a new
 * vendor to the app means adding it here too.
 */
export const DATA_PROCESSORS: { name: string; purpose: string; country: string }[] = [
  { name: "Neon (Postgres hosting)", purpose: "Stores accounts, rooms, orders and credit balances", country: "EU / USA" },
  { name: "Stripe", purpose: "Payment processing and subscription billing", country: "Ireland / USA" },
  { name: "OpenAI", purpose: "Image generation and editing for room renders", country: "USA" },
  { name: "Anthropic", purpose: "Room analysis, product matching and the design assistant", country: "USA" },
  { name: "Replicate", purpose: "Optional image segmentation and object removal", country: "USA" },
  { name: "Resend", purpose: "Transactional email (sign-in links, order confirmations)", country: "USA" },
  { name: "VidaXL", purpose: "Order fulfilment and shipping of purchased products", country: "Netherlands" },
];
