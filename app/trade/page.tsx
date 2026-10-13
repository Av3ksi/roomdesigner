import type { Metadata } from "next";
import Link from "next/link";
import InfoPage, { NotYetBlock } from "@/components/InfoPage";
import { VISTROOM_ENTITY } from "@/lib/legalEntity";

export const metadata: Metadata = {
  title: "Trade Program",
  description: "For interior designers, stagers and agents — what a Vistroom trade account would need to include.",
};

/**
 * Deliberately does NOT describe a trade programme as though it exists.
 * Trade pricing, client workspaces and multi-seat accounts were removed
 * from the pricing page for the same reason: none of it is built. This
 * page states the intent, is explicit that it's unbuilt, and collects
 * interest — which is also the honest way to find out whether to build it.
 */
export default function TradePage() {
  return (
    <InfoPage
      eyebrow="Trade Program"
      title="For designers, stagers and agents."
      intro="If you specify furniture for other people's homes for a living, your needs are different from a homeowner redoing one room. We haven't built that yet — but we'd rather design it with the people who'd use it than guess."
    >
      <h2>What a trade account would need</h2>
      <p>
        From conversations so far, these are the things that come up. If you work in the trade, tell us which
        of them actually matter and which are noise:
      </p>
      <ul>
        <li>Multiple client projects kept separate, each with its own rooms, revisions and shopping list.</li>
        <li>Volume rendering without counting individual credits.</li>
        <li>Presentation-ready exports without our branding on them.</li>
        <li>Trade pricing on the catalogue, and consolidated invoicing across a project.</li>
        <li>Sharing a design with a client for approval, with comments, without them needing an account.</li>
      </ul>

      <NotYetBlock
        title="Not available yet"
        body={
          <>
            None of the above is built, and we&apos;re not taking trade sign-ups or quoting trade rates. What
            we are doing is talking to designers and stagers about how they actually work. If that&apos;s you,
            a short email describing your workflow is worth more to us than a waiting-list signup — and
            you&apos;ll be the first people we come back to.
          </>
        }
        email={VISTROOM_ENTITY.email}
      />

      <h2>What works today</h2>
      <p>
        The standard product is already useful for a single client room: photograph the space, generate
        options, and hand over a shoppable list with real prices. A{" "}
        <Link href="/pricing">Premium subscription</Link> removes per-render credit limits, which is usually
        the first thing that bites when you&apos;re working at professional volume.
      </p>
    </InfoPage>
  );
}
