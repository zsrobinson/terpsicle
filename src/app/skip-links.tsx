import { useUi } from "~/state/ui-store";
import { SIDEBAR_PANEL_ID } from "./sidebar";
import { SkipLinks as WorkbenchSkipLinks } from "./workbench/skip-links";

// The scheduler's skip links (./workbench/skip-links): to the calendar, or
// to the open panel, opening a collapsed sidebar or resting drawer first.

export const CALENDAR_MAIN_ID = "calendar";

function toSidebar() {
  const ui = useUi.getState();
  // A collapsed sidebar or resting drawer opens so there's something to reach.
  if (!ui.sidebarOpen) useUi.setState({ sidebarOpen: true });
  if (ui.drawerSnap === "peek") ui.setDrawerSnap("half");
  // After the sidebar renders open.
  requestAnimationFrame(() =>
    document
      .querySelector<HTMLElement>(
        `#${SIDEBAR_PANEL_ID} > [data-layer][data-active]`,
      )
      ?.focus(),
  );
}

export function SkipLinks() {
  return (
    <WorkbenchSkipLinks
      canvasId={CALENDAR_MAIN_ID}
      canvasName="calendar"
      sidebarId={SIDEBAR_PANEL_ID}
      onSidebar={toSidebar}
    />
  );
}
