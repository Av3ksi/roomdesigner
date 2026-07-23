"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Heart, Menu, ShoppingBag, Sparkles, X } from "lucide-react";
import { useState } from "react";
import { cartCount, useMaisonStore } from "@/lib/store";

const LINKS = [
  { href: "/designer", label: "Designer" },
  { href: "/looks", label: "Complete Rooms" },
  { href: "/studio", label: "Studio" },
  { href: "/styles", label: "Styles" },
  { href: "/marketplace", label: "Marketplace" },
  { href: "/pricing", label: "Pricing" },
  { href: "/designs", label: "My Designs" },
  { href: "/boards", label: "Boards" },
];

export default function Nav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const cart = useMaisonStore((s) => s.cart);
  const wishlist = useMaisonStore((s) => s.wishlist);
  const setCartOpen = useMaisonStore((s) => s.setCartOpen);
  const count = cartCount(cart);

  return (
    <header className="sticky top-0 z-40 border-b border-ink-line/70 bg-ink/85 backdrop-blur-md">
      <div className="container-page flex h-16 items-center justify-between">
        <Link href="/" className="group flex items-baseline gap-2">
          <span className="font-display text-2xl tracking-tight text-cream">
            Maison
          </span>
          <span className="hidden text-[10px] font-semibold uppercase tracking-[0.3em] text-brass sm:block">
            AI Interior Design
          </span>
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`text-sm transition ${
                pathname === l.href
                  ? "text-brass-bright"
                  : "text-cream-dim hover:text-cream"
              }`}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <Link
            href="/wishlist"
            className="relative rounded-full border border-ink-line p-2.5 text-cream-dim transition hover:border-brass/50 hover:text-brass-bright"
            aria-label="Open wishlist"
          >
            <Heart size={17} />
            {wishlist.length > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-brass px-1 text-[10px] font-bold text-ink">
                {wishlist.length}
              </span>
            )}
          </Link>
          <button
            onClick={() => setCartOpen(true)}
            className="relative rounded-full border border-ink-line p-2.5 text-cream-dim transition hover:border-brass/50 hover:text-brass-bright"
            aria-label="Open cart"
          >
            <ShoppingBag size={17} />
            {count > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-brass px-1 text-[10px] font-bold text-ink">
                {count}
              </span>
            )}
          </button>
          <Link href="/designer" className="btn-primary hidden !px-5 !py-2.5 md:inline-flex">
            <Sparkles size={15} />
            Design my room
          </Link>
          <button
            className="rounded-full border border-ink-line p-2.5 text-cream-dim md:hidden"
            onClick={() => setOpen(!open)}
            aria-label="Toggle menu"
          >
            {open ? <X size={17} /> : <Menu size={17} />}
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-ink-line bg-ink-soft md:hidden">
          <div className="container-page flex flex-col gap-1 py-4">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2.5 text-sm text-cream-dim hover:bg-ink-panel hover:text-cream"
              >
                {l.label}
              </Link>
            ))}
            <Link
              href="/designer"
              onClick={() => setOpen(false)}
              className="btn-primary mt-2 justify-center"
            >
              <Sparkles size={15} />
              Design my room
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
