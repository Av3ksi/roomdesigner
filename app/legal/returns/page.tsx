import type { Metadata } from "next";
import LegalPage from "@/components/LegalPage";

export const metadata: Metadata = { title: "Returns Policy" };

export default function ReturnsPage() {
  return (
    <LegalPage title="Returns Policy" lastUpdated="Draft">
      <p>
        Products are dropshipped directly from our supplier(s), so the return process differs from a normal
        retail return — replace the bracketed details with your real supplier return policy before launch (check
        your supplier agreement's own returns terms; this needs to be consistent with what they'll actually
        accept back).
      </p>

      <h2>Right of withdrawal</h2>
      <p>
        [State the cancellation window you offer (commonly 14 days for EU/Swiss consumer sales) and how a
        customer exercises it — email, a form, etc.]
      </p>

      <h2>Condition for a return</h2>
      <ul>
        <li>[State condition requirements — unused, original packaging, etc.]</li>
        <li>[State any categories excluded from return, e.g. made-to-order or hygiene items, if applicable.]</li>
      </ul>

      <h2>Who pays return shipping</h2>
      <p>[State this clearly — it's a common source of disputes and varies a lot by supplier agreement.]</p>

      <h2>Refunds</h2>
      <p>
        [State refund timeline and method — typically back to the original Stripe payment method once the
        returned item is received and inspected.]
      </p>

      <h2>Damaged or incorrect items</h2>
      <p>[State the process for a damaged-on-arrival or wrong-item claim — usually faster/no-cost vs. a change-of-mind return.]</p>

      <h2>Contact</h2>
      <p>[returns@yourdomain.tld]</p>
    </LegalPage>
  );
}
