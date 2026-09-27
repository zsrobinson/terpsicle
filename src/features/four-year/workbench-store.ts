import { create } from "zustand";
import { snapHeights } from "~/app/drawer-heights";
import { MOBILE_QUERY } from "~/app/use-media-query";
import { clampSidebarWidth, type DrawerSnap } from "~/core/schema";
import { writeSidebarWidth } from "~/state/sidebar-width-pref";

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
  /**
   * The next move to another view keeps the drawer where it is: the move
   * `showBoard` asked for, which would otherwise raise it again.
   */
  keepDrawer: boolean;
  setSidebarOpen: (open: boolean) => void;
  setDrawerSnap: (snap: DrawerSnap) => void;
  /** Saves a width the person chose. */
  setSidebarWidth: (px: number) => void;
};

export const INITIAL_PLAN_WORKBENCH = {
  sidebarOpen: true,
  drawerSnap: "peek",
  sidebarWidth: null,
  keepDrawer: false,
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
 * down and the board back to its top. Call it with the move to GenEd that
 * goes with it, which then leaves the drawer down.
 */
export function showBoard(): void {
  if (!window.matchMedia(MOBILE_QUERY).matches) return;
  usePlanWorkbench.setState({ drawerSnap: "peek", keepDrawer: true });
  document.getElementById(PLAN_BOARD_ID)?.scrollTo({ top: 0 });
}

/**
 * After an add on a phone, what was added, above the drawer (QA P1: a
 * full drawer hid the semester it went to). A full drawer comes down to
 * half, which keeps Search open for the next add, and the board scrolls
 * the new course clear of it. When the board can't scroll that far (the
 * course is at the end of a long semester), the drawer goes down to peek.
 */
export function showAdded(entryId: string | null): void {
  if (!entryId || !window.matchMedia(MOBILE_QUERY).matches) return;
  const ui = usePlanWorkbench.getState();
  if (ui.drawerSnap === "full") ui.setDrawerSnap("half");
  // After the render that draws the new course.
  requestAnimationFrame(() => {
    const board = document.getElementById(PLAN_BOARD_ID);
    const added = board?.querySelector(
      `[data-entry-id="${CSS.escape(entryId)}"]`,
    );
    if (!board || !added) return;
    const under = (snap: DrawerSnap) =>
      added.getBoundingClientRect().bottom -
      (window.innerHeight - snapHeights(window.innerHeight)[snap]) +
      8;
    let by = under(planDrawerSnap());
    if (by <= 0) return;
    const room = board.scrollHeight - board.clientHeight - board.scrollTop;
    if (room < by) {
      usePlanWorkbench.getState().setDrawerSnap("peek");
      by = Math.min(room, under("peek"));
      if (by <= 0) return;
    }
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    board.scrollBy({ top: by, behavior: still ? "auto" : "smooth" });
  });
}
