import Link from "next/link";
import { Check } from "lucide-react";

export const PLANS = [
  {
    name: "Atelier Free",
    price: "CHF 0",
    period: "forever",
    blurb: "Feel the magic on your own room.",
    features: [
      "3 room designs per month",
      "All 8 signature styles",
      "Full spatial analysis",
      "Shoppable product lists",
    ],
    cta: "Start free",
    featured: false,
  },
  {
    name: "Maison Plus",
    price: "CHF 19",
    period: "per month",
    blurb: "For a whole home, room by room.",
    features: [
      "Unlimited room designs",
      "3 concepts per generation",
      "Accent & product customization",
      "Saved projects & mood boards",
      "Priority rendering queue",
    ],
    cta: "Go Plus",
    featured: true,
  },
  {
    name: "Maison Pro",
    price: "CHF 79",
    period: "per month",
    blurb: "For designers, stagers and realtors.",
    features: [
      "Everything in Plus",
      "Client workspaces & sharing",
      "Brand-free exports, 4K renders",
      "Trade pricing on marketplace",
      "API access",
    ],
    cta: "Talk to sales",
    featured: false,
  },
];

export default function PricingSection() {
  return (
    <section className="border-t border-ink-line/60 bg-ink-soft/50">
      <div className="container-page py-20">
        <div className="mb-12 max-w-2xl">
          <div className="eyebrow mb-3">Pricing</div>
          <h2 className="font-display text-4xl leading-tight sm:text-5xl">
            A designer on retainer, for less than lunch.
          </h2>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {PLANS.map((p) => (
            <div
              key={p.name}
              className={`card relative flex flex-col p-7 ${
                p.featured ? "border-brass/70 shadow-[0_0_60px_-18px_rgba(200,169,110,0.45)]" : ""
              }`}
            >
              {p.featured && (
                <span className="absolute -top-3 left-6 rounded-full bg-brass px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-ink">
                  Most loved
                </span>
              )}
              <div className="text-sm font-semibold text-cream-dim">{p.name}</div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="font-display text-5xl text-cream">{p.price}</span>
                <span className="text-xs uppercase tracking-wider text-cream-faint">
                  {p.period}
                </span>
              </div>
              <p className="mt-2 text-sm text-cream-faint">{p.blurb}</p>
              <ul className="mt-6 flex-1 space-y-2.5">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-cream-dim">
                    <Check size={15} className="mt-0.5 shrink-0 text-brass" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href="/studio"
                className={`${p.featured ? "btn-primary" : "btn-ghost"} mt-7 w-full justify-center`}
              >
                {p.cta}
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
