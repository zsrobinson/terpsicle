import { create } from "zustand";
import { MOBILE_QUERY } from "~/app/use-media-query";
import { clampSidebarWidth } from "~/core/schema";
import { writeSidebarWidth } from "~/state/sidebar-width-pref";
// A type only: Plan never loads the scheduler's UI store.
import type { DrawerSnap } from "~/state/ui-store";
import { fourYearDb } from "./data";

// Plan's workbench (src/app/workbench): whether its sidebar shows, where
// the phone drawer rests, and the sidebar's width, which is the scheduler's
// too. Which view is open is the URL's alone. The sidebar and drawer start
// fresh on each visit; only the width is saved.

export type PlanWorkbenchState = {
  sidebarOpen: boolean;
  drawerSnap: DrawerSnap;
  /** The saved width; null until it's read. */
  sidebarWidth: number | null;
  setSidebarOpen: (open: boolean) => void;
  setDrawerSnap: (snap: DrawerSnap) => void;
  /** Saves a width the person chose. */
  setSidebarWidth: (px: number) => void;
};

export const INITIAL_PLAN_WORKBENCH = {
  sidebarOpen: true,
  drawerSnap: "peek",
  sidebarWidth: null,
} satisfies Partial<PlanWorkbenchState>;

export const usePlanWorkbench = create<PlanWorkbenchState>()((set) => ({
  ...INITIAL_PLAN_WORKBENCH,
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  setDrawerSnap: (drawerSnap) => set({ drawerSnap }),
  setSidebarWidth: (px) => {
    const sidebarWidth = clampSidebarWidth(px);
    set({ sidebarWidth });
    const db = fourYearDb();
    if (db) writeSidebarWidth(db, sidebarWidth).catch(console.error);
  },
}));

/** The drawer's snap now, for events between renders. */
export function planDrawerSnap(): DrawerSnap {
  return usePlanWorkbench.getState().drawerSnap;
}

/** The board's id: skip links and focus land there. */
export const PLAN_BOARD_ID = "plan-board";

/**
 * Shows the semesters, which are the result of what was just done (a
 * sample plan added, a transcript imported): on a phone, the drawer goes
 * down and the board back to its top.
 */
export function showBoard(): void {
  const { drawerSnap, setDrawerSnap } = usePlanWorkbench.getState();
  if (!window.matchMedia(MOBILE_QUERY).matches) return;
  if (drawerSnap !== "peek") setDrawerSnap("peek");
  document.getElementById(PLAN_BOARD_ID)?.scrollTo({ top: 0 });
}
