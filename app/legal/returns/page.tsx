import type { Metadata } from "next";
import Link from "next/link";
import LegalPage from "@/components/LegalPage";
import { SHIPPING_COUNTRIES, VISTROOM_ENTITY } from "@/lib/legalEntity";

export const metadata: Metadata = { title: "Returns Policy" };

/** Voluntary return window offered on top of Swiss statutory warranty. Days rather than a hardcoded string so the number is stated identically everywhere it appears. */
const RETURN_WINDOW_DAYS = 30;
const EU_WITHDRAWAL_DAYS = 14;

/**
 * The legally interesting page of the four, for two reasons:
 *
 *  1. Switzerland has no statutory cooling-off period for online orders
 *     (OR Art. 40a ff. covers doorstep and telephone sales only). A
 *     Swiss shop's return window is a voluntary contractual promise. EU
 *     templates that talk about "your 14-day right of withdrawal" are
 *     simply wrong for a Swiss seller — and describing a voluntary policy
 *     as a legal right creates an obligation that's then hard to narrow.
 *  2. Because this store ships to Germany, Austria, France and Italy,
 *     Directive 2011/83/EU very likely DOES give those customers a real
 *     14-day withdrawal right. Both positions are stated separately rather
 *     than averaged into one misleading paragraph.
 *
 * Dropshipping is disclosed explicitly throughout: goods return to a
 * supplier's warehouse abroad, not to us, which is why we ask customers to
 * request a return rather than post something back on their own initiative.
 */
export default function ReturnsPage() {
  const e = VISTROOM_ENTITY;

  return (
    <LegalPage title="Returns Policy" lastUpdated="6 August 2026">
      <p>
        How to send something back, what we refund, and how that works when the goods were shipped to you
        directly by one of our supply partners rather than from our own warehouse.
      </p>

      <h2>How fulfilment works, and why it matters here</h2>
      <p>
        Vistroom does not hold stock. When you order, the goods are dispatched to you directly by a supply
        partner from their own warehouse — currently in the Netherlands and elsewhere in the EU. This keeps
        the catalogue broad and prices competitive, but it has one real consequence for returns: goods travel
        back to a supplier&apos;s facility abroad, not to a Swiss address. Please always request a return from
        us first and wait for instructions. A parcel sent back unannounced can arrive at a warehouse that
        cannot match it to an order, and we may not be able to refund it.
      </p>

      <h2>Our {RETURN_WINDOW_DAYS}-day return promise</h2>
      <p>
        Swiss law does not give buyers a general right to cancel an online purchase after the event — the
        cooling-off rules in Art. 40a ff. of the Code of Obligations apply to doorstep and telephone sales,
        not to e-commerce. We nevertheless offer a voluntary {RETURN_WINDOW_DAYS}-day return window, because
        buying furniture you have only seen in a visualisation should not be a one-way door. This is a
        contractual promise we make to you, and these are its conditions:
      </p>
      <ul>
        <li>
          Tell us within {RETURN_WINDOW_DAYS} days of delivery that you want to return an item, by emailing{" "}
          <a href={`mailto:${e.email}`}>{e.email}</a> with your order number.
        </li>
        <li>
          The item must be unused, undamaged and complete, in its original packaging. Furniture that has been
          assembled, modified, or installed cannot be returned under this promise.
        </li>
        <li>
          We will confirm the return address and give you a returns reference before you send anything.
        </li>
        <li>
          Once the supplier receives and checks the item, we refund the purchase price to your original
          payment method, normally within 14 days of the goods arriving back.
        </li>
      </ul>

      <h2>Who pays for return shipping</h2>
      <ul>
        <li>
          <strong>If the item is faulty, damaged in transit, or not what you ordered</strong> — we cover
          return shipping in full, and you are entitled to a repair, replacement or refund. Do not pay to send
          it back yourself; contact us and we will arrange it.
        </li>
        <li>
          <strong>If you simply changed your mind</strong> — return shipping is at your cost, and cross-border
          furniture returns can be expensive. We will always tell you the likely cost before you commit, so
          you can decide with the real number in front of you.
        </li>
      </ul>

      <h2>Items we cannot take back</h2>
      <ul>
        <li>Goods made or configured to your specification.</li>
        <li>Assembled or installed furniture, and items showing use beyond what is needed to inspect them.</li>
        <li>Items returned without a returns reference agreed with us in advance.</li>
        <li>
          Products marked as &ldquo;sourced from another retailer&rdquo;. Those are bought from that retailer
          directly, not from us, so their returns policy applies and we have no ability to refund them.
        </li>
      </ul>

      <h2>Faulty goods: your statutory rights</h2>
      <p>
        Separate from the voluntary window above, you have statutory warranty rights under Art. 197 ff. of the
        Swiss Code of Obligations, with a two-year limitation period from delivery (Art. 210). Nothing in this
        policy limits them. Please inspect goods when they arrive and report any defect promptly — under Art.
        201, a defect that inspection would have revealed and that is not reported without delay can be
        treated as accepted.
      </p>
      <p>
        If something arrives damaged, photograph the item and its packaging before unpacking further and send
        us the photographs. Carrier claims are strictly time-limited, and photographs are usually what decides
        them.
      </p>

      <h2>If you are ordering from the EU</h2>
      <p>
        We ship to {SHIPPING_COUNTRIES.join(", ")}. If you are a consumer resident in an EU member state, EU
        consumer law (Directive 2011/83/EU) is likely to give you a statutory right to withdraw from a
        distance purchase within {EU_WITHDRAWAL_DAYS} days of receiving the goods, without giving a reason —
        a genuine legal right, in addition to the voluntary promise described above, and one we will honour on
        request. Where our voluntary policy is more generous than your statutory right, you may rely on
        whichever is better for you.
      </p>

      <h2>Cancelling before dispatch</h2>
      <p>
        If you contact us before the supplier has dispatched your order, we will cancel it and refund you in
        full. Dropship orders are often passed to the supplier within hours, so please write as soon as you
        can — once goods are in transit, the return process above applies instead.
      </p>

      <h2>Credits and Premium</h2>
      <p>
        This policy covers physical goods. Credits spent on AI renders that were actually produced are not
        refundable, and Premium is cancellable at any time with effect from the end of the current billing
        period. If a render failed technically and produced nothing usable, tell us and we will restore the
        credit — see our <Link href="/legal/terms">Terms of Service</Link>.
      </p>

      <h2>Contact</h2>
      <p>
        Returns, damage reports and cancellations: <a href={`mailto:${e.email}`}>{e.email}</a>. Include your
        order number and, for damage, photographs. We aim to reply within two working days.
      </p>
    </LegalPage>
  );
}
