import type { Metadata } from "next";
import Link from "next/link";
import InfoPage, { NotYetBlock } from "@/components/InfoPage";
import { VISTROOM_ENTITY } from "@/lib/legalEntity";

export const metadata: Metadata = {
  title: "API",
  description: "There is no public Vistroom API yet. What it would do, and how to register interest.",
};

/**
 * "API access" was previously advertised as a feature of a Pro tier that
 * didn't exist; that tier has been removed from pricing. This page exists
 * because the footer links to it, and it says plainly that no API is
 * available rather than publishing documentation for endpoints nobody can
 * call.
 */
export default function DevelopersPage() {
  return (
    <InfoPage
      eyebrow="API"
      title="No public API yet."
      intro="There's no API to sign up for, no keys to issue and no documentation to read. Rather than publish endpoints nobody can call, here's the honest state of it."
    >
      <h2>What an API would expose</h2>
      <p>
        The interesting primitive isn&apos;t &ldquo;generate an interior design image&rdquo; — plenty of
        services do that. It&apos;s the constrained version: compositing a <em>specific real product</em>,
        at its <em>true physical size</em>, into a <em>customer&apos;s real photograph</em>, without the model
        inventing anything that isn&apos;t for sale. That&apos;s the piece that would be genuinely useful to
        a furniture retailer or a property platform:
      </p>
      <ul>
        <li>Submit a room photograph and receive a structured read of the space — existing items, geometry, approximate dimensions.</li>
        <li>Composite a given product image into a given room at a given position, at real-world scale.</li>
        <li>Verify a render: did the intended product actually appear, and did nothing else get added?</li>
      </ul>

      <NotYetBlock
        title="Not available"
        body={
          <>
            We&apos;re focused on the customer-facing product, and an API is a serious commitment —
            versioning, rate limits, uptime guarantees and support that we&apos;re not in a position to
            promise yet. If you have a concrete integration in mind, describe it and we&apos;ll tell you
            honestly whether and when it&apos;s plausible. A real use case moves this up the list; a general
            enquiry won&apos;t.
          </>
        }
        email={VISTROOM_ENTITY.email}
      />

      <h2>In the meantime</h2>
      <p>
        The full product is usable today at <Link href="/designer">the Designer</Link>, and{" "}
        <Link href="/pricing">Premium</Link> removes per-render limits if you&apos;re testing at volume by
        hand.
      </p>
    </InfoPage>
  );
}
