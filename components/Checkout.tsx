"use client";

import Link from "next/link";
import {
  Check,
  CheckCircle2,
  Hammer,
  Leaf,
  Minus,
  Plus,
  RotateCcw,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Trash2,
  Truck,
} from "lucide-react";
import { useMemo, useState } from "react";
import ProductGlyph from "@/components/room/ProductGlyph";
import { formatPrice } from "@/lib/products";
import { cartTotal, useMaisonStore } from "@/lib/store";

const DELIVERY = [
  { id: "standard", label: "Standard delivery", note: "5–7 business days, to your door", price: 0 },
  { id: "express", label: "Express delivery", note: "2–3 business days", price: 49 },
  { id: "whiteglove", label: "White-glove delivery", note: "Scheduled window, unboxed & placed in the room", price: 199 },
] as const;

const INSTALLATION = [
  { id: "none", label: "No installation", note: "I'll set it up myself", price: 0 },
  { id: "assembly", label: "Professional assembly", note: "Every piece assembled & packaging removed", price: 149 },
  { id: "styling", label: "Assembly + designer styling visit", note: "A Maison designer stages the room to the concept", price: 399 },
] as const;

function deliveryWindow(daysMin: number, daysMax: number): string {
  const fmt = (offset: number) =>
    new Date(Date.now() + offset * 86_400_000).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  return `${fmt(daysMin)} – ${fmt(daysMax)}`;
}

