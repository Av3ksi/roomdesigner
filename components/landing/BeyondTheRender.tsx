import Link from "next/link";
import {
  Glasses,
  Layers,
  LayoutGrid,
  History,
  Sprout,
  Users2,
  Wand2,
} from "lucide-react";
import Reveal from "@/components/landing/Reveal";

const FEATURES = [
  {
    icon: Wand2,
    title: "Mood-based generation",
    body: "Describe a feeling — “moody dinner-party energy” — and get a matched style instantly.",
    href: "/studio",
  },
  {
    icon: History,
    title: "Full version history",
    body: "Every edit becomes a scrubbable timeline. Restore any past version in one click.",
    href: "/studio",
  },
  {
    icon: Sprout,
    title: "Room intelligence",
    body: "A sustainability score, energy tips and furniture-compatibility checks for every design.",
    href: "/studio",
  },
  {
    icon: LayoutGrid,
    title: "Inspiration boards",
    body: "Collect products across rooms and styles into named moodboards.",
    href: "/boards",
  },
  {
    icon: Glasses,
    title: "VR & AR walkthroughs",
    body: "Step into your room with a headset, or preview it in AR on your phone.",
    href: "/studio",
  },
  {
    icon: Users2,
    title: "Design with your family",
    body: "Share a link and everyone sees — and can keep customizing — the exact same room.",
    href: "/designs",
  },
  {
    icon: Layers,
    title: "Shopping bundles",
    body: "AI-curated bundles like “Reading Corner”, priced with a built-in discount.",
    href: "/studio",
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
            The parts that make Maison feel like a finished product, not a proof of concept.
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
