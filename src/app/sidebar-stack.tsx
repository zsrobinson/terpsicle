import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { DrillEntry } from "~/state/drill";
import { useUi } from "~/state/ui-store";
import { followStack, type StackMove } from "./drill-stack";
import { setMountedDrills } from "./schedule-nav";
import {
  type ScheduleView,
  useLatestLocation,
  useScheduleView,
  useViewInUrl,
} from "./schedule-view";

// The sidebar's place, from the URL, and the drill-in views it keeps
// mounted under the top one. The router's history index says how the URL
// moved: a lower index is Back, a higher one Forward or a new entry, the
// same one a replace (drill-stack.ts decides what that does to the views).

export interface SidebarStack {
  view: ScheduleView;
  /** Drill-in views mounted over the tab, innermost last (the URL's on top). */
  stack: readonly DrillEntry[];
}

const SidebarStackContext = createContext<SidebarStack | null>(null);

interface Followed extends SidebarStack {
  index: number;
}

function historyIndex(state: unknown): number {
  const index = (state as { __TSR_index?: unknown } | null)?.__TSR_index;
  return typeof index === "number" ? index : 0;
}

export function SidebarStackProvider({ children }: { children: ReactNode }) {
  const view = useScheduleView();
  const inUrl = useViewInUrl();
  const index = historyIndex(useLatestLocation().state);
  const [followed, setFollowed] = useState<Followed>(() => ({
    view,
    index,
    stack: view.drill ? [view.drill] : [],
  }));

  // Following the URL while rendering, so a drill-in and the views under it
  // change in the same frame.
  let current = followed;
  if (followed.view !== view) {
    const move: StackMove =
      view.tab !== followed.view.tab
        ? "reset"
        : index < followed.index
          ? "back"
          : index > followed.index
            ? "push"
            : "replace";
    current = {
      view,
      index,
      stack: followStack(followed.stack, view.drill, move),
    };
    setFollowed(current);
  }

  useEffect(() => setMountedDrills(current.stack), [current.stack]);

  // A place the URL names is one you can see: moving to another view opens
  // a collapsed sidebar. A plain `/schedule` opening the saved view doesn't.
  const place = JSON.stringify([view.tab, view.drill]);
  const drilled = view.drill !== null;
  const last = useRef<{ place: string; inUrl: boolean } | null>(null);
  useEffect(() => {
    const before = last.current;
    last.current = { place, inUrl };
    if (!inUrl || before?.place === place) return;
    if (before ? before.inUrl : drilled) useUi.getState().setSidebarOpen(true);
  }, [place, inUrl, drilled]);

  return (
    <SidebarStackContext.Provider value={current}>
      {children}
    </SidebarStackContext.Provider>
  );
}

/** The sidebar's view and its mounted drill-in stack. */
export function useSidebarStack(): SidebarStack {
  const value = useContext(SidebarStackContext);
  if (!value) throw new Error("useSidebarStack outside SidebarStackProvider");
  return value;
}
