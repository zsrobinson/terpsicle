import { create } from "zustand";
import {
  CollapsedGroupKeySchema,
  type CourseCode,
  clampSidebarWidth,
  DEFAULT_UI_PREFS,
  type Plan,
  type RailTab,
  type SectionKey,
  type TermId,
  type Theme,
  type UiPrefs,
} from "~/core/schema";
import { type DrillEntry, sameDrillSubject } from "./drill";

// Shell state: which tab is open, whether the sidebar shows, the drill-in
// stack, theme and term. The persisted part is `UiPrefs` (DATA.md §5; the
// active plan per term lives in the workspace store with the plans). The
// drill stack is remembered as its top entry, when that's restorable.
//
// Where you are is also in the URL (src/app/README.md, "URL state"):
// `src/app/schedule-url.ts` writes these fields to it and follows it back.
// Actions that go somewhere bump `navSeq`, so that write adds a history
// entry; anything else replaces the current one.

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
  /** The desktop sidebar's width in px, 320–480 (`--sidebar-width`). */
  sidebarWidth: number;
  focusRequest: FocusRequest | null;
  /** Mobile bottom drawer position (not persisted). */
  drawerSnap: DrawerSnap;
  /**
   * Counts moves someone made (a tab, a drill-in, Back, a term): each one
   * becomes its own browser history entry. Not persisted.
   */
  navSeq: number;
  /**
   * Local state (plans, prefs, the demo) has loaded, so the URL can be
   * followed without being undone. Not persisted.
   */
  restored: boolean;
  /**
   * The view the browser's Back returns to, when it's one of ours: its
   * short name labels the sidebar's Back ("‹ Search"). Null on the first
   * entry, or without a URL (tests). Not persisted.
   */
  historyBack: { label: string; mono: boolean } | null;
  /**
   * Whether the person has opened a tab, drilled in or gone back since the
   * page loaded (not persisted). See `restoreNavigation`.
   */
  navigated: boolean;
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
  /**
   * Closes the top view, showing the one under it. A new place, so it
   * pushes; the Back control and `Esc` use `goBack` (`~/app/actions`), which
   * returns through history instead. False when already at the tab's root.
   */
  back: () => boolean;
  /** Closes views down to `depth`: 0 is the tab itself. */
  backTo: (depth: number) => void;
  /** Counts the next URL change as a move (see `navSeq`). */
  markNavigation: () => void;
  /** Shows what a URL entry says (Back, Forward, a link), without pushing. */
  followUrl: (target: UrlTarget) => void;
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

/** Where a URL entry says the sidebar is. */
export interface UrlTarget {
  tab: RailTab;
  drill: DrillEntry | null;
  lastTermId: TermId | null;
  /** Back and Forward keep the views they return to mounted (scroll, text). */
  direction: "back" | "forward" | "other";
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
  sidebarWidth: DEFAULT_UI_PREFS.sidebarWidth,
  focusRequest: null,
  drawerSnap: "peek",
  navSeq: 0,
  restored: false,
  historyBack: null,
  navigated: false,
  hoverCourse: null,
  previewSection: null,
  previewPlan: null,
} satisfies Partial<UiState>;

