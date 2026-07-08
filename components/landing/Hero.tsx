"use client";

import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import BeforeAfterSlider from "@/components/BeforeAfterSlider";
import RoomScene from "@/components/room/RoomScene";
import { SAMPLE_ROOMS } from "@/lib/rooms";
import { STYLE_MAP } from "@/lib/styles";

export default function Hero() {
  const before = SAMPLE_ROOMS[0].spec;
  const after = STYLE_MAP.japandi.spec;

  return (
    <section className="relative overflow-hidden">
      <div className="container-page grid items-center gap-12 py-16 sm:py-24 lg:grid-cols-2">
        <div className="animate-fade-up">
          <div className="chip mb-6">
            <Sparkles size={12} className="text-brass" />
            AI spatial intelligence · 8 signature styles · shoppable results
          </div>
          <h1 className="font-display text-5xl leading-[1.05] tracking-tight text-balance sm:text-6xl lg:text-7xl">
            Upload your room.
            <br />
            <em className="text-brass-bright">AI redesigns it.</em>
            <br />
            Buy everything.
          </h1>
          <p className="mt-6 max-w-lg text-lg leading-relaxed text-cream-dim">
            One photo. Maison reads the architecture, the light and what you
            own — then hands you designer-grade concepts you can step inside,
            customize and buy down to the last cushion. A professional
            interior designer, available instantly.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link href="/studio" className="btn-primary !px-8 !py-3.5 !text-base">
              Upload my room <ArrowRight size={17} />
            </Link>
            <Link href="/styles" className="btn-ghost !px-8 !py-3.5 !text-base">
              Browse the styles
            </Link>
          </div>
          <div className="mt-10 flex flex-wrap gap-x-10 gap-y-4">
            {[
              ["31s", "median analysis time"],
              ["2.4M", "rooms transformed"],
              ["4.9★", "designer-rated output"],
            ].map(([v, l]) => (
              <div key={l}>
                <div className="font-display text-2xl text-cream">{v}</div>
                <div className="text-xs uppercase tracking-wider text-cream-faint">{l}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="animate-fade-up" style={{ animationDelay: "0.15s" }}>
          <BeforeAfterSlider
            className="aspect-[4/3] shadow-2xl shadow-black/50"
            before={<RoomScene spec={before} dated className="h-full w-full" />}
            after={<RoomScene spec={after} className="h-full w-full" />}
            beforeLabel="Their photo"
            afterLabel="Maison · Japandi"
            initial={46}
          />
          <p className="mt-3 text-center text-xs text-cream-faint">
            Drag the divider — a real Maison transformation of a 1990s living room.
          </p>
        </div>
      </div>
    </section>
  );
}
