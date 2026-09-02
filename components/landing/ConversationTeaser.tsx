import Link from "next/link";
import { ArrowRight, History, MessageCircle, MousePointerClick } from "lucide-react";
import Reveal from "@/components/landing/Reveal";

/**
 * Replaces ImmersiveTeaser.tsx, which promised a 3D "split-screen, drag to
 * morph, orbit, walk through, AR on your phone, VR with a headset" room
 * viewer — a real component (components/studio/Immersive3D.tsx), but one
 * only reachable via /shared, which needs an already-published room to
 * view. The "Enter your room" CTA sent a first-time visitor straight to
 * /designer instead, which has none of that: a photo-based chat flow, not
 * a 3D viewer. That's the actual product, described honestly here instead.
 */
const CALLOUTS = [
  { icon: MessageCircle, label: "Describe what you want, or pick from suggestions" },
  { icon: MousePointerClick, label: "Preview placement and real size before it costs a credit" },
  { icon: History, label: "Every confirmed edit saved — jump back to any version" },
];

export default function ConversationTeaser() {
  return (
    <section className="container-page py-20">
      <div className="grid items-center gap-12 lg:grid-cols-2">
        <Reveal>
          <div className="eyebrow mb-3">The real workflow</div>
          <h2 className="font-display text-4xl leading-tight sm:text-5xl">
            Talk to your room.
            <br />
            <em className="text-brass-bright">Confirm what you like.</em>
          </h2>
          <p className="mt-5 max-w-lg leading-relaxed text-cream-dim">
            No mood boards, no grey placeholder blocks. Upload your room and the assistant reads
            what&apos;s already there — furniture, light, rough dimensions — then proposes real
            products one at a time. Nothing renders, and no credit is spent, until you confirm it.
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
          <Link href="/designer" className="btn-primary mt-8 !px-8 !py-3.5 !text-base">
            Start the conversation <ArrowRight size={17} />
          </Link>
        </Reveal>

        <Reveal delay={120}>
          <div className="card flex flex-col gap-3 p-5">
            <div className="flex justify-end">
              <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-brass/15 px-4 py-2.5 text-sm text-cream">
                Something warmer for the reading corner
              </div>
            </div>
            <div className="flex justify-start">
              <div className="max-w-[85%] rounded-2xl rounded-tl-sm border border-ink-line bg-ink-panel px-4 py-2.5 text-sm text-cream-dim">
                A walnut floor lamp would sit well beside the armchair — want to see it there?
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-brass/30 bg-brass/5 p-3">
              <div className="h-12 w-12 shrink-0 rounded-lg bg-ink-line" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-semibold text-cream">Walnut Floor Lamp</div>
                <div className="text-[11px] text-cream-faint">CHF 189 · lighting</div>
              </div>
              <span className="shrink-0 rounded-full bg-brass px-3 py-1.5 text-[11px] font-semibold text-ink">
                Confirm
              </span>
            </div>
            <div className="mt-1 flex items-center gap-1.5 border-t border-ink-line pt-3">
              {["Original", "V1", "V2", "V3"].map((v, i) => (
                <span
                  key={v}
                  className={`rounded-full px-2.5 py-1 text-[10px] font-medium ${
                    i === 2 ? "bg-brass text-ink" : "border border-ink-line text-cream-faint"
                  }`}
                >
                  {v}
                </span>
              ))}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
