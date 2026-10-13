import type { Metadata } from "next";
import Link from "next/link";
import InfoPage from "@/components/InfoPage";
import { VISTROOM_ENTITY } from "@/lib/legalEntity";

export const metadata: Metadata = {
  title: "Careers",
  description: "Vistroom isn't hiring yet. Here's what we're building and how to be first to know when that changes.",
};

/**
 * Deliberately lean and honest: there is no team, no open roles, and no
 * hiring process. Inventing "our culture" copy or fake openings for a
 * company of this size would misrepresent it — see the /trade and
 * /developers pages for the same approach to programmes that don't exist
 * yet.
 */
export default function CareersPage() {
  return (
    <InfoPage
      eyebrow="Careers"
      title="We're not hiring yet."
      intro="Vistroom is very small and self-funded. There's no open role to apply for right now, and we'd rather say that plainly than run a careers page full of values statements for a team that doesn't exist."
    >
      <h2>What we're building</h2>
      <p>
        An AI interior design tool where everything you see in a render is a real product you can buy. That
        means work across three fairly distinct problems: image generation that respects real-world geometry
        and refuses to invent furniture, a live supplier catalogue with dimensions and stock you can trust,
        and commerce that holds up under Swiss and EU consumer law.
      </p>

      <h2>When that changes</h2>
      <p>
        The first hires will most likely be in machine learning for image compositing, and in supply and
        merchandising. When there is a real role with a real budget behind it, it will be posted here — not
        before.
      </p>

      <h2>If you want to be early</h2>
      <p>
        Write to <a href={`mailto:${VISTROOM_ENTITY.email}`}>{VISTROOM_ENTITY.email}</a> with what you do and
        what you&apos;d want to work on. Speculative notes are genuinely welcome, and are read by the person
        who would end up hiring. Something specific about the product — a render that failed, a detail you
        think is wrong — will get a better response than a generic CV.
      </p>
      <p>
        <Link href="/about">More about why Vistroom exists</Link>
      </p>
    </InfoPage>
  );
}
