import type { Metadata } from "next";
import Link from "next/link";
import LegalPage from "@/components/LegalPage";
import PendingDetail from "@/components/PendingDetail";
import { DATA_PROCESSORS, VISTROOM_ENTITY } from "@/lib/legalEntity";

export const metadata: Metadata = { title: "Privacy Policy" };

/**
 * Written against the revised Swiss Federal Act on Data Protection (FADP /
 * nDSG), in force since 1 September 2023. Structure follows the Art. 19
 * information duty: who the controller is, what is collected, for what
 * purpose, who receives it, and — the part most often skipped — which
 * countries it goes to and on what legal basis (Art. 16-17).
 *
 * The cross-border section is the substantive risk area for this app: every
 * AI provider it depends on is in the United States, and a room photograph
 * is personal data whenever a home is identifiable. See DATA_PROCESSORS in
 * lib/legalEntity.ts — adding a vendor to the app means adding it there.
 */
export default function PrivacyPage() {
  const e = VISTROOM_ENTITY;

  return (
    <LegalPage title="Privacy Policy" lastUpdated="6 August 2026">
      <p>
        This policy explains what personal data Vistroom collects, why, who it is shared with, and what rights
        you have over it. It is written to meet the information duty under Art. 19 of the revised Swiss
        Federal Act on Data Protection (FADP), in force since 1 September 2023.
      </p>

      <h2>1. Who is responsible</h2>
      <p>
        The controller for the processing described here is{" "}
        {e.legalName ?? <PendingDetail label="the registered operator" />}, operator of Vistroom. Contact:{" "}
        <a href={`mailto:${e.email}`}>{e.email}</a>. Full details are on our{" "}
        <Link href="/legal/imprint">Imprint</Link>. We have not appointed a data protection officer, which the
        FADP does not require for an organisation of this size.
      </p>

      <h2>2. What we collect</h2>
      <ul>
        <li>
          <strong>Photographs of your room.</strong> The images you upload, plus any additional angles and
          floor plans. These are the core of the service. Treat them as personal data: an interior can
          identify a household, and may incidentally capture people, documents or possessions.
        </li>
        <li>
          <strong>Design activity.</strong> Your conversation with the design assistant, the products you are
          shown and choose, generated visualisations, saved rooms and collections.
        </li>
        <li>
          <strong>Account data.</strong> Your email address. If you use a password rather than a sign-in link,
          a cryptographic hash of it — never the password itself.
        </li>
        <li>
          <strong>Order data.</strong> Delivery name and address, order contents, delivery and installation
          choices, and payment status. Card numbers are handled entirely by Stripe and never reach our
          servers.
        </li>
        <li>
          <strong>Usage and technical data.</strong> A session identifier stored in a cookie, your credit
          balance and its transaction history, and server logs containing IP address and request metadata,
          which we use for security and abuse prevention.
        </li>
      </ul>

      <h2>3. Why we process it, and on what basis</h2>
      <p>
        Under the FADP, processing personal data does not require consent by default; it must be lawful,
        proportionate, carried out in good faith, and recognisable. We process:
      </p>
      <ul>
        <li>
          <strong>To perform the contract with you</strong> — producing visualisations, running your account,
          taking payment, and getting an order to your door.
        </li>
        <li>
          <strong>For our legitimate interests</strong> — keeping the service secure, preventing abuse of free
          credits, and diagnosing faults.
        </li>
        <li>
          <strong>To meet legal obligations</strong> — principally retaining accounting records for orders.
        </li>
        <li>
          <strong>With your consent</strong> — only where you actively opt in, such as publishing a design
          publicly. You may withdraw consent at any time.
        </li>
      </ul>
      <p>
        We do not sell personal data. We do not carry out automated individual decision-making that produces
        legal effects for you. We do not use your photographs to train AI models, and we do not permit our
        providers to (see clause 5).
      </p>

      <h2>4. Cookies and local storage</h2>
      <p>
        We use a small number of strictly functional cookies and browser storage entries: a session identifier
        that ties your credits and rooms to your browser, a sign-in cookie once you log in, and local storage
        holding your cart, wishlist and collections. These are necessary for the service to function and carry
        no advertising or cross-site tracking. We run no third-party advertising or analytics trackers.
      </p>

      <h2>5. Who receives your data, and where</h2>
      <p>
        Producing a visualisation necessarily means sending your room photograph to an AI provider, and
        fulfilling an order means sending a delivery address to a supplier. These are the recipients:
      </p>
      <div className="my-4 overflow-x-auto rounded-xl border border-ink-line">
        <table className="w-full text-left text-xs">
          <thead className="bg-ink-panel text-cream-faint">
            <tr>
              <th className="px-3 py-2 font-semibold">Recipient</th>
              <th className="px-3 py-2 font-semibold">Purpose</th>
              <th className="px-3 py-2 font-semibold">Location</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-line/60">
            {DATA_PROCESSORS.map((p) => (
              <tr key={p.name}>
                <td className="px-3 py-2 text-cream">{p.name}</td>
                <td className="px-3 py-2">{p.purpose}</td>
                <td className="px-3 py-2 whitespace-nowrap">{p.country}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        Each acts as our processor, under contract, permitted to use the data only to provide their service to
        us.
      </p>

      <h2>6. Transfers outside Switzerland</h2>
      <p>
        Several of the providers above are established in the United States, so your data — including room
        photographs — is transferred abroad. Under Art. 16–17 FADP this requires either a country the Federal
        Council recognises as offering adequate protection, or appropriate safeguards.
      </p>
      <ul>
        <li>
          <strong>EU/EEA recipients</strong> (fulfilment in the Netherlands, EU-region database hosting) are
          in countries recognised by the Federal Council as providing adequate protection. No further
          safeguard is needed.
        </li>
        <li>
          <strong>United States recipients</strong> are covered either by certification under the
          Swiss–U.S. Data Privacy Framework, which the Federal Council recognised as adequate with effect from
          15 September 2024, or, where a provider is not certified, by the European Commission&apos;s Standard
          Contractual Clauses as recognised by the Swiss FDPIC.
        </li>
      </ul>
      <p>
        You should know that data held in the United States may in principle be subject to access by US
        authorities under legislation that has no direct Swiss equivalent, and that this risk cannot be fully
        eliminated by contract. If you would prefer not to have images of your home processed abroad, please
        do not upload them — the service cannot be provided without that transfer.
      </p>

      <h2>7. How long we keep it</h2>
      <ul>
        <li>Room photographs, designs and conversations: until you delete them or close your account.</li>
        <li>
          Account records: for as long as the account exists, then removed within a reasonable period after
          closure.
        </li>
        <li>
          Order and accounting records: ten years, as required by Art. 958f of the Swiss Code of Obligations.
          These we cannot delete on request until that period expires.
        </li>
        <li>Server logs: a short rolling window, retained only for security purposes.</li>
      </ul>

      <h2>8. Security</h2>
      <p>
        Data is transmitted over encrypted connections and stored on access-controlled infrastructure.
        Passwords, where used, are stored only as salted hashes. No system is perfectly secure; if a breach
        occurs that presents a high risk to your rights, we will notify the Federal Data Protection and
        Information Commissioner (FDPIC) as soon as possible under Art. 24 FADP, and inform you where required.
      </p>

      <h2>9. Your rights</h2>
      <p>Under the FADP you may:</p>
      <ul>
        <li>Request access to the personal data we hold about you (Art. 25), normally free of charge;</li>
        <li>Have inaccurate data corrected (Art. 32);</li>
        <li>Request deletion, subject to the retention obligations in clause 7;</li>
        <li>Object to processing based on our legitimate interests;</li>
        <li>Request your data in a portable format where it was provided by you;</li>
        <li>Withdraw any consent you have given, without affecting processing already carried out.</li>
      </ul>
      <p>
        Write to <a href={`mailto:${e.email}`}>{e.email}</a> to exercise any of these. We may need to verify
        your identity first. If you are not satisfied with our response you may lodge a complaint with the
        FDPIC in Bern. Customers resident in the EU may also have rights under the GDPR and may complain to
        their national supervisory authority.
      </p>

      <h2>10. Children</h2>
      <p>
        Vistroom is not directed at children and is not intended for use by anyone under 16. We do not
        knowingly collect their data; contact us if you believe a child has provided us with personal data.
      </p>

      <h2>11. Changes</h2>
      <p>
        We will update this policy when our processing changes — notably if we add or replace an AI or
        fulfilment provider. The date above always reflects the current version.
      </p>
    </LegalPage>
  );
}
