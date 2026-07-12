import { Camera, ShoppingBag, SlidersHorizontal, Wand2 } from "lucide-react";
import Reveal from "@/components/landing/Reveal";

const STEPS = [
  {
    icon: Camera,
    step: "01",
    title: "Upload",
    tagline: "your room",
    body: "One phone photo from a corner. No measuring tape, no floor plans, no prep — Maison reads the space from what you already have.",
  },
  {
    icon: Wand2,
    step: "02",
    title: "Transform",
    tagline: "with AI",
    body: "Dimensions, light, materials and every piece of furniture mapped in seconds — then three designer-grade concepts appear, built around your room's real proportions.",
  },
  {
    icon: SlidersHorizontal,
    step: "03",
    title: "Customize",
    tagline: "every detail",
    body: "Swap any product, change colors and materials, compare premium against budget, or just tell your AI designer what to change. The room updates instantly.",
  },
  {
    icon: ShoppingBag,
    step: "04",
    title: "Purchase",
    tagline: "instantly",
    body: "Every piece in the render is a real, purchasable product. One click adds the whole look, with delivery and installation scheduled at checkout.",
  },
];

export default function HowItWorks() {
  return (
    <section className="border-y border-ink-line/60 bg-ink-soft/50">
      <div className="container-page py-20">
        <Reveal className="mb-12 max-w-2xl">
          <div className="eyebrow mb-3">How it works</div>
          <h2 className="font-display text-4xl leading-tight sm:text-5xl">
            From photo to purchase in four moves.
          </h2>
        </Reveal>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(({ icon: Icon, step, title, tagline, body }, i) => (
            <Reveal key={step} delay={i * 90}>
              <div className="card relative h-full overflow-hidden p-6">
                <div className="absolute -right-2 -top-4 font-display text-7xl text-ink-line/60">
                  {step}
                </div>
                <span className="relative mb-5 flex h-11 w-11 items-center justify-center rounded-full border border-brass/40 bg-brass/10 text-brass">
                  <Icon size={19} />
                </span>
                <h3 className="relative mb-0.5 text-xl font-semibold">
                  {title} <span className="text-sm font-normal text-cream-faint">{tagline}</span>
                </h3>
                <p className="relative mt-2 text-sm leading-relaxed text-cream-faint">{body}</p>
                {i < STEPS.length - 1 && (
                  <div className="relative mt-4 hidden h-px bg-gradient-to-r from-brass/40 to-transparent lg:block" />
                )}
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
