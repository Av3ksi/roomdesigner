"use client";

import { Minus, Plus, ShoppingBag, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import ProductGlyph from "@/components/room/ProductGlyph";
import { formatPrice } from "@/lib/products";
import { cartTotal, useMaisonStore } from "@/lib/store";

export default function CartDrawer() {
  const { cart, cartOpen, setCartOpen, setQty, removeFromCart, clearCart } =
    useMaisonStore();
  const total = cartTotal(cart);
  const router = useRouter();

  if (!cartOpen) return null;

  return (
    <div className="fixed inset-0 z-50">
      <button
        aria-label="Close cart"
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => setCartOpen(false)}
      />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-md animate-fade-in flex-col border-l border-ink-line bg-ink-soft shadow-2xl">
        <div className="flex items-center justify-between border-b border-ink-line px-6 py-5">
          <div className="flex items-center gap-2.5">
            <ShoppingBag size={18} className="text-brass" />
            <h2 className="font-display text-xl">Your Room List</h2>
          </div>
          <button
            onClick={() => setCartOpen(false)}
            className="rounded-full border border-ink-line p-2 text-cream-dim hover:text-cream"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {cart.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <ShoppingBag size={32} className="text-ink-line" />
              <p className="text-sm text-cream-faint">
                Nothing here yet. Generate a design in the Studio and add the
                whole look with one click.
              </p>
            </div>
          ) : (
            <ul className="space-y-4">
              {cart.map(({ product, qty }) => (
                <li key={product.id} className="card flex gap-4 p-3">
                  <div className="h-20 w-24 shrink-0 overflow-hidden rounded-lg">
                    <ProductGlyph product={product} className="h-full w-full" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="truncate text-sm font-semibold">{product.name}</div>
                        <div className="text-xs text-cream-faint">{product.brand}</div>
                      </div>
                      <button
                        onClick={() => removeFromCart(product.id)}
                        className="text-cream-faint transition hover:text-red-400"
                        aria-label={`Remove ${product.name}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <div className="mt-2.5 flex items-center justify-between">
                      <div className="flex items-center gap-2 rounded-full border border-ink-line px-2 py-1">
                        <button
                          onClick={() => setQty(product.id, qty - 1)}
                          className="text-cream-dim hover:text-cream"
                          aria-label="Decrease quantity"
                        >
                          <Minus size={12} />
                        </button>
                        <span className="w-4 text-center text-xs">{qty}</span>
                        <button
                          onClick={() => setQty(product.id, qty + 1)}
                          className="text-cream-dim hover:text-cream"
                          aria-label="Increase quantity"
                        >
                          <Plus size={12} />
                        </button>
                      </div>
                      <div className="text-sm font-semibold text-brass-bright">
                        {formatPrice(product.price * qty)}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {cart.length > 0 && (
          <div className="border-t border-ink-line px-6 py-5">
            <div className="mb-1 flex items-center justify-between text-sm text-cream-dim">
              <span>Subtotal</span>
              <span className="text-lg font-semibold text-cream">{formatPrice(total)}</span>
            </div>
            <p className="mb-4 text-xs text-cream-faint">
              White-glove delivery and room assembly quoted at checkout.
            </p>
            <button
              className="btn-primary w-full"
              onClick={() => {
                setCartOpen(false);
                router.push("/checkout");
              }}
            >
              Checkout
            </button>
            <button
              onClick={clearCart}
              className="mt-2 w-full text-center text-xs text-cream-faint transition hover:text-cream-dim"
            >
              Clear list
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}
