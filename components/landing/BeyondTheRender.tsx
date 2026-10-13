import Link from "next/link";
import {
  Bookmark,
  Camera,
  Eraser,
  History,
  LayoutGrid,
  Move,
  Search,
} from "lucide-react";
import Reveal from "@/components/landing/Reveal";

/**
 * Replaces the previous FEATURES list, which advertised mood-based
 * generation, a dedicated room-intelligence score, shopping bundles and VR/
 * AR — all of which live only in components/studio/Studio.tsx, a component
 * nothing in app/ imports anymore. /studio has redirected straight to
 * /designer since the procedural preview was folded in, so every one of
 * those cards sent a visitor to a page that doesn't have what the card
 * described. "Design with your family" pointed at /designs, which now
 * redirects to /my-rooms — a private collection, not collaboration.
 *
 * Every entry below is a capability actually present in Designer.tsx or
 * its API routes today, checked against the code, not the old copy.
 */
const FEATURES = [
  {
    icon: Eraser,
    title: "Remove what's already there",
    body: "Mark existing furniture for removal — the AI erases it and fills in the space to match your room's own floor, wall and light.",
    href: "/designer",
  },
  {
    icon: Move,
    title: "Move anything you've placed",
    body: "Reposition a confirmed item without starting the room over. One render, same credit.",
    href: "/designer",
  },
  {
    icon: History,
    title: "Full version history",
    body: "Every confirmed edit becomes a version in a scrubbable strip. Jump back to any earlier state in one click.",
    href: "/designer",
  },
  {
    icon: Bookmark,
    title: "Save to your collection",
    body: "Bookmark a render privately and come back to it from any device once you're signed in.",
    href: "/my-rooms",
  },
  {
    icon: LayoutGrid,
    title: "Complete Rooms, ready to shop",
    body: "Browse fully styled rooms with every visible piece priced and added to cart in one click.",
    href: "/looks",
  },
  {
    icon: Camera,
    title: "Extra angles & floor plans",
    body: "Upload more than one photo, or a floor plan, for sharper placement and true-to-scale sizing.",
    href: "/designer",
  },
  {
    icon: Search,
    title: "Sourced beyond the catalog",
    body: "Ask for something specific we don't stock — the assistant searches the open web and shows a real, buyable match elsewhere.",
    href: "/designer",
  },
];

export default function BeyondTheRender() {
  return (
    <section className="border-y border-ink-line/60 bg-ink-soft/50">
      <div className="container-page py-20">
        <Reveal className="mb-10 max-w-2xl">
          <div className="eyebrow mb-3">Beyond the render</div>
          <h2 className="font-display text-4xl leading-tight sm:text-5xl">
            A design platform, not a demo.
          </h2>
          <p className="mt-4 text-cream-dim">
            The parts that make Vistroom feel like a finished product, not a proof of concept.
          </p>
        </Reveal>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map(({ icon: Icon, title, body, href }, i) => (
            <Reveal key={title} delay={(i % 4) * 70}>
              <Link
                href={href}
                className="card group flex h-full flex-col p-5 transition hover:-translate-y-1 hover:border-brass/50"
              >
                <span className="mb-4 flex h-10 w-10 items-center justify-center rounded-full border border-brass/40 bg-brass/10 text-brass">
                  <Icon size={17} />
                </span>
                <div className="font-semibold">{title}</div>
                <p className="mt-1.5 text-xs leading-relaxed text-cream-faint">{body}</p>
              </Link>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
