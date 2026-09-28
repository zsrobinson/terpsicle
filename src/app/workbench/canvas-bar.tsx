import { cn } from "cn";
import type { ReactNode } from "react";

// The strip across the top of a workbench's canvas, the same in Schedule and
// Plan: Share at its left (the owner's "top left"), then whatever the canvas
// is saying right now (Schedule's "Showing every section of CMSC351…").
// It keeps one height, so a hint coming and going never moves the canvas.

export function CanvasBar({
  start,
  children,
  className,
}: {
  /** The canvas's own actions: Share. */
  start: ReactNode;
  /** A one-line hint, or nothing. */
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-canvas-bar=""
      className={cn(
        "flex h-10 shrink-0 items-center gap-3 border-hairline border-b bg-panel px-2 text-sm max-md:h-12",
        className,
      )}
    >
      <div className="flex shrink-0 items-center gap-1.5">{start}</div>
      {children ? (
        <>
          <span
            aria-hidden="true"
            className="h-4 shrink-0 border-hairline-strong border-l"
          />
          <div className="flex min-w-0 flex-1 items-center">{children}</div>
        </>
      ) : null}
    </div>
  );
}
