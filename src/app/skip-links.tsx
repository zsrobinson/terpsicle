import type { MouseEvent } from "react";
import { useUi } from "~/state/ui-store";
import { WithTooltip } from "~/ui/tooltip";
import { SIDEBAR_PANEL_ID } from "./sidebar";

// The first stops for a keyboard: jump past the top bar (and the rail) to the
// calendar or the open panel. Hidden until focused. Real in-page links, with
// the focusing done here so the URL doesn't change.

export const CALENDAR_MAIN_ID = "calendar";

const linkClass =
  "sr-only rounded-md bg-raised px-3 py-1.5 font-medium text-[12.5px] shadow-pop focus:not-sr-only focus:fixed focus:top-2 focus:z-50";

function toCalendar(event: MouseEvent) {
  event.preventDefault();
  document.getElementById(CALENDAR_MAIN_ID)?.focus();
}

function toSidebar(event: MouseEvent) {
  event.preventDefault();
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
    <>
      <WithTooltip label="Jump past the top bar to the calendar">
        <a
          href={`#${CALENDAR_MAIN_ID}`}
          className={`${linkClass} focus:left-2`}
          onClick={toCalendar}
        >
          Skip to calendar
        </a>
      </WithTooltip>
      <WithTooltip label="Jump past the top bar to the open panel">
        <a
          href={`#${SIDEBAR_PANEL_ID}`}
          className={`${linkClass} focus:left-40`}
          onClick={toSidebar}
        >
          Skip to sidebar
        </a>
      </WithTooltip>
    </>
  );
}
