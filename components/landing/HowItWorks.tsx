import { Camera, ScanSearch, ShoppingBag, Wand2 } from "lucide-react";

const STEPS = [
  {
    icon: Camera,
    step: "01",
    title: "Photograph the room",
    body: "One phone photo from a corner. No measuring tape, no floor plans, no prep.",
  },
  {
    icon: ScanSearch,
    step: "02",
    title: "AI reads the space",
    body: "Dimensions, walls, windows, doors, flooring, lighting, materials, colors and every piece of furniture — mapped in seconds.",
  },
  {
    icon: Wand2,
    step: "03",
    title: "Three concepts appear",
    body: "Designer-grade schemes in your chosen style, composed around your room's real light and proportions. Compare, remix, recolor.",
  },
  {
    icon: ShoppingBag,
    step: "04",
    title: "Buy the room",
    body: "Every piece in the render is a real product. One click adds the whole look — swap or drop anything before checkout.",
  },
];

export default function HowItWorks() {
  return (
    <section className="border-y border-ink-line/60 bg-ink-soft/50">
      <div className="container-page py-20">
        <div className="mb-12 max-w-2xl">
          <div className="eyebrow mb-3">How it works</div>
          <h2 className="font-display text-4xl leading-tight sm:text-5xl">
            From photo to purchase in four moves.
          </h2>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(({ icon: Icon, step, title, body }) => (
            <div key={step} className="card relative overflow-hidden p-6">
              <div className="absolute -right-2 -top-4 font-display text-7xl text-ink-line/60">
                {step}
              </div>
              <span className="relative mb-5 flex h-11 w-11 items-center justify-center rounded-full border border-brass/40 bg-brass/10 text-brass">
                <Icon size={19} />
              </span>
              <h3 className="relative mb-2 text-lg font-semibold">{title}</h3>
              <p className="relative text-sm leading-relaxed text-cream-faint">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
