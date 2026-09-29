import type { MouseEvent } from "react";
import { WithTooltip } from "~/ui/tooltip";

// A workbench's first stops for a keyboard: jump past the bar (and the rail)
// to the canvas or the open panel. Hidden until focused. Real in-page links,
// with the focusing done here so the URL doesn't change.

const linkClass =
  "sr-only border border-keyline bg-raised px-3 py-1.5 font-medium text-base shadow-pop focus:not-sr-only focus:fixed focus:top-2 focus:z-50";

export function SkipLinks({
  canvasId,
  canvasName,
  sidebarId,
  onSidebar,
}: {
  /** The canvas's element, which takes focus. */
  canvasId: string;
  /** "calendar", "semesters". */
  canvasName: string;
  /** The open panel's element, the link's target (none on Todo, which has no sidebar). */
  sidebarId?: string;
  /** Opens a collapsed sidebar or resting drawer, then focuses the panel. */
  onSidebar?: () => void;
}) {
  const toCanvas = (event: MouseEvent) => {
    event.preventDefault();
    document.getElementById(canvasId)?.focus();
  };
  const toSidebar = (event: MouseEvent) => {
    event.preventDefault();
    onSidebar?.();
  };
  return (
    <>
      <WithTooltip label={`Jump past the top bar to the ${canvasName}`}>
        <a
          href={`#${canvasId}`}
          className={`${linkClass} focus:left-2`}
          onClick={toCanvas}
        >
          Skip to {canvasName}
        </a>
      </WithTooltip>
      {sidebarId ? (
        <WithTooltip label="Jump past the top bar to the open panel">
          <a
            href={`#${sidebarId}`}
            className={`${linkClass} focus:left-40`}
            onClick={toSidebar}
          >
            Skip to sidebar
          </a>
        </WithTooltip>
      ) : null}
    </>
  );
}
