import type { PlanTab } from "~/core/schema";
import { CLOSE_DRILL, isDrilled, type PlanNav } from "./model";
import { focusSearch } from "./search-panel";
import { usePlanWorkbench } from "./workbench-store";

// Moving between Plan's views, as the scheduler's rail and drawer do
// (src/app/actions.ts `clickRailTab`, mobile-drawer.tsx `tapTab`). A view
// is a route, so each move is a navigation; the sidebar and drawer follow.

/** Goes to a view, closing any course open over it; Search takes focus. */
function go(nav: PlanNav, tab: PlanTab): void {
  if (tab !== nav.search.tab || isDrilled(nav.search))
    nav.go({ tab, ...CLOSE_DRILL });
  if (tab === "search") focusSearch();
}

/** A shortcut, or the bar's problem count: the view, where it can be seen. */
export function openView(nav: PlanNav, tab: PlanTab): void {
  const ui = usePlanWorkbench.getState();
  ui.setSidebarOpen(true);
  if (ui.drawerSnap === "peek") ui.setDrawerSnap("half");
  go(nav, tab);
}

/**
 * A click on the rail: another view opens it; the open view collapses the
 * sidebar, or first closes the course open over it; a collapsed sidebar
 * reopens.
 */
export function clickRailView(nav: PlanNav, tab: PlanTab): void {
  const ui = usePlanWorkbench.getState();
  if (tab !== nav.search.tab || !ui.sidebarOpen) {
    ui.setSidebarOpen(true);
    go(nav, tab);
  } else if (isDrilled(nav.search)) nav.go(CLOSE_DRILL);
  else ui.setSidebarOpen(false);
}

/** A tap on the drawer's strip: the open view lowers the drawer, like the rail. */
export function tapDrawerView(nav: PlanNav, tab: PlanTab): void {
  const ui = usePlanWorkbench.getState();
  if (tab === nav.search.tab && ui.drawerSnap !== "peek") {
    if (isDrilled(nav.search)) nav.go(CLOSE_DRILL);
    else ui.setDrawerSnap("peek");
    return;
  }
  go(nav, tab);
  if (usePlanWorkbench.getState().drawerSnap === "peek")
    ui.setDrawerSnap("half");
}
