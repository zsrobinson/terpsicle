import { useEffect } from "react";
import { create } from "zustand";
import type { DrawerSnap } from "~/core/schema";

// Todo's workbench state: where the phone's drawer rests, and whether
// ELMS's settings are open. The sidebar's width is the one every workbench
// shares (CONTEXT.md, "sidebar width"), read and saved as Chat's list does
// (~/hooks/use-sidebar-width).

export interface TodoWorkbenchState {
  drawerSnap: DrawerSnap;
  /** ELMS's settings, open from its icon or the first visit's Connect ELMS. */
  elmsOpen: boolean;
  setDrawerSnap: (snap: DrawerSnap) => void;
}

export const useTodoWorkbench = create<TodoWorkbenchState>()((set) => ({
  drawerSnap: "peek",
  elmsOpen: false,
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

/** Forgets ELMS's open settings as the workbench closes. */
export function useTodoWorkbenchMounted(): void {
  useEffect(() => () => useTodoWorkbench.setState({ elmsOpen: false }), []);
}
