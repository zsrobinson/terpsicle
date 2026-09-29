import { cn } from "cn";
import type { ReactNode } from "react";

// What the canvas is saying right now (Schedule's "Showing every section of
// CMSC351…"), as a small card floating over the top of the canvas, just
// under the calendar's day names: never a second bar under the family bar
// (docs/decisions.md, "One bar at the top"). It floats, so it coming and
// going never moves the canvas; the calendar scrolls what it shows clear of
// it (`data-canvas-hint`). Its width is set, not its content's, so a hint's
// container queries (`@xl:` and up) see the room it has.

export function CanvasHint({
  children,
  className,
}: {
  /** A one-line hint (two on a phone). */
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-canvas-hint=""
      className={cn(
        "@container/canvas pointer-events-auto flex w-[min(100%,44rem)] items-center border border-keyline bg-raised px-3 py-1.5 text-sm shadow-pop max-md:px-2.5",
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 items-center">{children}</div>
    </div>
  );
}
