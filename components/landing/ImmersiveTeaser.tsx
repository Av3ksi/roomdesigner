import Link from "next/link";
import { ArrowRight, Move3d, Smartphone, Sun } from "lucide-react";
import Reveal from "@/components/landing/Reveal";
import RoomScene from "@/components/room/RoomScene";
import { SAMPLE_ROOMS } from "@/lib/rooms";
import { STYLE_MAP } from "@/lib/styles";

const CALLOUTS = [
  { icon: Move3d, label: "Orbit & walk through in real time" },
  { icon: Sun, label: "Dawn to night, lighting recalculated live" },
  { icon: Smartphone, label: "AR on your phone, VR with a headset" },
];

export default function ImmersiveTeaser() {
  const before = SAMPLE_ROOMS[1]?.spec ?? SAMPLE_ROOMS[0].spec;
  const after = STYLE_MAP.darkluxury.spec;

  return (
    <section className="container-page py-20">
      <div className="grid items-center gap-12 lg:grid-cols-2">
        <Reveal>
          <div className="eyebrow mb-3">The signature experience</div>
          <h2 className="font-display text-4xl leading-tight sm:text-5xl">
            Step inside.
            <br />
            <em className="text-brass-bright">Both rooms, at once.</em>
          </h2>
          <p className="mt-5 max-w-lg leading-relaxed text-cream-dim">
            Not a slider. Not a render. A living, physically-lit 3D room where
            your space and its redesign exist in the same volume, split by a
            glowing seam you drag to morph between them — no loading, no
            snapping. Orbit it, walk through it, watch the light change from
            dawn to night, or click any object to shop it on the spot.
          </p>
          <div className="mt-7 space-y-3">
            {CALLOUTS.map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-brass/40 bg-brass/10 text-brass">
                  <Icon size={16} />
                </span>
                <span className="text-sm text-cream-dim">{label}</span>
              </div>
            ))}
          </div>
          <Link href="/studio" className="btn-primary mt-8 !px-8 !py-3.5 !text-base">
            Enter your room <ArrowRight size={17} />
          </Link>
        </Reveal>

        <Reveal delay={120}>
          <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-ink-line shadow-2xl shadow-black/50">
            <div className="absolute inset-0 grid grid-cols-2">
              <div className="relative overflow-hidden">
                <RoomScene spec={before} dated className="h-full w-full" />
              </div>
              <div className="relative overflow-hidden">
                <RoomScene spec={after} className="h-full w-full" />
              </div>
            </div>
            {/* Golden divider seam */}
            <div className="pointer-events-none absolute bottom-0 top-0 left-1/2 w-0.5 -translate-x-1/2 bg-gradient-to-b from-transparent via-brass to-transparent shadow-[0_0_18px_3px_rgba(200,169,110,0.55)]" />
            <div className="pointer-events-none absolute left-1/2 top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-brass/50 bg-ink/85 text-brass shadow-lg backdrop-blur">
              <Move3d size={16} />
            </div>
            <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-ink/75 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-cream backdrop-blur">
              Your room
            </span>
            <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-brass/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-ink backdrop-blur">
              Dark Luxury
            </span>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