export default function Checkout() {
  const { cart, setQty, removeFromCart, clearCart } = useMaisonStore();
  const [delivery, setDelivery] = useState<(typeof DELIVERY)[number]["id"]>("whiteglove");
  const [installation, setInstallation] = useState<(typeof INSTALLATION)[number]["id"]>("assembly");
  const [orderId, setOrderId] = useState<string | null>(null);

  const subtotal = cartTotal(cart);
  const deliveryOpt = DELIVERY.find((d) => d.id === delivery)!;
  const installOpt = INSTALLATION.find((i) => i.id === installation)!;
  const total = subtotal + deliveryOpt.price + installOpt.price;
  const window = useMemo(
    () => (delivery === "express" ? deliveryWindow(2, 3) : delivery === "standard" ? deliveryWindow(5, 7) : deliveryWindow(6, 9)),
    [delivery],
  );

  const placeOrder = () => {
    setOrderId(`MA-${Math.floor(100000 + Math.random() * 900000)}`);
    clearCart();
  };

  /* ——— confirmation ——— */
  if (orderId) {
    return (
      <div className="container-page flex flex-col items-center py-24 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full border border-brass/40 bg-brass/10 text-brass">
          <CheckCircle2 size={28} />
        </span>
        <h1 className="font-display mt-6 text-4xl">Your room is on its way.</h1>
        <p className="mt-3 max-w-md text-cream-dim">
          Order <span className="font-semibold text-brass-bright">{orderId}</span> is
          confirmed. A summary with your full shopping list, delivery window
          and installation booking is in your inbox.
        </p>
        <div className="card mt-8 w-full max-w-lg divide-y divide-ink-line/60 text-left">
          {[
            { icon: ShoppingBag, t: "Order confirmed", s: "Just now", done: true },
            { icon: Truck, t: `${deliveryOpt.label}`, s: `Estimated ${window}`, done: false },
            ...(installation !== "none"
              ? [{ icon: Hammer, t: installOpt.label, s: "Scheduled after delivery", done: false }]
              : []),
            { icon: Sparkles, t: "Live in your new room", s: "The good part", done: false },
          ].map(({ icon: Icon, t, s, done }) => (
            <div key={t} className="flex items-center gap-4 px-5 py-4">
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border ${
                  done ? "border-brass bg-brass/10 text-brass" : "border-ink-line text-cream-faint"
                }`}
              >
                <Icon size={15} />
              </span>
              <div>
                <div className="text-sm font-semibold">{t}</div>
                <div className="text-xs text-cream-faint">{s}</div>
              </div>
              {done && <Check size={15} className="ml-auto text-brass" />}
            </div>
          ))}
        </div>
        <Link href="/studio" className="btn-primary mt-8">
          Design another room
        </Link>
      </div>
    );
  }

  /* ——— empty cart ——— */
  if (cart.length === 0) {
    return (
      <div className="container-page flex flex-col items-center py-24 text-center">
        <ShoppingBag size={36} className="text-ink-line" />
        <h1 className="font-display mt-5 text-3xl">Your room list is empty.</h1>
        <p className="mt-2 max-w-sm text-sm text-cream-faint">
          Generate a design in the Studio and add the whole look with one
          click — every piece lands here.
        </p>
        <Link href="/studio" className="btn-primary mt-7">
          Open the Studio
        </Link>
      </div>
    );
  }

  return (
    <div className="container-page py-12">
      <div className="eyebrow mb-2">Checkout</div>
      <h1 className="font-display text-4xl">Almost home.</h1>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-6">
          {/* Shopping list */}
          <div className="card overflow-hidden">
            <div className="border-b border-ink-line px-5 py-4 font-semibold">
              Your shopping list · {cart.length} item{cart.length === 1 ? "" : "s"}
            </div>
            <ul className="divide-y divide-ink-line/60">
              {cart.map(({ product, qty }) => (
                <li key={product.id} className="flex items-center gap-4 px-5 py-4">
                  <div className="h-16 w-20 shrink-0 overflow-hidden rounded-lg">
                    <ProductGlyph product={product} className="h-full w-full" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{product.name}</div>
                    <div className="text-xs text-cream-faint">{product.brand}</div>
                  </div>
                  <div className="flex items-center gap-2 rounded-full border border-ink-line px-2 py-1">
                    <button onClick={() => setQty(product.id, qty - 1)} className="text-cream-dim hover:text-cream" aria-label="Decrease quantity">
                      <Minus size={12} />
                    </button>
                    <span className="w-4 text-center text-xs">{qty}</span>
                    <button onClick={() => setQty(product.id, qty + 1)} className="text-cream-dim hover:text-cream" aria-label="Increase quantity">
                      <Plus size={12} />
                    </button>
                  </div>
                  <div className="w-20 text-right text-sm font-semibold">
                    {formatPrice(product.price * qty)}
                  </div>
                  <button
                    onClick={() => removeFromCart(product.id)}
                    className="text-cream-faint transition hover:text-red-400"
                    aria-label={`Remove ${product.name}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Delivery */}
          <div className="card p-5">
            <div className="mb-3 font-semibold">Delivery</div>
            <div className="space-y-2.5">
              {DELIVERY.map((d) => (
                <button
                  key={d.id}
                  onClick={() => setDelivery(d.id)}
                  className={`flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition ${
                    delivery === d.id ? "border-brass bg-brass/5" : "border-ink-line hover:border-brass/40"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`flex h-[18px] w-[18px] items-center justify-center rounded-full border ${
                        delivery === d.id ? "border-brass" : "border-ink-line"
                      }`}
                    >
                      {delivery === d.id && <span className="h-2.5 w-2.5 rounded-full bg-brass" />}
                    </span>
                    <div>
                      <div className="text-sm font-semibold">{d.label}</div>
                      <div className="text-xs text-cream-faint">{d.note}</div>
                    </div>
                  </div>
                  <div className="text-sm font-semibold">
                    {d.price === 0 ? "Free" : formatPrice(d.price)}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Installation */}
          <div className="card p-5">
            <div className="mb-3 font-semibold">Installation</div>
            <div className="space-y-2.5">
              {INSTALLATION.map((i) => (
                <button
                  key={i.id}
                  onClick={() => setInstallation(i.id)}
                  className={`flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition ${
                    installation === i.id ? "border-brass bg-brass/5" : "border-ink-line hover:border-brass/40"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`flex h-[18px] w-[18px] items-center justify-center rounded-full border ${
                        installation === i.id ? "border-brass" : "border-ink-line"
                      }`}
                    >
                      {installation === i.id && <span className="h-2.5 w-2.5 rounded-full bg-brass" />}
                    </span>
                    <div>
                      <div className="text-sm font-semibold">{i.label}</div>
                      <div className="text-xs text-cream-faint">{i.note}</div>
                    </div>
                  </div>
                  <div className="text-sm font-semibold">
                    {i.price === 0 ? "—" : formatPrice(i.price)}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Summary */}
        <div>
          <div className="card sticky top-24 p-5">
            <div className="mb-4 font-semibold">Order summary</div>
            <dl className="space-y-2.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-cream-dim">Subtotal</dt>
                <dd>{formatPrice(subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-cream-dim">{deliveryOpt.label}</dt>
                <dd>{deliveryOpt.price === 0 ? "Free" : formatPrice(deliveryOpt.price)}</dd>
              </div>
              {installOpt.price > 0 && (
                <div className="flex justify-between">
                  <dt className="text-cream-dim">{installOpt.label}</dt>
                  <dd>{formatPrice(installOpt.price)}</dd>
                </div>
              )}
              <div className="flex justify-between border-t border-ink-line pt-3 text-base font-semibold">
                <dt>Total</dt>
                <dd className="text-brass-bright">{formatPrice(total)}</dd>
              </div>
            </dl>
            <p className="mt-3 rounded-lg bg-ink-soft px-3 py-2.5 text-xs text-cream-dim">
              <Truck size={12} className="mr-1.5 inline text-brass" />
              Estimated delivery <span className="font-semibold">{window}</span>
            </p>
            <button onClick={placeOrder} className="btn-primary mt-4 w-full">
              Place order · {formatPrice(total)}
            </button>
            <p className="mt-2 text-center text-[11px] text-cream-faint">
              Demo checkout — no payment is collected.
            </p>
            <ul className="mt-5 space-y-2 border-t border-ink-line pt-4 text-xs text-cream-faint">
              <li className="flex items-center gap-2">
                <RotateCcw size={12} className="text-brass" /> 30-day returns on every piece
              </li>
              <li className="flex items-center gap-2">
                <ShieldCheck size={12} className="text-brass" /> Buyer protection & price match
              </li>
              <li className="flex items-center gap-2">
                <Leaf size={12} className="text-brass" /> Carbon-neutral delivery
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
