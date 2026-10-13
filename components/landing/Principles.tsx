import { Ruler, ShoppingBag, ShieldCheck } from "lucide-react";

/**
 * Replaces the former Testimonials section, which carried three invented
 * customers (names, cities, quoted claims) under a fabricated "2.4 million
 * rooms" headline. On a pre-launch product with no customers, that is
 * misleading advertising under UWG Art. 3 — the same act our own Imprint
 * cites — and it directly contradicted the /press page stating we have no
 * coverage to show yet.
 *
 * Social proof we haven't earned is replaced with product proof we can
 * stand behind: three claims that are true today and verifiable by using
 * the thing. Restore a testimonials section when there are real customers
 * who have really said something, quoted with their permission.
 */
const PRINCIPLES = [
  {
    icon: ShoppingBag,
    title: "Everything you see is for sale",
    body:
      "Most AI room tools generate beautiful furniture that doesn't exist. Ours is constrained to the catalogue: if an object appears in your render, it has a price, a supplier and a buy button. Renders are checked automatically for invented objects, and we tell you when one slips through.",
  },
  {
    icon: Ruler,
    title: "Sized to your actual room",
    body:
      "Products are placed at their real physical dimensions, calibrated against what the photograph already shows — door heights, worktops, floorboards. Upload a floor plan and its printed measurements become the reference. The point is that a sofa that looks like it fits, fits.",
  },
  {
    icon: ShieldCheck,
    title: "Honest about what AI can't do",
    body:
      "A visualisation is an artistic impression, not a survey. When a render doesn't match the product it was meant to place, or a removal quietly fails, we flag it instead of shipping it silently — and we show real dimensions next to every proposal so you can check against your own tape measure.",
  },
];

export default function Principles() {
  return (
    <section className="container-page py-20">
      <div className="mb-12 max-w-2xl">
        <div className="eyebrow mb-3">How this is different</div>
        <h2 className="font-display text-4xl leading-tight sm:text-5xl">
          Renders you can actually order from.
        </h2>
      </div>
      <div className="grid gap-6 md:grid-cols-3">
        {PRINCIPLES.map(({ icon: Icon, title, body }) => (
          <div key={title} className="card flex flex-col p-7">
            <span className="flex h-11 w-11 items-center justify-center rounded-full border border-brass/40 bg-brass/10 text-brass">
              <Icon size={19} />
            </span>
            <h3 className="mt-5 font-display text-xl leading-snug text-cream">{title}</h3>
            <p className="mt-3 text-sm leading-relaxed text-cream-dim">{body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
