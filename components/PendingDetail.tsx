/**
 * Renders a legally-required business detail that hasn't been supplied yet
 * (see lib/legalEntity.ts) as a visible, obviously-unfinished marker rather
 * than silently omitting it or printing invented data. A missing UID that
 * LOOKS missing is a to-do; a plausible fake one is a false statement about
 * a business, which is exactly what an Impressum exists to prevent.
 */
export default function PendingDetail({ label }: { label: string }) {
  return (
    <span className="rounded border border-amber-400/40 bg-amber-400/10 px-1.5 py-0.5 text-xs font-medium text-amber-200">
      {label} — to be added before launch
    </span>
  );
}
