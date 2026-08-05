import type { Metadata } from "next";
import Link from "next/link";
import LegalPage from "@/components/LegalPage";
import PendingDetail from "@/components/PendingDetail";
import { SHIPPING_COUNTRIES, VISTROOM_ENTITY } from "@/lib/legalEntity";
import { FREE_CREDITS } from "@/lib/credits";

export const metadata: Metadata = { title: "Terms of Service" };

/**
 * Written against Swiss contract law (Code of Obligations, "OR"). The two
 * points that most often get copied wrongly from EU templates and are
 * correct here:
 *
 *  1. Contract formation (OR Art. 3-7): a product listing is an invitation
 *     to treat, the customer's order is the offer, our confirmation is the
 *     acceptance. This matters for dropshipping — it's what lets us decline
 *     an order the supplier can no longer fulfil, instead of being bound to
 *     a sale we can't complete.
 *  2. Switzerland grants NO general statutory right of withdrawal for
 *     distance/online sales. OR Art. 40a ff. covers doorstep and telephone
 *     sales only. Any return window we offer online is therefore a
 *     voluntary contractual promise, not a statutory one — and it is
 *     described as such rather than as "your 14-day right".
 */
export default function TermsPage() {
  const e = VISTROOM_ENTITY;

  return (
    <LegalPage title="Terms of Service" lastUpdated="6 August 2026">
      <p>
        These terms govern your use of {e.tradeName} and any purchase you make through it. They form a
        contract between you and {e.legalName ?? <PendingDetail label="the registered operator" />}, the
        operator of this site. Please read them before ordering.
      </p>

      <h2>1. What Vistroom does</h2>
      <p>
        Vistroom is an AI-assisted interior design service. You upload photographs of your own room; we
        generate visualisations showing real, purchasable products placed in that room; and you may then buy
        those products through the site. Two distinct things are on offer, and they are governed differently:
      </p>
      <ul>
        <li>
          <strong>The design service</strong> — AI visualisations, paid for with credits or a Premium
          subscription. This is a service contract (OR Art. 394 ff.).
        </li>
        <li>
          <strong>The goods</strong> — physical furniture and decor, shipped to you. This is a sale of goods
          (OR Art. 184 ff.), and your statutory warranty rights apply to it.
        </li>
      </ul>
      <p>
        Some items shown in a design are marked as sourced from another retailer. Those are not sold by us: we
        link to the third-party listing, and any purchase there is a contract between you and that retailer,
        on their terms.
      </p>

      <h2>2. Accounts</h2>
      <p>
        You can browse and generate designs without an account. Buying, saving a collection across devices, or
        subscribing requires one. You are responsible for keeping access to your email account secure, since
        sign-in links are sent there. Tell us promptly if you believe someone else has accessed your account.
      </p>

      <h2>3. Credits, Premium and payment for the design service</h2>
      <ul>
        <li>
          Every new visitor receives {FREE_CREDITS} free credits. Each confirmed AI render — adding, removing
          or moving an item — spends exactly one credit. Browsing the catalogue and adjusting a placement
          before you confirm are free.
        </li>
        <li>
          Credits are prepaid, tied to your session or account, have no cash value, and are not exchangeable
          or refundable for money once spent on a render that was produced.
        </li>
        <li>
          Premium is a recurring monthly subscription giving unlimited renders. It renews automatically until
          cancelled, and you may cancel at any time with effect from the end of the current billing period.
          We do not pro-rate part-months.
        </li>
        <li>
          If a render fails for technical reasons on our side and produces no usable image, tell us and we
          will restore the credit.
        </li>
      </ul>

      <h2>4. How an order is formed</h2>
      <p>
        Displaying a product on this site is an invitation to make an offer, not a binding offer by us. When
        you complete checkout and pay, you are making an offer to buy. The contract comes into existence only
        when we send you an order confirmation by email. This sequence follows OR Art. 3–7.
      </p>
      <p>
        Because goods are fulfilled by third-party suppliers (see clause 6), stock can change between the
        moment you order and the moment the supplier is instructed. If an item turns out to be unavailable, we
        may decline the order in whole or in part and will refund the corresponding amount in full, without
        further liability.
      </p>

      <h2>5. Prices and payment</h2>
      <ul>
        <li>Prices are shown in Swiss francs (CHF).</li>
        <li>
          {e.vatNumber
            ? "Prices shown to consumers include Swiss VAT, as required by the Price Indication Ordinance (PBV)."
            : "Vistroom is not yet VAT-registered, so prices do not include Swiss VAT. Once the CHF 100,000 registration threshold is reached, consumer prices will be shown inclusive of VAT as the Price Indication Ordinance (PBV) requires."}
        </li>
        <li>
          Delivery and any installation charges are shown separately at checkout before you commit to the
          order.
        </li>
        <li>
          Payment is processed by Stripe. We never receive or store your full card details. Ownership of goods
          passes to you once payment has been received in full.
        </li>
        <li>
          Orders shipped outside Switzerland may attract import duties or taxes in the destination country.
          Those are payable by you and are not included in the price shown.
        </li>
      </ul>

      <h2>6. Delivery and fulfilment by third parties</h2>
      <p>
        Vistroom operates a dropshipping model: goods are dispatched directly to you by our supply partners
        from their own warehouses, not from stock we hold. We currently ship to{" "}
        {SHIPPING_COUNTRIES.join(", ")}. Delivery estimates shown at checkout are estimates given in good
        faith and are not guaranteed dates.
      </p>
      <p>
        Risk of loss or damage passes to you on delivery. If goods arrive damaged, do not dispose of the
        packaging and tell us within a few days so we can pursue the carrier claim, which is usually
        time-limited.
      </p>

      <h2>7. Defects and warranty</h2>
      <p>
        Your statutory warranty rights under OR Art. 197 ff. apply in full to goods bought through Vistroom.
        The limitation period is two years from delivery (OR Art. 210). Inspect goods on arrival and notify us
        of any defect as soon as you reasonably can — under OR Art. 201 a defect that could have been found on
        inspection and is not reported promptly may be treated as accepted.
      </p>
      <p>
        Where a defect is established we will, at our discretion and in consultation with you, arrange repair,
        replacement, a price reduction, or rescission of the sale.
      </p>

      <h2>8. Returns</h2>
      <p>
        Swiss law does not grant a general right of withdrawal for goods bought online: OR Art. 40a ff. covers
        doorstep and telephone sales, not e-commerce. We nevertheless offer a voluntary return window as a
        contractual promise. The conditions, and the separate position for customers resident in the EU, are
        set out in our <Link href="/legal/returns">Returns Policy</Link>, which forms part of these terms.
      </p>

      <h2>9. Your content and AI-generated images</h2>
      <ul>
        <li>
          Photographs you upload remain yours. You grant us the limited licence needed to run the service:
          storing them, and transmitting them to the AI providers listed in our{" "}
          <Link href="/legal/privacy">Privacy Policy</Link> so a visualisation can be produced.
        </li>
        <li>
          Visualisations generated from your own room photographs are yours to use, including commercially.
        </li>
        <li>
          You must only upload photographs you are entitled to use, and must not upload images of people
          without their knowledge, or anything unlawful.
        </li>
        <li>
          If you choose to publish a design publicly on Vistroom, you grant us a non-exclusive licence to
          display it on the site for inspiration. You can ask us to remove it at any time.
        </li>
      </ul>

      <h2>10. What AI visualisations are, and are not</h2>
      <p>
        A visualisation is an artistic impression, not a survey, a technical drawing, or a guarantee of fit.
        Dimensions, colours, materials and lighting in a generated image are approximations, and AI image
        generation makes mistakes. Always check a product&apos;s stated real-world dimensions against your own
        measurements before buying. We are not liable for a purchase that turns out not to fit or not to match
        your expectations of colour or finish based on a generated image alone.
      </p>

      <h2>11. Acceptable use</h2>
      <p>
        Do not attempt to circumvent credit limits or access controls, scrape the catalogue, overload the
        service with automated requests, resell access to the AI features, or use the service to produce
        unlawful, deceptive or infringing material. We may suspend or close an account that does.
      </p>

      <h2>12. Availability</h2>
      <p>
        We aim to keep Vistroom available and working, but we do not promise uninterrupted service. The site
        depends on third-party AI providers, payment infrastructure and supplier systems that can fail or
        change independently of us. Features described on this site may evolve.
      </p>

      <h2>13. Liability</h2>
      <p>
        We are liable without limitation for damage caused intentionally or by gross negligence, for personal
        injury, and wherever Swiss law does not permit liability to be excluded — including under the Product
        Liability Act (PrHG). Otherwise, and to the extent the law allows, our liability for slight negligence
        is excluded, and any liability is limited to the foreseeable damage typical for this kind of contract.
        We are not liable for indirect or consequential loss, or for lost profit.
      </p>

      <h2>14. Changes to these terms</h2>
      <p>
        We may update these terms. The version in force when you place an order is the version that governs
        that order. Material changes affecting an active subscription will be notified by email before they
        take effect, and you may cancel if you do not accept them.
      </p>

      <h2>15. Governing law and jurisdiction</h2>
      <p>
        These terms are governed by Swiss substantive law, excluding the United Nations Convention on
        Contracts for the International Sale of Goods (CISG) and excluding conflict-of-law rules. The place of
        jurisdiction is{" "}
        {e.address ? `${e.address.city}, ${e.address.canton}` : <PendingDetail label="the registered seat" />}
        .
      </p>
      <p>
        This does not affect the protection of consumers: a consumer may always bring proceedings at their own
        place of residence, and mandatory consumer-protection rules of the country where a consumer is
        habitually resident continue to apply where they cannot be derogated from by agreement.
      </p>

      <h2>16. Contact</h2>
      <p>
        Questions about these terms: <a href={`mailto:${e.email}`}>{e.email}</a>. Full provider details are on
        our <Link href="/legal/imprint">Imprint</Link>.
      </p>
    </LegalPage>
  );
}
