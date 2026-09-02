import type { ReactNode } from "react";

/**
 * Shared shell for the /legal/* pages. Every one of these carries a visible
 * draft notice — this is AI-generated boilerplate meant to unblock
 * development (so the site isn't missing these pages entirely at launch),
 * not vetted legal text. A real business must have a qualified lawyer
 * review and finalize this content — especially for a Swiss/EU consumer
 * store handling real payments — before removing the notice.
 */
export default function LegalPage({
  title,
  lastUpdated,
  children,
}: {
  title: string;
  lastUpdated: string;
  children: ReactNode;
}) {
  return (
    <div className="container-page py-14">
      <div className="max-w-3xl">
        <div className="eyebrow mb-3">Legal</div>
        <h1 className="font-display text-4xl leading-tight sm:text-5xl">{title}</h1>
        <p className="mt-2 text-xs text-cream-faint">Last updated: {lastUpdated}</p>

        <div className="mt-6 rounded-xl border border-amber-400/30 bg-amber-400/5 p-4 text-sm text-amber-200">
          <strong>Not yet reviewed by a lawyer.</strong> This text was drafted against Swiss law (Code of
          Obligations, revised FADP, UWG) and is substantive rather than placeholder, but it is not legal
          advice. Have a Swiss consumer-law professional review it before this site takes real payments —
          in particular the cross-border transfer of room photographs to US AI providers under Art. 16–17
          FADP, and the EU consumer rights that attach to shipping into the EU.
        </div>

        <div className="mt-8 space-y-4 text-sm leading-relaxed text-cream-dim [&_h2]:mt-8 [&_h2]:mb-2 [&_h2]:font-display [&_h2]:text-xl [&_h2]:text-cream [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5">
          {children}
        </div>
      </div>
    </div>
  );
}
