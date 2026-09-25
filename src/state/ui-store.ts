import { create } from "zustand";
import {
  CollapsedGroupKeySchema,
  DEFAULT_UI_PREFS,
  type RailTab,
  type TermId,
  type Theme,
  type UiPrefs,
} from "~/core/schema";
import { type DrillEntry, sameDrillSubject } from "./drill";

// Shell state: which tab is open, whether the sidebar shows, the drill-in
// stack, theme and term. The persisted part is `UiPrefs` (DATA.md §5; the
// active plan per term lives in the workspace store with the plans). The
// drill stack is remembered as its top entry, when that's restorable.

export type DrawerSnap = "peek" | "half" | "full";

/** A request for a panel to focus something, e.g. `/` focusing the search box. */
export interface FocusRequest {
  tab: RailTab;
  seq: number;
}

export interface UiState {
  tab: RailTab;
  sidebarOpen: boolean;
  /** Drill-in levels over the current tab, innermost last. */
  stack: readonly DrillEntry[];
  theme: Theme;
  lastTermId: TermId | null;
  collapsedGroups: readonly string[];
  focusRequest: FocusRequest | null;
  /** Mobile bottom drawer position (not persisted). */
  drawerSnap: DrawerSnap;

  /**
   * A click on a rail tab (SPEC §2): another tab opens it; the open tab
   * collapses the sidebar, or first goes back to the tab's own panel if
   * drilled in; a collapsed sidebar reopens.
   */
  clickTab: (tab: RailTab) => RailClick;
  /** Opens a tab at its root, e.g. from a shortcut. Never collapses. */
  openTab: (tab: RailTab) => void;
  /** Drills into a view over the current tab. Opening what's already on top does nothing. */
  drill: (entry: DrillEntry) => void;
  /** Replaces the innermost view (e.g. switching a course's details sub-tab). */
  replaceDrill: (entry: DrillEntry) => void;
  /** Back one level (`Esc`). Returns false when already at the tab's root. */
  back: () => boolean;
  /** Back to a breadcrumb level: 0 is the tab itself. */
  backTo: (depth: number) => void;
  setTheme: (theme: Theme) => void;
  setLastTermId: (termId: TermId) => void;
  toggleGroup: (key: string) => void;
  requestFocus: (tab: RailTab) => void;
  setDrawerSnap: (snap: DrawerSnap) => void;
}

/** What a rail click did, for analytics. */
export type RailClick = "opened" | "collapsed" | "back-to-root";

let focusSeq = 0;

export const INITIAL_UI_STATE = {
  tab: DEFAULT_UI_PREFS.tab,
  sidebarOpen: DEFAULT_UI_PREFS.sidebarOpen,
  stack: [],
  theme: DEFAULT_UI_PREFS.theme,
  lastTermId: DEFAULT_UI_PREFS.lastTermId,
  collapsedGroups: DEFAULT_UI_PREFS.collapsedGroups,
  focusRequest: null,
  drawerSnap: "peek",
} satisfies Partial<UiState>;

export const useUi = create<UiState>()((set, get) => ({
  ...INITIAL_UI_STATE,

  clickTab: (tab) => {
    const s = get();
    if (tab !== s.tab || !s.sidebarOpen) {
      set({ tab, sidebarOpen: true, stack: [] });
      return "opened";
    }
    if (s.stack.length > 0) {
      set({ stack: [] });
      return "back-to-root";
    }
    set({ sidebarOpen: false });
    return "collapsed";
  },

  openTab: (tab) => set({ tab, sidebarOpen: true, stack: [] }),

  drill: (entry) => {
    const { stack } = get();
    const top = stack.at(-1);
    if (top && sameDrillSubject(top, entry)) {
      if (top !== entry) set({ stack: [...stack.slice(0, -1), entry] });
      set({ sidebarOpen: true });
      return;
    }
    set({ stack: [...stack, entry], sidebarOpen: true });
  },

  replaceDrill: (entry) => {
    const { stack } = get();
    set({ stack: [...stack.slice(0, -1), entry] });
  },

  back: () => {
    const { stack } = get();
    if (stack.length === 0) return false;
    set({ stack: stack.slice(0, -1) });
    return true;
  },

  backTo: (depth) => set({ stack: get().stack.slice(0, Math.max(0, depth)) }),

  setTheme: (theme) => set({ theme }),
  setLastTermId: (lastTermId) => set({ lastTermId, stack: [] }),
  toggleGroup: (key) => {
    const groups = get().collapsedGroups;
    // A malformed key would fail the whole prefs row on the next load.
    if (!CollapsedGroupKeySchema.safeParse(key).success) return;
    set({
      collapsedGroups: groups.includes(key)
        ? groups.filter((g) => g !== key)
        : [...groups, key],
    });
  },
  requestFocus: (tab) => set({ focusRequest: { tab, seq: ++focusSeq } }),
  setDrawerSnap: (drawerSnap) => set({ drawerSnap }),
}));

/** The persisted part of the UI state, minus the per-term active plans. */
export function uiPrefsOf(
  s: UiState,
  drill: UiPrefs["drill"],
): Omit<UiPrefs, "activePlanByTerm"> {
  return {
    tab: s.tab,
    sidebarOpen: s.sidebarOpen,
    drill,
    theme: s.theme,
    lastTermId: s.lastTermId,
    collapsedGroups: [...s.collapsedGroups],
  };
}
