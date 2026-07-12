"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ConsultationRequest, InspirationBoard, Product, RoomSnapshot } from "./types";

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

  wishlist: Product[];
  toggleWishlist: (product: Product) => void;
  isWishlisted: (productId: string) => boolean;
  clearWishlist: () => void;

  savedDesigns: RoomSnapshot[];
  saveDesign: (design: Omit<RoomSnapshot, "id" | "createdAt" | "sharedWith">) => RoomSnapshot;
  removeDesign: (id: string) => void;
  renameDesign: (id: string, name: string) => void;
  addCollaborator: (designId: string, nameOrEmail: string) => void;
  removeCollaborator: (designId: string, nameOrEmail: string) => void;

  boards: InspirationBoard[];
  createBoard: (name: string) => InspirationBoard;
  deleteBoard: (id: string) => void;
  renameBoard: (id: string, name: string) => void;
  addToBoard: (boardId: string, product: Product) => void;
  removeFromBoard: (boardId: string, productId: string) => void;

  /** Remembered from the last completed order — powers one-click checkout. */
  checkoutDefaults: { delivery: string; installation: string } | null;
  setCheckoutDefaults: (prefs: { delivery: string; installation: string }) => void;

  consultations: ConsultationRequest[];
  requestConsultation: (req: Omit<ConsultationRequest, "id" | "createdAt">) => ConsultationRequest;
}

export const useMaisonStore = create<MaisonStore>()(
  persist(
    (set, get) => ({
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

      wishlist: [],
      toggleWishlist: (product) =>
        set((s) => {
          const on = s.wishlist.some((p) => p.id === product.id);
          return {
            wishlist: on
              ? s.wishlist.filter((p) => p.id !== product.id)
              : [...s.wishlist, product],
          };
        }),
      isWishlisted: (productId) => get().wishlist.some((p) => p.id === productId),
      clearWishlist: () => set({ wishlist: [] }),

      savedDesigns: [],
      saveDesign: (design) => {
        const snapshot: RoomSnapshot = {
          ...design,
          id: `design-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          createdAt: Date.now(),
          sharedWith: [],
        };
        set((s) => ({ savedDesigns: [snapshot, ...s.savedDesigns] }));
        return snapshot;
      },
      removeDesign: (id) =>
        set((s) => ({ savedDesigns: s.savedDesigns.filter((d) => d.id !== id) })),
      renameDesign: (id, name) =>
        set((s) => ({
          savedDesigns: s.savedDesigns.map((d) => (d.id === id ? { ...d, name } : d)),
        })),
      addCollaborator: (designId, nameOrEmail) =>
        set((s) => ({
          savedDesigns: s.savedDesigns.map((d) =>
            d.id === designId && !d.sharedWith.includes(nameOrEmail)
              ? { ...d, sharedWith: [...d.sharedWith, nameOrEmail] }
              : d,
          ),
        })),
      removeCollaborator: (designId, nameOrEmail) =>
        set((s) => ({
          savedDesigns: s.savedDesigns.map((d) =>
            d.id === designId ? { ...d, sharedWith: d.sharedWith.filter((n) => n !== nameOrEmail) } : d,
          ),
        })),

      boards: [],
      createBoard: (name) => {
        const board: InspirationBoard = {
          id: `board-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name,
          createdAt: Date.now(),
          products: [],
        };
        set((s) => ({ boards: [board, ...s.boards] }));
        return board;
      },
      deleteBoard: (id) => set((s) => ({ boards: s.boards.filter((b) => b.id !== id) })),
      renameBoard: (id, name) =>
        set((s) => ({ boards: s.boards.map((b) => (b.id === id ? { ...b, name } : b)) })),
      addToBoard: (boardId, product) =>
        set((s) => ({
          boards: s.boards.map((b) =>
            b.id === boardId && !b.products.some((p) => p.id === product.id)
              ? { ...b, products: [...b.products, product] }
              : b,
          ),
        })),
      removeFromBoard: (boardId, productId) =>
        set((s) => ({
          boards: s.boards.map((b) =>
            b.id === boardId ? { ...b, products: b.products.filter((p) => p.id !== productId) } : b,
          ),
        })),

      checkoutDefaults: null,
      setCheckoutDefaults: (prefs) => set({ checkoutDefaults: prefs }),

      consultations: [],
      requestConsultation: (req) => {
        const request: ConsultationRequest = {
          ...req,
          id: `consult-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          createdAt: Date.now(),
        };
        set((s) => ({ consultations: [request, ...s.consultations] }));
        return request;
      },
    }),
    {
      name: "maison-store",
      partialize: (s) => ({
        cart: s.cart,
        wishlist: s.wishlist,
        savedDesigns: s.savedDesigns,
        boards: s.boards,
        checkoutDefaults: s.checkoutDefaults,
        consultations: s.consultations,
      }),
    },
  ),
);

export const cartCount = (items: CartItem[]) => items.reduce((n, c) => n + c.qty, 0);
export const cartTotal = (items: CartItem[]) =>
  items.reduce((n, c) => n + c.qty * c.product.price, 0);
