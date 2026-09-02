import type { Metadata } from "next";
import LegalPage from "@/components/LegalPage";
import PendingDetail from "@/components/PendingDetail";
import { VISTROOM_ENTITY } from "@/lib/legalEntity";

export const metadata: Metadata = { title: "Imprint" };

/**
 * Swiss law has no blanket "Impressum" duty of the German TMG kind, but
 * UWG Art. 3 para. 1 lit. s does require anyone selling online to state
 * their identity and contact details — including a postal address and a
 * working email address — clearly and accessibly. That's what this page
 * discharges. Every field comes from lib/legalEntity.ts; the ones that
 * aren't registered yet render as visible to-dos rather than fake data.
 */
export default function ImprintPage() {
  const e = VISTROOM_ENTITY;

  return (
    <LegalPage title="Imprint" lastUpdated="6 August 2026">
      <p>
        Information on the provider of this website, published in accordance with Art. 3 para. 1 lit. s of the
        Swiss Federal Act against Unfair Competition (UWG), which requires online sellers to state their
        identity and contact details clearly, completely and accessibly.
      </p>

      <h2>Provider</h2>
      <ul>
        <li>Trade name: {e.tradeName}</li>
        <li>Legal entity: {e.legalName ?? <PendingDetail label="Registered legal name" />}</li>
        <li>
          Registered address:{" "}
          {e.address ? (
            `${e.address.street}, ${e.address.postalCode} ${e.address.city}, ${e.address.canton}, ${e.address.country}`
          ) : (
            <PendingDetail label="Postal address" />
          )}
        </li>
      </ul>

      <h2>Contact</h2>
      <ul>
        <li>
          Email: <a href={`mailto:${e.email}`}>{e.email}</a>
        </li>
        <li>Telephone: {e.phone ?? <PendingDetail label="Telephone number" />}</li>
      </ul>
      <p>
        Email is our primary support channel and the fastest way to reach a person. We aim to answer within
        two working days.
      </p>

      <h2>Commercial register and VAT</h2>
      <ul>
        <li>Business identification number (UID): {e.uid ?? <PendingDetail label="CHE-xxx.xxx.xxx" />}</li>
        <li>VAT number: {e.vatNumber ?? <PendingDetail label="VAT registration" />}</li>
      </ul>
      <p>
        Vistroom is in the process of being formally registered. Until that is complete, no UID or VAT number
        exists to publish, and we deliberately show nothing here rather than a placeholder that could be
        mistaken for a real registration. Both will appear on this page as soon as they are issued. Swiss VAT
        registration becomes compulsory once annual turnover exceeds CHF 100,000; below that threshold, prices
        shown on this site do not include Swiss VAT.
      </p>

      <h2>Responsible for content</h2>
      <p>{e.responsibleForContent ?? <PendingDetail label="Name of the responsible person" />}</p>

      <h2>Dispute resolution</h2>
      <p>
        We are not currently affiliated with any consumer arbitration body, and Switzerland does not operate an
        equivalent to the EU&apos;s Online Dispute Resolution platform. If something has gone wrong with an
        order, contact us directly first — we would far rather fix it than have you escalate it. Customers
        resident in the EU retain any rights they have under their own national consumer legislation to
        approach a competent dispute resolution body.
      </p>

      <h2>Copyright</h2>
      <p>
        The design, text, software and original imagery on this site belong to {e.tradeName}. Product
        photographs and product descriptions belong to their respective suppliers and manufacturers and are
        used to present goods offered for sale. AI-generated room visualisations produced for your own room
        belong to you, subject to the terms set out in our Terms of Service.
      </p>
    </LegalPage>
  );
}
