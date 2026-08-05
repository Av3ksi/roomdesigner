import type { Metadata } from "next";
import Link from "next/link";
import InfoPage from "@/components/InfoPage";
import { VISTROOM_ENTITY } from "@/lib/legalEntity";

export const metadata: Metadata = {
  title: "Press",
  description: "Facts, positioning and contact for journalists writing about Vistroom.",
};

/**
 * A working press kit — description, positioning, factual claims a
 * journalist can safely quote — with no fabricated coverage, awards or
 * funding announcements. Everything stated here is verifiable from the
 * product itself.
 */
export default function PressPage() {
  return (
    <InfoPage
      eyebrow="Press"
      title="Press kit."
      intro="Everything on this page is factual and quotable. We have no coverage to list yet, so we're not going to pretend otherwise — but if you're writing about AI in interior design, here's what you need."
    >
      <h2>In one line</h2>
      <p className="rounded-xl border border-ink-line bg-ink-panel p-4 text-cream">
        Vistroom turns a photograph of your own room into a photoreal redesign in which every visible object
        is a real product you can buy.
      </p>

      <h2>In a paragraph</h2>
      <p>
        Vistroom is a Swiss AI interior design service. A customer photographs their room; the system reads
        the space — existing furniture, lighting direction, wall angles, approximate dimensions — and proposes
        real products from a live supplier catalogue. Confirmed items are composited into the customer&apos;s
        actual photograph at the product&apos;s true physical size, and every item in the finished image is
        clickable and purchasable. Fulfilment is handled by dropship supply partners, so the catalogue is
        broad without holding stock.
      </p>

      <h2>What makes it technically different</h2>
      <ul>
        <li>
          <strong>Catalogue-only rendering.</strong> Image models asked to stage a room reliably add
          decorative items that don&apos;t exist as products. Vistroom constrains generation so nothing
          appears in a render that isn&apos;t either already in the customer&apos;s photograph or a real
          catalogue item.
        </li>
        <li>
          <strong>Real-world scale.</strong> Product dimensions and an estimated real-world scale for the
          photographed space are used to size objects, rather than an aesthetic guess. Uploaded floor plans
          are treated as the authoritative measurement source when present.
        </li>
        <li>
          <strong>Self-checking output.</strong> Renders are automatically reviewed to confirm the intended
          product actually appears, and that a requested removal actually removed something. Failures are
          surfaced to the customer rather than shipped silently.
        </li>
      </ul>

      <h2>Company facts</h2>
      <ul>
        <li>Based in Switzerland. Independent and self-funded — no outside investment to announce.</li>
        <li>Ships to Switzerland, Germany, Austria, France and Italy.</li>
        <li>
          Business model: free credits to start, prepaid credit packs, and an optional monthly subscription
          for unlimited renders, plus margin on products sold. See <Link href="/pricing">Pricing</Link>.
        </li>
        <li>Full legal and registration details: <Link href="/legal/imprint">Imprint</Link>.</li>
      </ul>

      <h2>Assets and interviews</h2>
      <p>
        For logo files, product screenshots, or an interview, write to{" "}
        <a href={`mailto:${VISTROOM_ENTITY.email}`}>{VISTROOM_ENTITY.email}</a> with your outlet and deadline.
        We can usually turn a request around within a working day, and we&apos;re happy to walk you through a
        live render rather than send you a curated screenshot.
      </p>
    </InfoPage>
  );
}
