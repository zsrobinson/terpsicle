import { create } from "zustand";
import type { Pin } from "~/core/schema/feedback";
import { feedbackApi } from "~/server/fns/feedback-api";

// The admin's pinned notes on this page (docs/FEEDBACK.md): whether the
// dots show (remembered in this browser), whether the picker is on, and the
// pins for the current route.

const HIDDEN_KEY = "terpsicle:feedback-pins-hidden";

function readVisible(): boolean {
  try {
    return localStorage.getItem(HIDDEN_KEY) === null;
  } catch {
    return true;
  }
}

interface PinState {
  visible: boolean;
  picking: boolean;
  pathname: string | null;
  pins: readonly Pin[];
  setVisible: (visible: boolean) => void;
  setPicking: (picking: boolean) => void;
  /** Loads the pins on `pathname`; again after pinning. */
  load: (pathname: string) => Promise<void>;
}

export const usePins = create<PinState>()((set, get) => ({
  visible: readVisible(),
  picking: false,
  pathname: null,
  pins: [],
  setVisible: (visible) => {
    try {
      if (visible) localStorage.removeItem(HIDDEN_KEY);
      else localStorage.setItem(HIDDEN_KEY, "1");
    } catch {
      // Storage blocked: the choice lasts for this page.
    }
    set({ visible });
  },
  setPicking: (picking) => set({ picking }),
  load: async (pathname) => {
    if (get().pathname !== pathname) set({ pathname, pins: [] });
    try {
      const { pins } = await feedbackApi.pins({ pathname });
      if (get().pathname === pathname) set({ pins });
    } catch {
      // No dots is fine: they're a convenience, and the inbox has them all.
    }
  },
}));
