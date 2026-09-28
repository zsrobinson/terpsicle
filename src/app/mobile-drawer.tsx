import { useEffect, useRef } from "react";
import type { RailTab } from "~/core/schema";
import { useCurrentPlan } from "~/state/hooks";
import { type DrawerSnap, useUi } from "~/state/ui-store";
import { openTab } from "./actions";
import { ProblemBadge } from "./rail";
import { closeToTab, currentView, preloadView } from "./schedule-nav";
import { SIDEBAR_PANEL_ID, SidebarContent } from "./sidebar";
import { useSidebarStack } from "./sidebar-stack";
import { TABS } from "./tabs";
import { DrawerTab, DrawerTabs, WorkbenchDrawer } from "./workbench/drawer";

// Phones (SPEC §2): the scheduler's sidebar in the workbench's bottom drawer,
// with the rail as its tab strip. What moves it on its own is the
// scheduler's: opening a tab or a drill-in raises it, reading a course on
// the calendar keeps the calendar in view, and a first visit shows its guide.

const getSnap = (): DrawerSnap => useUi.getState().drawerSnap;

export function MobileDrawer() {
  const snap = useUi((s) => s.drawerSnap);
  const setSnap = useUi((s) => s.setDrawerSnap);
  const { view, stack } = useSidebarStack();
  const tab = view.tab;
  const depth = stack.length;
  useCalendarStaysVisible(depth, stack.at(-1)?.kind);

  // Opening a tab or drilling in from elsewhere (a shortcut, the calendar)
  // raises a resting drawer so the result is visible. So does arriving on
  // a drill-in (a seat-alert email's link), which the URL names from the
  // first render: from nothing drilled in, that's deeper too. So does
  // arriving on any tab but Courses (a link to Search with its text, or to
  // Problems): the link named it to show it. Courses keeps the calendar.
  const last = useRef<{ tab: RailTab; depth: number }>({
    tab: "courses",
    depth: 0,
  });
  useEffect(() => {
    const changed = last.current.tab !== tab || depth > last.current.depth;
    last.current = { tab, depth };
    if (changed && useUi.getState().drawerSnap === "peek") setSnap("half");
  }, [tab, depth, setSnap]);

  // A plan with nothing placed has nothing on its calendar, and the Courses
  // tab has the first-visit guide (and any bookmarks, as when Plan's "View
  // schedule" makes the plan): open far enough to show it, once, on arrival.
  // Half when it fits there (most phones), full on short screens.
  const empty =
    useCurrentPlan()?.plan.courses.every((c) => c.sectionCode === null) ===
    true;
  const greeted = useRef(false);
  useEffect(() => {
    if (!empty || greeted.current) return;
    greeted.current = true;
    const here = currentView();
    if (
      here.tab !== "courses" ||
      here.drill ||
      useUi.getState().drawerSnap !== "peek"
    )
      return;
    setSnap("half");
    // Measure once the half-height panel has laid out.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const body = document.querySelector(
          `#${SIDEBAR_PANEL_ID} > [data-layer][data-active] [data-panel-body]`,
        );
        if (!body) return;
        // Every way in (the guide's buttons) on screen; padding may overflow.
        // Both move with the drawer's slide, so compare them to each other.
        const bottom = body.getBoundingClientRect().bottom;
        const cut = [...body.querySelectorAll("button")].some(
          (b) => b.getBoundingClientRect().bottom > bottom + 1,
        );
        if (cut) setSnap("full");
      }),
    );
  }, [empty, setSnap]);

  return (
    <WorkbenchDrawer
      snap={snap}
      getSnap={getSnap}
      onSnap={setSnap}
      title="Sidebar"
      tabs={<ScheduleDrawerTabs />}
    >
      <SidebarContent />
    </WorkbenchDrawer>
  );
}

/** A tap on the open tab lowers the drawer, like the rail collapsing the sidebar. */
function tapTab(tab: RailTab): void {
  const ui = useUi.getState();
  const view = currentView();
  if (tab === view.tab && ui.drawerSnap !== "peek") {
    if (view.drill) closeToTab();
    else ui.setDrawerSnap("peek");
    return;
  }
  openTab(tab, "click");
  if (useUi.getState().drawerSnap === "peek") ui.setDrawerSnap("half");
}

/**
 * Course details and a generated plan are read on the calendar: every
 * section as a ghost, or the plan previewed (docs/UX-REVIEW.md §3.6). Opening
 * one while the drawer is full lowers it to half, so the calendar shows.
 */
const READ_ON_THE_CALENDAR = new Set(["course", "generated-plan"]);

function useCalendarStaysVisible(depth: number, top: string | undefined) {
  const last = useRef(depth);
  useEffect(() => {
    const deeper = depth > last.current;
    last.current = depth;
    const ui = useUi.getState();
    if (deeper && top && READ_ON_THE_CALENDAR.has(top))
      if (ui.drawerSnap === "full") ui.setDrawerSnap("half");
  }, [depth, top]);
}

function ScheduleDrawerTabs() {
  const current = useSidebarStack().view.tab;
  return (
    <DrawerTabs label="Tabs">
      {TABS.map((t) => (
        <DrawerTab
          key={t.id}
          icon={t.icon}
          label={t.label}
          shortcut={t.shortcut}
          selected={t.id === current}
          onClick={() => tapTab(t.id)}
          // A touch fires pointerdown well before the tap's click: the
          // router starts loading the tab's route chunk then.
          onPreload={() => preloadView({ tab: t.id, drill: null })}
          badge={
            t.id === "problems" ? <ProblemBadge className="right-1" /> : null
          }
        />
      ))}
    </DrawerTabs>
  );
}
