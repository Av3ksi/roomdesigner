import Link from "next/link";
import { ArrowRight } from "lucide-react";
import Reveal from "@/components/landing/Reveal";

export default function CTA() {
  return (
    <section className="container-page py-24">
      <Reveal className="relative overflow-hidden rounded-3xl border border-brass/30 bg-gradient-to-br from-ink-panel via-ink-soft to-ink px-8 py-16 text-center sm:px-16">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(600px 260px at 50% 0%, rgba(200,169,110,0.14), transparent 70%)",
          }}
        />
        <div className="eyebrow relative mb-4">One photo away</div>
        <h2 className="font-display relative mx-auto max-w-3xl text-4xl leading-tight text-balance sm:text-6xl">
          The room you&apos;ve been living in is not the room you have to live in.
        </h2>
        <p className="relative mx-auto mt-5 max-w-xl text-cream-dim">
          Upload a photo. Meet your room&apos;s potential in under a minute —
          analysis, concepts and a shopping list included.
        </p>
        <div className="relative mt-9">
          <Link href="/studio" className="btn-primary !px-10 !py-4 !text-base">
            Open the Studio <ArrowRight size={17} />
          </Link>
        </div>
      </Reveal>
    </section>
  );
}
