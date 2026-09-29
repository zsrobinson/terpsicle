import { cn } from "cn";
import type { ReactNode } from "react";

// The strip across the top of a workbench's canvas while it has something
// to say (Schedule's "Showing every section of CMSC351…"), and only then:
// it isn't a standing bar, since Share moved into the family bar
// (docs/decisions.md, "One bar at the top"). It keeps one height, so its
// words changing never move the canvas.

export function CanvasBar({
  children,
  className,
}: {
  /** A one-line hint. */
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-canvas-bar=""
      className={cn(
        "@container/canvas flex h-10 shrink-0 items-center gap-3 border-hairline border-b bg-panel px-3 text-sm max-md:h-12",
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 items-center">{children}</div>
    </div>
  );
}
