import Link from "next/link";
import { ArrowRight } from "lucide-react";
import Reveal from "@/components/landing/Reveal";
import RoomScene from "@/components/room/RoomScene";
import { STYLES } from "@/lib/styles";

export default function StyleShowcase() {
  return (
    <section className="border-y border-ink-line/60 bg-ink-soft/50">
      <div className="container-page py-20">
        <Reveal className="mb-10 flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-2xl">
            <div className="eyebrow mb-3">Signature styles</div>
            <h2 className="font-display text-4xl leading-tight sm:text-5xl">
              Ten directions. Infinite rooms.
            </h2>
            <p className="mt-4 text-cream-dim">
              Every style is a complete design language — palette, materials,
              silhouettes, lighting logic — applied to <em>your</em> room, not
              a template.
            </p>
          </div>
          <Link href="/styles" className="btn-ghost">
            Explore all styles <ArrowRight size={15} />
          </Link>
        </Reveal>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {STYLES.map((style, i) => (
            <Reveal key={style.id} delay={(i % 4) * 70}>
              <Link
                href="/studio"
                className="card group overflow-hidden transition hover:-translate-y-1 hover:border-brass/60"
              >
                <div className="aspect-[3/2] overflow-hidden">
                  <RoomScene
                    spec={style.spec}
                    className="h-full w-full transition duration-500 group-hover:scale-105"
                  />
                </div>
                <div className="flex items-center justify-between p-4">
                  <div>
                    <div className="font-semibold">{style.name}</div>
                    <div className="text-xs text-cream-faint">{style.tagline}</div>
                  </div>
                  <div className="flex gap-1">
                    {style.palette.slice(0, 3).map((c) => (
                      <span
                        key={c}
                        className="h-3 w-3 rounded-full border border-black/30"
                        style={{ background: c }}
                      />
                    ))}
                  </div>
                </div>
              </Link>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
