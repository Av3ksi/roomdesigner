"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { User } from "lucide-react";

export default function AccountWidget() {
  const [email, setEmail] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((body) => {
        if (!cancelled) setEmail(body.user?.email ?? null);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!loaded) {
    return <span className="hidden h-9 w-9 rounded-full sm:block" aria-hidden />;
  }

  if (email) {
    return (
      <Link
        href="/account"
        className="hidden items-center gap-1.5 rounded-full border border-ink-line px-3 py-2 text-xs text-cream-dim transition hover:border-brass/50 hover:text-brass-bright sm:flex"
        aria-label="Your account"
        title={email}
      >
        <User size={15} />
        <span className="max-w-[8rem] truncate">{email}</span>
      </Link>
    );
  }

  return (
    <Link
      href="/login"
      className="hidden rounded-full border border-ink-line px-3.5 py-2 text-xs text-cream-dim transition hover:border-brass/50 hover:text-brass-bright sm:block"
    >
      Sign in
    </Link>
  );
}
