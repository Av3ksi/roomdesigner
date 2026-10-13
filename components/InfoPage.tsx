import type { ReactNode } from "react";

/**
 * Shared shell for the informational pages linked from the footer (about,
 * contact, careers, press, journal, trade, partners, api). Same typographic
 * rhythm as LegalPage but without the legal-review banner, so the company
 * pages read as considered rather than as disclaimers.
 */
export default function InfoPage({
  eyebrow,
  title,
  intro,
  children,
}: {
  eyebrow: string;
  title: string;
  intro?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="container-page py-14">
      <div className="max-w-3xl">
        <div className="eyebrow mb-3">{eyebrow}</div>
        <h1 className="font-display text-4xl leading-tight sm:text-5xl">{title}</h1>
        {intro && <p className="mt-5 text-lg leading-relaxed text-cream-dim">{intro}</p>}
        <div className="mt-10 space-y-4 text-sm leading-relaxed text-cream-dim [&_h2]:mt-10 [&_h2]:mb-2 [&_h2]:font-display [&_h2]:text-xl [&_h2]:text-cream [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5">
          {children}
        </div>
      </div>
    </div>
  );
}

/**
 * The honest version of a "coming soon" block: states plainly that
 * something doesn't exist yet and gives the one useful action available
 * instead. Used where a footer link promises a programme this business
 * genuinely hasn't built — inventing content for those would overstate
 * where the company actually is.
 */
export function NotYetBlock({ title, body, email }: { title: string; body: ReactNode; email: string }) {
  return (
    <div className="card mt-8 p-6">
      <h2 className="!mt-0 font-display text-xl text-cream">{title}</h2>
      <div className="mt-2 text-sm leading-relaxed text-cream-dim">{body}</div>
      <a href={`mailto:${email}`} className="btn-ghost mt-5">
        Write to us
      </a>
    </div>
  );
}
