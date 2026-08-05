"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, Heart, Menu, ShoppingBag, Sparkles, X } from "lucide-react";
import { useState } from "react";
import { cartCount, useVistroomStore } from "@/lib/store";
import AccountWidget from "@/components/AccountWidget";
import CreditBadge from "@/components/CreditBadge";

// Kept short on purpose — these are the links most visitors actually use.
// Everything else lives behind "More" so the bar doesn't wrap or crowd out
// the account/cart controls at real desktop widths.
const PRIMARY_LINKS = [
  { href: "/looks", label: "Complete Rooms" },
  { href: "/marketplace", label: "Marketplace" },
  { href: "/my-rooms", label: "My Collection" },
];

const MORE_LINKS = [
  { href: "/publish", label: "Publish" },
  { href: "/styles", label: "Styles" },
  { href: "/pricing", label: "Pricing" },
  { href: "/boards", label: "Boards" },
];

const ALL_LINKS = [{ href: "/designer", label: "Designer" }, ...PRIMARY_LINKS, ...MORE_LINKS];

export default function Nav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const cart = useVistroomStore((s) => s.cart);
  const wishlist = useVistroomStore((s) => s.wishlist);
  const setCartOpen = useVistroomStore((s) => s.setCartOpen);
  const count = cartCount(cart);
  const onMoreLink = MORE_LINKS.some((l) => l.href === pathname);

  return (
    <header className="sticky top-0 z-40 border-b border-ink-line/70 bg-ink/85 backdrop-blur-md">
      <div className="container-page flex h-16 items-center justify-between gap-4">
        <Link href="/" className="group flex shrink-0 items-baseline gap-2">
          <span className="font-display text-2xl tracking-tight text-cream">
            Vistroom
          </span>
          <span className="hidden text-[10px] font-semibold uppercase tracking-[0.3em] text-brass sm:block">
            AI Interior Design
          </span>
        </Link>

        <nav className="hidden items-center gap-6 md:flex">
          {PRIMARY_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`whitespace-nowrap text-sm transition ${
                pathname === l.href
                  ? "text-brass-bright"
                  : "text-cream-dim hover:text-cream"
              }`}
            >
              {l.label}
            </Link>
          ))}
          <div className="relative">
            <button
              onClick={() => setMoreOpen((v) => !v)}
              onBlur={() => setTimeout(() => setMoreOpen(false), 100)}
              className={`flex items-center gap-1 whitespace-nowrap text-sm transition ${
                onMoreLink ? "text-brass-bright" : "text-cream-dim hover:text-cream"
              }`}
            >
              More
              <ChevronDown size={13} className={`transition-transform ${moreOpen ? "rotate-180" : ""}`} />
            </button>
            {moreOpen && (
              <div className="absolute left-1/2 top-full mt-2 w-40 -translate-x-1/2 rounded-xl border border-ink-line bg-ink-panel p-1.5 shadow-lg">
                {MORE_LINKS.map((l) => (
                  <Link
                    key={l.href}
                    href={l.href}
                    className={`block whitespace-nowrap rounded-lg px-3 py-2 text-sm transition ${
                      pathname === l.href
                        ? "bg-brass/10 text-brass-bright"
                        : "text-cream-dim hover:bg-ink-soft hover:text-cream"
                    }`}
                  >
                    {l.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </nav>

        <div className="flex shrink-0 items-center gap-3">
          <CreditBadge />
          <AccountWidget />
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
            {ALL_LINKS.map((l) => (
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
            <Link
              href="/account"
              onClick={() => setOpen(false)}
              className="rounded-lg px-3 py-2.5 text-sm text-cream-dim hover:bg-ink-panel hover:text-cream"
            >
              Account
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
