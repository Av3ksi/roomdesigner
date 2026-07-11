"use client";

import { Calendar, CheckCircle2, Clock, MessageSquare, Sparkles, Users, Video } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useMaisonStore } from "@/lib/store";

const TYPES = [
  { id: "virtual", label: "Virtual walkthrough", icon: Video, note: "30 min video call, screen-share your Maison room", price: "Free" },
  { id: "advice", label: "Style advice call", icon: MessageSquare, note: "15 min quick-fire Q&A on a specific room", price: "Free" },
  { id: "inhome", label: "In-home visit", icon: Users, note: "A designer visits in person (select cities)", price: "From CHF 220" },
];

function nextWeekdays(count: number): Date[] {
  const out: Date[] = [];
  const d = new Date();
  while (out.length < count) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) out.push(new Date(d));
  }
  return out;
}

const SLOTS = ["9:00", "11:30", "14:00", "16:30"];

export default function ConsultationBooking() {
  const requestConsultation = useMaisonStore((s) => s.requestConsultation);
  const [type, setType] = useState(TYPES[0].id);
  const days = nextWeekdays(4);
  const [dayIdx, setDayIdx] = useState(0);
  const [slot, setSlot] = useState(SLOTS[0]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const selectedType = TYPES.find((t) => t.id === type)!;
  const preferredSlot = `${days[dayIdx].toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })} · ${slot}`;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;
    requestConsultation({ type: selectedType.label, name: name.trim(), email: email.trim(), preferredSlot, notes: notes.trim() });
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="container-page flex flex-col items-center py-24 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full border border-brass/40 bg-brass/10 text-brass">
          <CheckCircle2 size={28} />
        </span>
        <h1 className="font-display mt-6 text-4xl">Request received.</h1>
        <p className="mt-3 max-w-md text-cream-dim">
          A Maison designer will confirm your {selectedType.label.toLowerCase()} for{" "}
          <span className="font-semibold text-brass-bright">{preferredSlot}</span> by email within 24
          hours — this is a request, not yet a confirmed booking.
        </p>
        <Link href="/studio" className="btn-primary mt-8">
          Back to the Studio
        </Link>
      </div>
    );
  }

  return (
    <div className="container-page py-14">
      <div className="max-w-2xl">
        <div className="eyebrow mb-3">Design consultations</div>
        <h1 className="font-display text-4xl leading-tight sm:text-5xl">
          Sometimes you want a human in the room.
        </h1>
        <p className="mt-4 text-cream-dim">
          Bring in a Maison designer to sanity-check the AI&apos;s work, solve a
          tricky layout, or just talk it through. Submit a request and we&apos;ll
          confirm by email.
        </p>
      </div>

      <form onSubmit={submit} className="mt-10 grid gap-8 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <div className="card p-5">
            <div className="mb-3 font-semibold">Consultation type</div>
            <div className="grid gap-2.5 sm:grid-cols-3">
              {TYPES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setType(t.id)}
                  className={`rounded-xl border p-3.5 text-left transition ${
                    type === t.id ? "border-brass bg-brass/5" : "border-ink-line hover:border-brass/40"
                  }`}
                >
                  <t.icon size={18} className="text-brass" />
                  <div className="mt-2 text-sm font-semibold">{t.label}</div>
                  <div className="mt-0.5 text-[11px] leading-snug text-cream-faint">{t.note}</div>
                  <div className="mt-1.5 text-xs font-semibold text-brass-bright">{t.price}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="card p-5">
            <div className="mb-3 flex items-center gap-1.5 font-semibold">
              <Calendar size={15} className="text-brass" /> Preferred day
            </div>
            <div className="flex flex-wrap gap-2">
              {days.map((d, i) => (
                <button
                  key={d.toISOString()}
                  type="button"
                  onClick={() => setDayIdx(i)}
                  className={`rounded-lg border px-3 py-2 text-xs font-medium transition ${
                    dayIdx === i ? "border-brass bg-brass/10 text-brass-bright" : "border-ink-line text-cream-dim hover:border-brass/40"
                  }`}
                >
                  {d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                </button>
              ))}
            </div>
            <div className="mb-3 mt-5 flex items-center gap-1.5 font-semibold">
              <Clock size={15} className="text-brass" /> Preferred time
            </div>
            <div className="flex flex-wrap gap-2">
              {SLOTS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSlot(s)}
                  className={`rounded-lg border px-3 py-2 text-xs font-medium transition ${
                    slot === s ? "border-brass bg-brass/10 text-brass-bright" : "border-ink-line text-cream-dim hover:border-brass/40"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="card p-5">
            <div className="mb-3 font-semibold">Your details</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Full name"
                required
                className="rounded-lg border border-ink-line bg-ink-soft px-3.5 py-2.5 text-sm outline-none placeholder:text-cream-faint/60 focus:border-brass/50"
              />
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                placeholder="Email"
                required
                className="rounded-lg border border-ink-line bg-ink-soft px-3.5 py-2.5 text-sm outline-none placeholder:text-cream-faint/60 focus:border-brass/50"
              />
            </div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="What would you like help with? (optional)"
              rows={3}
              className="mt-3 w-full resize-none rounded-lg border border-ink-line bg-ink-soft px-3.5 py-2.5 text-sm outline-none placeholder:text-cream-faint/60 focus:border-brass/50"
            />
          </div>
        </div>

        <div>
          <div className="card sticky top-24 p-5">
            <div className="mb-3 flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-cream-faint">
              <Sparkles size={12} className="text-brass" /> Request summary
            </div>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-cream-dim">Type</dt>
                <dd className="font-medium">{selectedType.label}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-cream-dim">When</dt>
                <dd className="text-right font-medium">{preferredSlot}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-cream-dim">Price</dt>
                <dd className="font-medium text-brass-bright">{selectedType.price}</dd>
              </div>
            </dl>
            <button type="submit" className="btn-primary mt-5 w-full">
              Request consultation
            </button>
            <p className="mt-2 text-center text-[11px] text-cream-faint">
              This submits a request — a designer confirms by email within 24 hours.
            </p>
          </div>
        </div>
      </form>
    </div>
  );
}
