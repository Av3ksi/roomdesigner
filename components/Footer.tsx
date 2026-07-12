import Link from "next/link";

const COLUMNS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "Product",
    links: [
      { label: "Design Studio", href: "/studio" },
      { label: "Signature Styles", href: "/styles" },
      { label: "Marketplace", href: "/marketplace" },
      { label: "Pricing", href: "/pricing" },
      { label: "Book a Consultation", href: "/consultation" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "/" },
      { label: "Careers", href: "/" },
      { label: "Press", href: "/" },
      { label: "Contact", href: "/" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Design Journal", href: "/" },
      { label: "Trade Program", href: "/" },
      { label: "Retail Partners", href: "/marketplace" },
      { label: "API", href: "/" },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="border-t border-ink-line/70 bg-ink-soft">
      <div className="container-page grid gap-10 py-14 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div>
          <div className="font-display text-2xl text-cream">Maison</div>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-cream-faint">
            The AI interior designer. Photograph your room, and Maison reads
            the space, designs it back to you, and lets you buy the result.
          </p>
          <p className="mt-6 text-xs text-cream-faint/70">
            © {new Date().getFullYear()} Maison Design Intelligence, Inc.
          </p>
        </div>
        {COLUMNS.map((col) => (
          <div key={col.title}>
            <div className="eyebrow mb-4">{col.title}</div>
            <ul className="space-y-2.5">
              {col.links.map((l) => (
                <li key={l.label}>
                  <Link
                    href={l.href}
                    className="text-sm text-cream-dim transition hover:text-brass-bright"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </footer>
  );
}
