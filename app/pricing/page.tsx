import type { Metadata } from "next";
import PricingSection from "@/components/landing/PricingSection";
import CTA from "@/components/landing/CTA";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "A professional interior designer on retainer, for less than lunch. Free to start.",
};

const FAQ = [
  {
    q: "Do I need to measure anything?",
    a: "No. Maison estimates dimensions from visual cues in your photo — door heights, floorboard widths, furniture scale — the way a surveyor would eyeball a room, but faster and in metric.",
  },
  {
    q: "Are the products in the renders real?",
    a: "Yes. Every piece placed in a design maps to a purchasable product from a vetted retail partner. You can swap or remove anything before adding the look to your list.",
  },
  {
    q: "What makes a good photo?",
    a: "Stand in a corner, hold the phone at chest height, capture as much of the room as possible in one frame. Daylight helps. One photo is enough; more angles improve dimension accuracy.",
  },
  {
    q: "Can I use my existing furniture?",
    a: "Maison's analysis gives every detected piece a keep / replace verdict, and concepts respect the keepers. Full keep-item placement lands with the next release.",
  },
];

export default function PricingPage() {
  return (
    <div>
      <PricingSection />
      <section className="container-page py-16">
        <h2 className="font-display mb-8 text-3xl">Questions, answered.</h2>
        <div className="grid gap-5 md:grid-cols-2">
          {FAQ.map((f) => (
            <div key={f.q} className="card p-6">
              <h3 className="font-semibold">{f.q}</h3>
              <p className="mt-2 text-sm leading-relaxed text-cream-faint">{f.a}</p>
            </div>
          ))}
        </div>
      </section>
      <CTA />
    </div>
  );
}