export const useUi = create<UiState>()((set, get) => ({
  ...INITIAL_UI_STATE,

  clickTab: (tab) => {
    const s = get();
    const navSeq = s.navSeq + 1;
    if (tab !== s.tab || !s.sidebarOpen) {
      set({ tab, sidebarOpen: true, stack: [], navigated: true, navSeq });
      return "opened";
    }
    if (s.stack.length > 0) {
      set({ stack: [], navigated: true, navSeq });
      return "back-to-root";
    }
    set({ sidebarOpen: false, navigated: true });
    return "collapsed";
  },

  openTab: (tab) =>
    set({
      tab,
      sidebarOpen: true,
      stack: [],
      navigated: true,
      navSeq: get().navSeq + 1,
    }),

  drill: (entry) => {
    const { stack, navSeq } = get();
    const top = stack.at(-1);
    if (top && sameDrillSubject(top, entry)) {
      if (top !== entry) set({ stack: [...stack.slice(0, -1), entry] });
      set({ sidebarOpen: true, navigated: true });
      return;
    }
    set({
      stack: mountable([...stack, entry]),
      sidebarOpen: true,
      navigated: true,
      navSeq: navSeq + 1,
    });
  },

  replaceDrill: (entry) => {
    const { stack } = get();
    set({ stack: [...stack.slice(0, -1), entry], navigated: true });
  },

  back: () => {
    const { stack, navSeq } = get();
    if (stack.length === 0) return false;
    set({ stack: stack.slice(0, -1), navigated: true, navSeq: navSeq + 1 });
    return true;
  },

  backTo: (depth) =>
    set({
      stack: get().stack.slice(0, Math.max(0, depth)),
      navigated: true,
      navSeq: get().navSeq + 1,
    }),

  markNavigation: () => set({ navSeq: get().navSeq + 1 }),

  followUrl: ({ tab, drill, lastTermId, direction }) => {
    const s = get();
    // Another tab or term: the views over the old one don't apply.
    const stack =
      tab !== s.tab || lastTermId !== s.lastTermId
        ? drill
          ? [drill]
          : []
        : stackFollowing(s.stack, drill, direction);
    if (tab === s.tab && lastTermId === s.lastTermId && stack === s.stack)
      return;
    set({
      tab,
      stack,
      lastTermId,
      // A place the URL names is one you can see.
      sidebarOpen: true,
      navigated: true,
    });
  },

  setTheme: (theme) => set({ theme }),
  setLastTermId: (lastTermId) =>
    set({ lastTermId, stack: [], navSeq: get().navSeq + 1 }),
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

/**
 * Drill-in levels kept mounted under the top one, so Back finds them as they
 * were. Past this, the oldest are dropped (they reopen fresh).
 */
export const MOUNTED_DRILLS = 6;

function mountable(stack: readonly DrillEntry[]): readonly DrillEntry[] {
  return stack.length > MOUNTED_DRILLS ? stack.slice(-MOUNTED_DRILLS) : stack;
}

/**
 * The drill-in stack after following a URL entry to `target` within the same
 * tab: Back returns to a level still mounted (the views above it close),
 * Forward stacks the view again, anything else shows just that view. The
 * same subject keeps its entry, and so its details sub-tab.
 */
export function stackFollowing(
  stack: readonly DrillEntry[],
  target: DrillEntry | null,
  direction: UrlTarget["direction"],
): readonly DrillEntry[] {
  if (!target) return stack.length === 0 ? stack : [];
  const top = stack.at(-1);
  if (top && sameDrillSubject(top, target)) return stack;
  if (direction === "back") {
    for (let i = stack.length - 2; i >= 0; i--) {
      const level = stack[i];
      if (level && sameDrillSubject(level, target))
        return stack.slice(0, i + 1);
    }
  }
  if (direction === "forward") return mountable([...stack, target]);
  return [target];
}

/** Where the sidebar is: its tab, whether it shows, and the drill-in stack. */
export type Navigation = Pick<UiState, "tab" | "sidebarOpen" | "stack">;

/**
 * Puts the sidebar where saved (or demo) state says, unless the person has
 * already moved it. The shell takes input as soon as it shows, a moment
 * before that state loads, and loading it mustn't undo a tab tapped or a `/`
 * pressed meanwhile.
 */
export function restoreNavigation(navigation: Partial<Navigation>): void {
  if (useUi.getState().navigated) return;
  useUi.setState(navigation);
}

/** The course opened in the sidebar (the innermost course drill-in), if any. */
export function selectOpenCourse(s: UiState): CourseCode | null {
  const top = s.stack.at(-1);
  return top?.kind === "course" ? top.courseCode : null;
}

/**
 * The course whose sections the calendar shows as ghosts: a hovered search
 * result first, else the course open in the sidebar.
 */
export function selectGhostCourse(s: UiState): CourseCode | null {
  return s.hoverCourse ?? selectOpenCourse(s);
}

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
    sidebarWidth: s.sidebarWidth,
  };
}
