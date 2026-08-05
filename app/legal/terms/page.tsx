import type { Metadata } from "next";
import LegalPage from "@/components/LegalPage";

export const metadata: Metadata = { title: "Terms of Service" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" lastUpdated="Draft">
      <p>Governs use of the Vistroom website and purchases made through it. Replace bracketed fields before launch.</p>

      <h2>Who we are</h2>
      <p>Vistroom is operated by [your registered company name] ("we", "us"). See our Imprint for full details.</p>

      <h2>The service</h2>
      <p>
        Vistroom generates AI-assisted interior design concepts from photos you upload, and lets you purchase
        real products (sourced through our dropship supplier(s)) that appear in those designs. Products shown
        as "sourced from another store" are not sold by us — they link to a third-party retailer's own listing
        and are subject to that retailer's own terms.
      </p>

      <h2>Orders and payment</h2>
      <ul>
        <li>Prices are shown in [CHF] and include/exclude [VAT — specify which] unless stated otherwise.</li>
        <li>Payment is processed by Stripe at the time of order.</li>
        <li>An order is accepted once payment is confirmed and you receive an order confirmation email.</li>
        <li>[State how out-of-stock items are handled if a supplier can't fulfill after payment.]</li>
      </ul>

      <h2>Delivery</h2>
      <p>
        Products are shipped by our supplier(s) directly to you. [State typical delivery timeframes, shipping
        costs, and which countries you currently ship to.]
      </p>

      <h2>Returns and cancellation</h2>
      <p>See our Returns Policy for the full process.</p>

      <h2>Liability</h2>
      <p>
        [This section needs real legal drafting — it should address the limits of our liability, particularly
        given products are fulfilled by a third-party supplier we don't manufacture or directly control.]
      </p>

      <h2>Governing law</h2>
      <p>[State the governing law and jurisdiction for disputes — likely Swiss law given the business's base.]</p>

      <h2>Contact</h2>
      <p>[support@yourdomain.tld]</p>
    </LegalPage>
  );
}
