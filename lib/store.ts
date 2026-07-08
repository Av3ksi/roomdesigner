"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Product } from "./types";

export interface CartItem {
  product: Product;
  qty: number;
}

interface MaisonStore {
  cart: CartItem[];
  cartOpen: boolean;
  addToCart: (product: Product) => void;
  addManyToCart: (products: Product[]) => void;
  removeFromCart: (productId: string) => void;
  setQty: (productId: string, qty: number) => void;
  clearCart: () => void;
  setCartOpen: (open: boolean) => void;
}

export const useMaisonStore = create<MaisonStore>()(
  persist(
    (set) => ({
      cart: [],
      cartOpen: false,
      addToCart: (product) =>
        set((s) => {
          const existing = s.cart.find((c) => c.product.id === product.id);
          if (existing) {
            return {
              cart: s.cart.map((c) =>
                c.product.id === product.id ? { ...c, qty: c.qty + 1 } : c,
              ),
            };
          }
          return { cart: [...s.cart, { product, qty: 1 }] };
        }),
      addManyToCart: (products) =>
        set((s) => {
          const cart = [...s.cart];
          for (const product of products) {
            const existing = cart.find((c) => c.product.id === product.id);
            if (existing) existing.qty += 1;
            else cart.push({ product, qty: 1 });
          }
          return { cart, cartOpen: true };
        }),
      removeFromCart: (productId) =>
        set((s) => ({ cart: s.cart.filter((c) => c.product.id !== productId) })),
      setQty: (productId, qty) =>
        set((s) => ({
          cart:
            qty <= 0
              ? s.cart.filter((c) => c.product.id !== productId)
              : s.cart.map((c) => (c.product.id === productId ? { ...c, qty } : c)),
        })),
      clearCart: () => set({ cart: [] }),
      setCartOpen: (cartOpen) => set({ cartOpen }),
    }),
    {
      name: "maison-cart",
      partialize: (s) => ({ cart: s.cart }),
    },
  ),
);

export const cartCount = (items: CartItem[]) => items.reduce((n, c) => n + c.qty, 0);
export const cartTotal = (items: CartItem[]) =>
  items.reduce((n, c) => n + c.qty * c.product.price, 0);
