import { cn } from "cn";
import {
  type KeyboardEvent,
  type PointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { clampSidebarWidth, SIDEBAR_WIDTH } from "~/core/schema";
import { useUi } from "~/state/ui-store";
import { WithTooltip } from "~/ui/tooltip";
import { applySidebarWidth, setSidebarWidthVar } from "./sidebar-width";

// The desktop sidebar's right edge, draggable from 320 to 480px (the owner:
// "draggable would be sick"). A drag moves `--sidebar-width` once per frame
// and saves once, on release; the calendar is flex-1, so it just reflows.
// Arrow keys, Home and End do the same from the keyboard; a double-click
// goes back to the default. Phones have the drawer instead, so the shell
// only mounts this on desktop.

/** How far one arrow key moves the edge. */
export const SIDEBAR_KEY_STEP = 16;

/** The width a key asks for, or null for keys the handle doesn't use. */
export function sidebarWidthForKey(width: number, key: string): number | null {
  switch (key) {
    case "ArrowLeft":
      return clampSidebarWidth(width - SIDEBAR_KEY_STEP);
    case "ArrowRight":
      return clampSidebarWidth(width + SIDEBAR_KEY_STEP);
    case "Home":
      return SIDEBAR_WIDTH.min;
    case "End":
      return SIDEBAR_WIDTH.max;
    default:
      return null;
  }
}

export function SidebarResizeHandle({ controls }: { controls: string }) {
  const width = useUi((s) => s.sidebarWidth);
  const setWidth = useUi((s) => s.setSidebarWidth);
  const [dragging, setDragging] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; start: number; next: number } | null>(null);
  const frame = useRef(0);

  // The saved width (and every change to it) reaches the layout here.
  useEffect(() => applySidebarWidth(width), [width]);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, start: width, next: width };
    setDragging(true);
    // The pointer can outrun the 8px handle: keep the cursor and stop text
    // selection everywhere until release.
    const root = document.documentElement.style;
    root.cursor = "col-resize";
    root.userSelect = "none";
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    d.next = clampSidebarWidth(d.start + event.clientX - d.x);
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      const next = drag.current?.next;
      if (next === undefined) return;
      setSidebarWidthVar(next);
      ref.current?.setAttribute("aria-valuenow", String(next));
    });
  };

  const endDrag = () => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    cancelAnimationFrame(frame.current);
    frame.current = 0;
    setDragging(false);
    const root = document.documentElement.style;
    root.cursor = "";
    root.userSelect = "";
    // The store saves it; if it's unchanged, put the variable back.
    if (d.next === width) setSidebarWidthVar(width);
    else setWidth(d.next);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const next = sidebarWidthForKey(width, event.key);
    if (next === null) return;
    event.preventDefault();
    event.stopPropagation();
    setWidth(next);
  };

  return (
    <WithTooltip label="Drag to resize · double-click to reset" side="right">
      {/* biome-ignore lint/a11y/useSemanticElements: a focusable window splitter (WAI-ARIA), not an <hr> */}
      <div
        ref={ref}
        role="separator"
        aria-orientation="vertical"
        aria-label="Sidebar width"
        aria-controls={controls}
        aria-valuemin={SIDEBAR_WIDTH.min}
        aria-valuemax={SIDEBAR_WIDTH.max}
        aria-valuenow={width}
        tabIndex={0}
        data-dragging={dragging || undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={endDrag}
        onDoubleClick={() => setWidth(SIDEBAR_WIDTH.default)}
        onKeyDown={onKeyDown}
        className="group -right-1 absolute inset-y-0 z-30 w-2 cursor-col-resize touch-none outline-none"
      >
        {/* Sits on the sidebar's own hairline; shows only on hover, focus or drag. */}
        <span
          aria-hidden="true"
          className={cn(
            "-translate-x-1/2 pointer-events-none absolute inset-y-0 left-1/2 w-0.5 transition-colors duration-150",
            dragging
              ? "bg-fg/40"
              : "bg-transparent group-hover:bg-hairline-strong group-focus-visible:bg-fg/40",
          )}
        />
      </div>
    </WithTooltip>
  );
}
