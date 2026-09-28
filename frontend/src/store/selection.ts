import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { ProductQty } from "../api/types";

interface SelectionState {
  quantities: Record<number, number>;
  toggle: (productId: number) => void;
  setQty: (productId: number, qty: number) => void;
  selectMany: (productIds: number[]) => void;
  deselectMany: (productIds: number[]) => void;
  merge: (items: ProductQty[]) => void;
  clear: () => void;
}

const DEFAULT_QTY = 1;

export const useSelection = create<SelectionState>()(
  persist(
    (set) => ({
      quantities: {},
      toggle: (productId) =>
        set((state) => {
          const next = { ...state.quantities };
          if (productId in next) delete next[productId];
          else next[productId] = DEFAULT_QTY;
          return { quantities: next };
        }),
      setQty: (productId, qty) =>
        set((state) => ({ quantities: { ...state.quantities, [productId]: Math.max(0, Math.floor(qty)) } })),
      selectMany: (productIds) =>
        set((state) => {
          const next = { ...state.quantities };
          for (const id of productIds) next[id] ??= DEFAULT_QTY;
          return { quantities: next };
        }),
      deselectMany: (productIds) =>
        set((state) => {
          const next = { ...state.quantities };
          for (const id of productIds) delete next[id];
          return { quantities: next };
        }),
      merge: (items) =>
        set((state) => {
          const next = { ...state.quantities };
          for (const item of items) next[item.product_id] = item.qty;
          return { quantities: next };
        }),
      clear: () => set({ quantities: {} }),
    }),
    { name: "invoice-selection" },
  ),
);
