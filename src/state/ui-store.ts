import { create } from "zustand";
import {
  CollapsedGroupKeySchema,
  type CourseCode,
  clampSidebarWidth,
  DEFAULT_UI_PREFS,
  type DrillTarget,
  type Plan,
  type RailTab,
  type SectionKey,
  type TermId,
  type Theme,
  type UiPrefs,
} from "~/core/schema";

// Shell state that isn't the URL's: whether the sidebar shows, theme and
// term, the drawer, hover and preview. Which tab and drill-in are on screen
// is the URL's alone (each is a route: src/app/README.md, "URL state"); the
// store only remembers the last one for the next visit. The persisted part
// is `UiPrefs` (DATA.md §5; the active plan per term lives in the workspace
// store with the plans).

export type DrawerSnap = "peek" | "half" | "full";

/** A request for a panel to focus something, e.g. `/` focusing the search box. */
export interface FocusRequest {
  tab: RailTab;
  seq: number;
}

export interface UiState {
  /**
   * The tab and drill-in last on screen, saved for the next visit: a plain
   * `/schedule` opens them (SPEC §3.13). Never read for what's on screen now;
   * that's the URL's.
   */
  lastTab: RailTab;
  lastDrill: DrillTarget | null;
  sidebarOpen: boolean;
  theme: Theme;
  lastTermId: TermId | null;
  collapsedGroups: readonly string[];
  /** The desktop sidebar's width in px, 320–480 (`--sidebar-width`). */
  sidebarWidth: number;
  focusRequest: FocusRequest | null;
  /** Mobile bottom drawer position (not persisted). */
  drawerSnap: DrawerSnap;
  /**
   * Local state (plans, prefs, the demo) has loaded, so the URL can be
   * followed without being undone. Not persisted.
   */
  restored: boolean;
  /**
   * A course whose sections the calendar shows as ghosts while the pointer
   * rests on it outside course details, e.g. a search result (SPEC §3.5).
   * Set on hover, clear on leave. Not persisted.
   */
  hoverCourse: CourseCode | null;
  /**
   * A section drawn solid on the calendar as a preview (SPEC §3.3): a
   * hovered ghost, a hovered section row in course details, or ↑/↓.
   * Not persisted.
   */
  previewSection: SectionKey | null;
  /**
   * A whole plan shown on the calendar in place of the open one, read-only:
   * a generated result being previewed (SPEC §3.9). Not persisted.
   */
  previewPlan: PlanPreview | null;

  setSidebarOpen: (open: boolean) => void;
  setTheme: (theme: Theme) => void;
  setLastTermId: (termId: TermId) => void;
  toggleGroup: (key: string) => void;
  /** Clamped to 320–480px. A drag commits once, on release. */
  setSidebarWidth: (px: number) => void;
  requestFocus: (tab: RailTab) => void;
  setDrawerSnap: (snap: DrawerSnap) => void;
  setHoverCourse: (courseCode: CourseCode | null) => void;
  setPreviewSection: (key: SectionKey | null) => void;
  setPreviewPlan: (preview: PlanPreview | null) => void;
}

/** What the calendar needs to preview a plan that isn't saved. */
export interface PlanPreview {
  plan: Plan;
  /** "Previewing <label>." in the strip above the grid: "result 3". */
  label: string;
}

let focusSeq = 0;

export const INITIAL_UI_STATE = {
  lastTab: DEFAULT_UI_PREFS.tab,
  lastDrill: DEFAULT_UI_PREFS.drill,
  sidebarOpen: DEFAULT_UI_PREFS.sidebarOpen,
  theme: DEFAULT_UI_PREFS.theme,
  lastTermId: DEFAULT_UI_PREFS.lastTermId,
  collapsedGroups: DEFAULT_UI_PREFS.collapsedGroups,
  sidebarWidth: DEFAULT_UI_PREFS.sidebarWidth,
  focusRequest: null,
  drawerSnap: "peek",
  restored: false,
  hoverCourse: null,
  previewSection: null,
  previewPlan: null,
} satisfies Partial<UiState>;

export const useUi = create<UiState>()((set, get) => ({
  ...INITIAL_UI_STATE,

  setSidebarOpen: (sidebarOpen) => {
    if (get().sidebarOpen !== sidebarOpen) set({ sidebarOpen });
  },
  setTheme: (theme) => set({ theme }),
  setLastTermId: (lastTermId) => {
    if (get().lastTermId !== lastTermId) set({ lastTermId });
  },
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
  setSidebarWidth: (px) => {
    const sidebarWidth = clampSidebarWidth(px);
    if (get().sidebarWidth !== sidebarWidth) set({ sidebarWidth });
  },
  requestFocus: (tab) => set({ focusRequest: { tab, seq: ++focusSeq } }),
  setDrawerSnap: (drawerSnap) => set({ drawerSnap }),
  setHoverCourse: (hoverCourse) => {
    if (get().hoverCourse !== hoverCourse) set({ hoverCourse });
  },
  setPreviewSection: (previewSection) => {
    if (get().previewSection !== previewSection) set({ previewSection });
  },
  setPreviewPlan: (previewPlan) => set({ previewPlan }),
}));

/** The persisted part of the UI state, minus the per-term active plans. */
export function uiPrefsOf(s: UiState): Omit<UiPrefs, "activePlanByTerm"> {
  return {
    tab: s.lastTab,
    sidebarOpen: s.sidebarOpen,
    drill: s.lastDrill,
    theme: s.theme,
    lastTermId: s.lastTermId,
    collapsedGroups: [...s.collapsedGroups],
    sidebarWidth: s.sidebarWidth,
  };
}
