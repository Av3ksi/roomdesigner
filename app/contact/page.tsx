import type { Metadata } from "next";
import Link from "next/link";
import InfoPage from "@/components/InfoPage";
import { VISTROOM_ENTITY } from "@/lib/legalEntity";

export const metadata: Metadata = {
  title: "Contact",
  description: "How to reach Vistroom — one inbox, read by the people who build it.",
};

const REASONS: { heading: string; body: string }[] = [
  {
    heading: "An order",
    body: "Delivery questions, something arrived damaged, or you want to return an item. Include your order number and, for damage, photographs of the item and its packaging — carrier claims are time-limited and photographs are usually what decides them.",
  },
  {
    heading: "A render that went wrong",
    body: "A product came out looking like something else, a removal didn't remove anything, or a credit was spent on an image you couldn't use. Tell us what you asked for and what you got, and we'll restore the credit.",
  },
  {
    heading: "Billing and Premium",
    body: "Subscription changes, cancellations, invoices, or a charge you don't recognise. Cancelling is instant from your account page and takes effect at the end of the billing period.",
  },
  {
    heading: "Anything else",
    body: "Partnerships, press, trade enquiries, or feedback on something that annoyed you. All of it lands in the same inbox and gets read.",
  },
];

export default function ContactPage() {
  return (
    <InfoPage
      eyebrow="Contact"
      title="Talk to a person."
      intro="One inbox, monitored by the people who actually build Vistroom. No ticket queue, no chatbot deflecting you before you reach a human."
    >
      <div className="card p-6">
        <div className="text-xs uppercase tracking-wider text-cream-faint">Email</div>
        <a
          href={`mailto:${VISTROOM_ENTITY.email}`}
          className="mt-1 block font-display text-2xl text-brass-bright hover:underline"
        >
          {VISTROOM_ENTITY.email}
        </a>
        <p className="mt-3 text-sm text-cream-dim">
          We aim to reply within two working days, and usually faster. We&apos;re in the Central European
          timezone (CET/CEST).
        </p>
      </div>

      <h2>What to include</h2>
      <p>
        The fastest replies come from messages that already contain what we&apos;d otherwise have to ask for:
      </p>
      {REASONS.map((r) => (
        <div key={r.heading} className="mt-4 border-l-2 border-ink-line pl-4">
          <div className="text-sm font-semibold text-cream">{r.heading}</div>
          <p className="mt-1 text-sm">{r.body}</p>
        </div>
      ))}

      <h2>Data and privacy requests</h2>
      <p>
        Requests for access to your data, correction, or deletion under the Swiss FADP go to the same address
        and are handled personally. See our <Link href="/legal/privacy">Privacy Policy</Link> for what we hold
        and how long we keep it.
      </p>

      <h2>Postal address</h2>
      <p>
        Our registered address and full company details are published on the{" "}
        <Link href="/legal/imprint">Imprint</Link>. Please don&apos;t post returns to that address — returns
        travel to a supply partner&apos;s warehouse, so always request a returns reference first (
        <Link href="/legal/returns">how returns work</Link>).
      </p>
    </InfoPage>
  );
}
