import { useEffect } from "react";
import { create } from "zustand";
import {
  clampSidebarWidth,
  type DrawerSnap,
  SIDEBAR_WIDTH,
} from "~/core/schema";
import { SIDEBAR_WIDTH_STORAGE_KEY } from "~/lib/sidebar-width";

// Todo's workbench state: the sidebar's width on a desktop, where the
// phone's drawer rests, and whether ELMS's settings are open. The width is
// the one every workbench shares (CONTEXT.md, "sidebar width"), kept in the
// scheduler's `UiPrefs`. `/todo` doesn't load Dexie up front
// (scripts/check-bundle.ts), so it reads the width from the localStorage
// copy the head script draws from, and loads the database only to save a
// new one, as the prefs do (~/features/prefs/save).

export interface TodoWorkbenchState {
  /** The saved width, or null until it's read. */
  sidebarWidth: number | null;
  drawerSnap: DrawerSnap;
  /** ELMS's settings, open from its icon or the first visit's Connect ELMS. */
  elmsOpen: boolean;
  setSidebarWidth: (px: number) => void;
  setDrawerSnap: (snap: DrawerSnap) => void;
}

export const useTodoWorkbench = create<TodoWorkbenchState>()((set) => ({
  sidebarWidth: null,
  drawerSnap: "peek",
  elmsOpen: false,
  setSidebarWidth: (px) => {
    const sidebarWidth = clampSidebarWidth(px);
    set({ sidebarWidth });
    void saveWidth(sidebarWidth);
  },
  setDrawerSnap: (drawerSnap) => set({ drawerSnap }),
}));

/** Opens ELMS's settings (a popover in the sidebar, a sheet on a phone). */
export function openElmsSettings(open = true): void {
  useTodoWorkbench.setState({ elmsOpen: open });
}

/** The drawer's snap now, for events between renders. */
export function todoDrawerSnap(): DrawerSnap {
  return useTodoWorkbench.getState().drawerSnap;
}

/** The copy of the saved width, or the default when there's none. */
export function storedSidebarWidth(): number {
  try {
    const px = Number(window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY));
    return px === 0 ? SIDEBAR_WIDTH.default : clampSidebarWidth(px);
  } catch {
    return SIDEBAR_WIDTH.default;
  }
}

async function saveWidth(px: number): Promise<void> {
  try {
    const [{ TerpsicleDb }, { writeSidebarWidth }] = await Promise.all([
      import("~/state/db"),
      import("~/state/sidebar-width-pref"),
    ]);
    const db = new TerpsicleDb();
    await writeSidebarWidth(db, px);
    db.close();
  } catch (error) {
    // The width still applies, and its copy is kept (applySidebarWidth).
    console.error(error);
  }
}

/**
 * Reads the width as the workbench opens, and forgets it (the scheduler may
 * change it before the next visit) and ELMS's open settings as it closes.
 */
export function useTodoWorkbenchMounted(): void {
  useEffect(() => {
    useTodoWorkbench.setState({ sidebarWidth: storedSidebarWidth() });
    return () =>
      useTodoWorkbench.setState({ sidebarWidth: null, elmsOpen: false });
  }, []);
}
