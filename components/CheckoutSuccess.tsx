"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Mail, ShoppingBag } from "lucide-react";
import { formatPrice } from "@/lib/products";
import { useMaisonStore } from "@/lib/store";

interface OrderStatus {
  id: string;
  email: string;
  totalPrice: number;
  status: string;
}

const MAX_POLL_ATTEMPTS = 6;
const POLL_INTERVAL_MS = 1500;

export default function CheckoutSuccess() {
  const sessionId = useSearchParams().get("session_id");
  const clearCart = useMaisonStore((s) => s.clearCart);
  const clearedRef = useRef(false);
  const [order, setOrder] = useState<OrderStatus | null>(null);
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    // Stripe only redirects here after a successful payment — clear the
    // cart regardless of how long the webhook takes to catch up.
    if (!clearedRef.current) {
      clearedRef.current = true;
      clearCart();
    }
  }, [clearCart]);

  useEffect(() => {
    if (!sessionId) {
      setSettled(true);
      return;
    }
    let cancelled = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      attempts += 1;
      try {
        const res = await fetch(`/api/checkout/status?session_id=${encodeURIComponent(sessionId!)}`);
        const body = await res.json();
        if (cancelled) return;
        if (body.order) setOrder(body.order);
        const paid = body.order?.status === "paid";
        if (paid || attempts >= MAX_POLL_ATTEMPTS) {
          setSettled(true);
          return;
        }
        timer = setTimeout(poll, POLL_INTERVAL_MS);
      } catch {
        if (!cancelled) setSettled(true);
      }
    }
    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [sessionId]);

  if (!sessionId) {
    return (
      <div className="container-page flex flex-col items-center py-24 text-center">
        <ShoppingBag size={36} className="text-ink-line" />
        <h1 className="font-display mt-5 text-3xl">No order to show.</h1>
        <Link href="/marketplace" className="btn-primary mt-7">
          Back to shopping
        </Link>
      </div>
    );
  }

  return (
    <div className="container-page flex flex-col items-center py-24 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full border border-brass/40 bg-brass/10 text-brass">
        <CheckCircle2 size={28} />
      </span>
      <h1 className="font-display mt-6 text-4xl">Your room is on its way.</h1>
      {order ? (
        <p className="mt-3 max-w-md text-cream-dim">
          Payment of <span className="font-semibold text-brass-bright">{formatPrice(order.totalPrice)}</span> confirmed.
          A receipt is on its way to <span className="text-cream">{order.email}</span>.
        </p>
      ) : settled ? (
        <p className="mt-3 max-w-md text-cream-dim">
          Payment received. We&apos;re still finalizing your order details — check your email shortly for a confirmation.
        </p>
      ) : (
        <p className="mt-3 max-w-md text-cream-dim">Confirming your payment…</p>
      )}
      <div className="card mt-8 flex w-full max-w-lg items-center gap-3 px-5 py-4 text-left text-sm text-cream-dim">
        <Mail size={16} className="shrink-0 text-brass" />
        Order confirmation and delivery updates will be emailed to you.
      </div>
      <Link href="/designer" className="btn-primary mt-8">
        Design another room
      </Link>
    </div>
  );
}
