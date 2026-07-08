import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import RoomScene from "@/components/room/RoomScene";
import { makeVariantSpec, STYLES, VARIANT_NAMES } from "@/lib/styles";

export const metadata: Metadata = {
  title: "Signature Styles",
  description:
    "Eight complete design languages — from Japandi to Art Deco Revival — each applied to your real room.",
};

export default function StylesPage() {
  return (
    <div className="container-page py-14">
      <div className="max-w-2xl">
        <div className="eyebrow mb-3">Signature styles</div>
        <h1 className="font-display text-4xl leading-tight sm:text-5xl">
          Not filters. Design languages.
        </h1>
        <p className="mt-4 text-cream-dim">
          Each Maison style is a complete system — palette, materials,
          silhouettes, lighting logic and a curated product universe. Below,
          every style rendered in its three concept variants.
        </p>
      </div>

      <div className="mt-12 space-y-16">
        {STYLES.map((style, idx) => (
          <section
            key={style.id}
            className="grid gap-8 border-t border-ink-line/60 pt-12 lg:grid-cols-[1fr_1.6fr]"
          >
            <div>
              <div className="text-xs text-cream-faint">
                {String(idx + 1).padStart(2, "0")} / {String(STYLES.length).padStart(2, "0")}
              </div>
              <h2 className="mt-2 font-display text-3xl">{style.name}</h2>
              <p className="mt-1 text-sm italic text-brass-bright">{style.tagline}</p>
              <p className="mt-4 max-w-md text-sm leading-relaxed text-cream-dim">
                {style.description}
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                {style.tags.map((t) => (
                  <span key={t} className="chip">{t}</span>
                ))}
              </div>
              <div className="mt-5 flex items-center gap-3">
                <div className="flex gap-1.5">
                  {style.palette.map((c) => (
                    <span
                      key={c}
                      className="h-6 w-6 rounded-full border border-black/40"
                      style={{ background: c }}
                    />
                  ))}
                </div>
                <span className="text-xs text-cream-faint">
                  Typical room budget {style.budgetBand}
                </span>
              </div>
              <Link href="/studio" className="btn-ghost mt-7">
                Design my room in {style.name} <ArrowRight size={14} />
              </Link>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              {[0, 1, 2].map((v) => (
                <div key={v} className="card overflow-hidden">
                  <div className="aspect-[3/2.6] overflow-hidden">
                    <RoomScene
                      spec={makeVariantSpec(style.spec, v)}
                      variant={v}
                      className="h-full w-full"
                    />
                  </div>
                  <div className="px-3 py-2.5 text-xs text-cream-faint">
                    Concept {v + 1} · {VARIANT_NAMES[v]}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
