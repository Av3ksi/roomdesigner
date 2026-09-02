import type { Metadata } from "next";
import Link from "next/link";
import InfoPage from "@/components/InfoPage";
import { VISTROOM_ENTITY } from "@/lib/legalEntity";

export const metadata: Metadata = {
  title: "About",
  description: "Why Vistroom exists: interior design you can actually buy, rendered into the room you already live in.",
};

export default function AboutPage() {
  return (
    <InfoPage
      eyebrow="About"
      title="Design you can actually buy."
      intro="Most interior design inspiration has the same flaw: you fall for a room you can never have. The photograph is a showroom in another country, the furniture is discontinued or bespoke, and nothing in it is a thing you can put in a basket. Vistroom exists to close that gap."
    >
      <h2>The problem we set out to fix</h2>
      <p>
        There are two kinds of interior design tools. Mood boards show you beautiful rooms that aren&apos;t
        yours and products you can&apos;t buy. Floor planners let you buy real products, but only after you
        arrange grey blocks on a grid that looks nothing like your home. Neither answers the question people
        actually have, which is simply: <em>what would this look like in my room, and what would it cost?</em>
      </p>

      <h2>How Vistroom answers it</h2>
      <p>
        You photograph your room. The design assistant reads the space — what&apos;s already there, where the
        light comes from, how the walls recede, what the room is roughly measured at — and proposes real
        products from a live supplier catalogue. When you confirm one, it&apos;s composited into your actual
        photograph, at the product&apos;s real dimensions, matched to your room&apos;s own lighting. Every item
        in the finished image is clickable, priced, and purchasable. Nothing is decorative filler.
      </p>
      <p>
        That last part is the constraint we hold ourselves to most strictly. An image model asked to stage a
        room will happily add a rug, a plant and a picture frame that look wonderful and cannot be bought.
        Vistroom is built to refuse that — if you can see it in your render, you can buy it.
      </p>

      <h2>What we are honest about</h2>
      <ul>
        <li>
          A visualisation is an artistic impression, not a survey. We show real product dimensions alongside
          every render so you can check against your own tape measure.
        </li>
        <li>
          AI image editing makes mistakes. When a render doesn&apos;t match the product it was meant to place,
          or a removal quietly fails, we tell you rather than shipping it silently.
        </li>
        <li>
          We don&apos;t hold stock. Products are dispatched by supply partners, which keeps the catalogue wide
          and prices honest, and which we spell out in our{" "}
          <Link href="/legal/returns">Returns Policy</Link> because it changes how returns work.
        </li>
      </ul>

      <h2>Where we are</h2>
      <p>
        Vistroom is built in Switzerland and is early — small, self-funded, and shipping quickly. There is no
        marketing department behind this page. If something is broken or a design falls short, the person who
        can fix it will read your email.
      </p>
      <p>
        <a href={`mailto:${VISTROOM_ENTITY.email}`}>{VISTROOM_ENTITY.email}</a> ·{" "}
        <Link href="/designer">Try it on your own room</Link>
      </p>
    </InfoPage>
  );
}
