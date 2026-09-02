import type { Metadata } from "next";
import Link from "next/link";
import InfoPage, { NotYetBlock } from "@/components/InfoPage";
import { VISTROOM_ENTITY } from "@/lib/legalEntity";

export const metadata: Metadata = {
  title: "Design Journal",
  description: "Notes on interior design, AI rendering and what we're learning building Vistroom.",
};

/**
 * No posts have been written, so this doesn't pretend to be a blog index
 * with fabricated articles. It states what the journal will cover and
 * points at the genuinely useful reading that already exists on the site
 * (the Complete Rooms gallery, the style library).
 */
export default function JournalPage() {
  return (
    <InfoPage
      eyebrow="Design Journal"
      title="Notes from the workshop."
      intro="Writing about what we learn building this — where AI rendering genuinely helps a room, where it fails, and what actually makes a space work. Nothing published yet."
    >
      <h2>What this will cover</h2>
      <ul>
        <li>
          <strong>Room teardowns.</strong> A real room, what&apos;s wrong with it, and the specific changes
          that fix it — with the products and the real cost, not vague advice.
        </li>
        <li>
          <strong>What AI gets wrong.</strong> The failure modes we hit building this: furniture invented out
          of nothing, scale that ignores physics, removals that quietly do nothing. Concrete, with examples.
        </li>
        <li>
          <strong>Buying well.</strong> Where spending more genuinely changes how a room feels, and where it
          demonstrably doesn&apos;t.
        </li>
      </ul>

      <NotYetBlock
        title="No articles yet"
        body={
          <>
            We&apos;d rather publish nothing than pad this page with filler. If you want to be told when the
            first pieces go up, or there&apos;s something you&apos;d want covered, say so — it genuinely
            shapes what gets written first.
          </>
        }
        email={VISTROOM_ENTITY.email}
      />

      <h2>In the meantime</h2>
      <p>
        <Link href="/looks">Complete Rooms</Link> shows finished spaces with every product priced and
        shoppable — the closest thing we have to a worked example.{" "}
        <Link href="/styles">Signature Styles</Link> breaks down the ten design languages we work in, with
        palettes, materials and typical budgets.
      </p>
    </InfoPage>
  );
}
