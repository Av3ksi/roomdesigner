import type { Metadata } from "next";
import Link from "next/link";
import InfoPage from "@/components/InfoPage";
import { SHIPPING_COUNTRIES, VISTROOM_ENTITY } from "@/lib/legalEntity";

export const metadata: Metadata = {
  title: "Retail Partners",
  description: "Where Vistroom's products actually come from, and how to supply us.",
};

/**
 * States the real supply position rather than implying a roster of brand
 * partnerships that doesn't exist: one integrated dropship wholesaler
 * today, with an open door for direct suppliers.
 */
export default function PartnersPage() {
  return (
    <InfoPage
      eyebrow="Retail Partners"
      title="Where the furniture comes from."
      intro="Every product in a Vistroom render is a real item from a real supplier, with a real price and real dimensions. Here's exactly who supplies them today, and how that works."
    >
      <h2>Our current supply</h2>
      <p>
        Vistroom&apos;s catalogue is currently sourced through <strong>VidaXL</strong>, a European wholesale
        and dropshipping distributor. Their feed gives us what the product experience depends on: real
        photography, physical dimensions, live stock levels and wholesale pricing across furniture, lighting,
        textiles and decor.
      </p>
      <p>
        When a customer orders, the order is passed to the supplier and shipped directly to the customer from
        their warehouse. We don&apos;t hold stock or run a warehouse. That&apos;s what lets a small company
        offer a catalogue this wide — and it&apos;s why our{" "}
        <Link href="/legal/returns">Returns Policy</Link> is explicit that goods travel back to a
        supplier&apos;s facility rather than to a Swiss address.
      </p>

      <h2>Why dimensions matter to us more than to most shops</h2>
      <p>
        Most retailers treat width and depth as specification-sheet trivia. For Vistroom they&apos;re load-bearing:
        a product&apos;s real width determines how large it is rendered in a customer&apos;s photograph. A
        supplier feed with missing or wrong dimensions produces a render that looks subtly wrong and a
        customer who buys something that doesn&apos;t fit. Feed quality is a product feature here, not a
        back-office concern.
      </p>

      <h2>Supplying Vistroom</h2>
      <p>
        We&apos;re open to working directly with manufacturers and brands, particularly ones with strong
        design credentials that a wholesale catalogue tends to flatten. What we need to integrate a supplier:
      </p>
      <ul>
        <li>A product feed or API with stable SKUs, updated stock and wholesale pricing.</li>
        <li>Product photography on a clean background — the render quality depends directly on it.</li>
        <li>Accurate physical dimensions in centimetres for every item.</li>
        <li>Dropship fulfilment to {SHIPPING_COUNTRIES.join(", ")}, and a defined returns process.</li>
      </ul>
      <p>
        If that describes you, write to <a href={`mailto:${VISTROOM_ENTITY.email}`}>{VISTROOM_ENTITY.email}</a>{" "}
        with a link to your feed documentation. We integrate suppliers ourselves and can usually tell you
        within a day whether the data is good enough to render from.
      </p>

      <h2>Items sourced from elsewhere</h2>
      <p>
        Occasionally the design assistant finds a product on the open web that our catalogue doesn&apos;t
        carry. Those are labelled clearly as sourced from another retailer, link out to that retailer&apos;s
        own listing, and are not sold by us — the purchase and any returns are between you and them.
      </p>
    </InfoPage>
  );
}
