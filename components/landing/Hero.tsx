"use client";

import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import BeforeAfterSlider from "@/components/BeforeAfterSlider";
import RoomScene from "@/components/room/RoomScene";
import { SAMPLE_ROOMS } from "@/lib/rooms";
import { STYLES } from "@/lib/styles";

const CYCLE_STYLES = ["japandi", "darkluxury", "scandinavian", "mediterranean"];

const JOURNEY = [
  { word: "Upload", detail: "one photo" },
  { word: "Transform", detail: "with AI" },
  { word: "Customize", detail: "every detail" },
  { word: "Purchase", detail: "instantly" },
];

export default function Hero() {
  const before = SAMPLE_ROOMS[0].spec;
  const [cycleIdx, setCycleIdx] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setCycleIdx((i) => (i + 1) % CYCLE_STYLES.length), 4200);
    return () => clearInterval(t);
  }, []);

  const activeStyleId = CYCLE_STYLES[cycleIdx];
  const activeStyle = STYLES.find((s) => s.id === activeStyleId)!;

  return (
    <section className="relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            "radial-gradient(900px 420px at 15% -10%, rgba(200,169,110,0.14), transparent 65%)",
        }}
      />
      <div className="container-page relative grid items-center gap-12 py-16 sm:py-24 lg:grid-cols-2">
        <div className="animate-fade-up">
          <div className="chip mb-6">
            <Sparkles size={12} className="text-brass" />
            AI spatial intelligence · 10 signature styles · shoppable results
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

          {/* The four-step promise — legible in one glance */}
          <div className="mt-8 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {JOURNEY.map((j, i) => (
              <div
                key={j.word}
                className="animate-fade-up rounded-xl border border-ink-line bg-ink-soft/60 px-3 py-2.5"
                style={{ animationDelay: `${0.25 + i * 0.08}s` }}
              >
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-brass">
                  <span className="font-display text-xs text-brass-bright">0{i + 1}</span>
                </div>
                <div className="mt-1 text-sm font-semibold leading-tight">{j.word}</div>
                <div className="text-[11px] text-cream-faint">{j.detail}</div>
              </div>
            ))}
          </div>

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
            after={
              <div className="h-full w-full animate-fade-in" key={activeStyleId}>
                <RoomScene spec={activeStyle.spec} className="h-full w-full" />
              </div>
            }
            beforeLabel="Their photo"
            afterLabel={`Maison · ${activeStyle.name}`}
            initial={46}
          />
          <div className="mt-3 flex items-center justify-center gap-3">
            <p className="text-xs text-cream-faint">
              Drag the divider — the same room, {CYCLE_STYLES.length} ways.
            </p>
            <div className="flex gap-1.5">
              {CYCLE_STYLES.map((id, i) => (
                <button
                  key={id}
                  onClick={() => setCycleIdx(i)}
                  className={`h-1.5 rounded-full transition-all ${
                    i === cycleIdx ? "w-5 bg-brass" : "w-1.5 bg-ink-line hover:bg-brass/50"
                  }`}
                  aria-label={`Show ${id} style`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
