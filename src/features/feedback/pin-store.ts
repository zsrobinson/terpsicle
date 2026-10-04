import { create } from "zustand";

// The admin's pinned notes on this page (docs/FEEDBACK.md): whether the
// dots show (remembered in this browser) and whether the picker is on. The
// pins themselves are a query (./pin-queries).

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
  setVisible: (visible: boolean) => void;
  setPicking: (picking: boolean) => void;
}

export const usePins = create<PinState>()((set) => ({
  visible: readVisible(),
  picking: false,
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
}));
