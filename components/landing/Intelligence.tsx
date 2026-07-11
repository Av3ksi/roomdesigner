import {
  AppWindow,
  Blinds,
  Box,
  DoorOpen,
  Layers,
  Lightbulb,
  Palette,
  Ruler,
  Sofa,
  SwatchBook,
} from "lucide-react";
import Reveal from "@/components/landing/Reveal";
import RoomScene from "@/components/room/RoomScene";
import { SAMPLE_ROOMS } from "@/lib/rooms";

const READS = [
  { icon: Ruler, label: "Room dimensions", detail: "±8cm from visual cues" },
  { icon: Layers, label: "Walls & architecture", detail: "Condition, finish, features" },
  { icon: AppWindow, label: "Windows & light paths", detail: "Orientation & exposure" },
  { icon: DoorOpen, label: "Doors & circulation", detail: "Traffic flow mapping" },
  { icon: Box, label: "Flooring", detail: "Material, tone, condition" },
  { icon: Sofa, label: "Existing furniture", detail: "Keep / replace verdicts" },
  { icon: Lightbulb, label: "Lighting conditions", detail: "Natural score + temperature" },
  { icon: Palette, label: "Color palette", detail: "Dominant tones, extracted" },
  { icon: SwatchBook, label: "Materials", detail: "Wood, stone, textile, metal" },
  { icon: Blinds, label: "Spatial layout", detail: "Zones & focal points" },
];

export default function Intelligence() {
  const room = SAMPLE_ROOMS[0];
  return (
    <section className="container-page py-20">
      <div className="grid items-center gap-12 lg:grid-cols-2">
        <Reveal>
          <div className="eyebrow mb-3">Spatial intelligence</div>
          <h2 className="font-display text-4xl leading-tight sm:text-5xl">
            It doesn&apos;t guess your room.
            <br />
            <em className="text-brass-bright">It understands it.</em>
          </h2>
          <p className="mt-5 max-w-lg leading-relaxed text-cream-dim">
            Most tools paste furniture onto a photo. Maison builds a structured
            model of your space first — ten dimensions of understanding that
            every design decision is grounded in.
          </p>
          <div className="mt-8 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {READS.map(({ icon: Icon, label, detail }) => (
              <div key={label} className="flex items-center gap-3 rounded-xl border border-ink-line/70 bg-ink-soft px-3.5 py-2.5">
                <Icon size={16} className="shrink-0 text-brass" />
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{label}</div>
                  <div className="truncate text-[11px] text-cream-faint">{detail}</div>
                </div>
              </div>
            ))}
          </div>
        </Reveal>

        <Reveal delay={120} className="relative">
          <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-ink-line shadow-2xl shadow-black/50">
            <RoomScene spec={room.spec} dated className="h-full w-full" />
            {room.analysis.detections.map(
              (d, i) =>
                d.box && (
                  <div
                    key={i}
                    className="absolute rounded-md border border-brass/80"
                    style={{
                      left: `${d.box.x * 100}%`,
                      top: `${d.box.y * 100}%`,
                      width: `${d.box.w * 100}%`,
                      height: `${d.box.h * 100}%`,
                      boxShadow: "0 0 0 1px rgba(0,0,0,0.35)",
                    }}
                  >
                    <span className="absolute -top-6 left-0 whitespace-nowrap rounded bg-ink/90 px-1.5 py-0.5 text-[10px] font-semibold text-brass-bright">
                      {d.label} · {(d.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                ),
            )}
            <div className="pointer-events-none absolute inset-x-0 h-0.5 animate-scanline bg-brass/70 shadow-[0_0_20px_3px_rgba(200,169,110,0.4)]" />
          </div>
          <div className="card absolute -bottom-6 left-6 right-6 hidden items-center justify-between p-4 shadow-xl sm:flex">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-cream-faint">Live analysis</div>
              <div className="text-sm font-semibold">
                {room.analysis.roomType} · {room.analysis.dimensions.areaM2} m² ·{" "}
                {room.analysis.windows.orientation} light
              </div>
            </div>
            <div className="font-display text-xl text-brass-bright">
              {(room.analysis.confidence * 100).toFixed(0)}%
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
