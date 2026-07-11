const QUOTES = [
  {
    quote:
      "I uploaded my room and the AI created my dream home. That sounds like ad copy — it's just what happened. The before/after slider sold my partner in eleven seconds.",
    name: "Priya N.",
    role: "First apartment, Austin",
  },
  {
    quote:
      "It knew my window faced north before I did. The scheme it proposed was built around that light — warm textiles, 2700K lamps. That's designer thinking, not a filter.",
    name: "Jonas W.",
    role: "Rental flat, Berlin",
  },
  {
    quote:
      "We'd been quoted CHF 4,000 for a design consult. Maison gave us three concepts over coffee and we bought the whole living room the same afternoon.",
    name: "Dana & Marc R.",
    role: "Family den, Portland",
  },
];

export default function Testimonials() {
  return (
    <section className="container-page py-20">
      <div className="mb-12 max-w-2xl">
        <div className="eyebrow mb-3">From our rooms</div>
        <h2 className="font-display text-4xl leading-tight sm:text-5xl">
          2.4 million rooms. Same reaction.
        </h2>
      </div>
      <div className="grid gap-6 md:grid-cols-3">
        {QUOTES.map((q) => (
          <figure key={q.name} className="card flex flex-col justify-between p-7">
            <blockquote className="font-display text-lg leading-relaxed text-cream">
              “{q.quote}”
            </blockquote>
            <figcaption className="mt-6 border-t border-ink-line pt-4">
              <div className="text-sm font-semibold">{q.name}</div>
              <div className="text-xs text-cream-faint">{q.role}</div>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
