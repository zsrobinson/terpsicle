import { cn } from "cn";
import {
  type ComponentType,
  type LazyExoticComponent,
  lazy,
  type ReactNode,
  Suspense,
} from "react";
import { PEEK_HEIGHT } from "../drawer-heights";
import { ChunkLoadError, PanelLoadBoundary } from "../panel-load-boundary";
import { MOBILE_QUERY } from "../use-media-query";
import { SidebarResizeHandle } from "./sidebar-resize";

// The workbench (CONTEXT.md; docs/COHESION.md §4): a product laid out like
// the scheduler. The family bar; a rail of the product's views, one sidebar
// panel and a canvas that fills the rest; on phones (≤ 768px) the same
// pieces with the sidebar in a bottom drawer. Schedule and Plan are
// workbenches: each brings its own bar, views and canvas, and this lays
// them out the same way.

export function Workbench({
  mobile,
  bar,
  rail,
  sidebar,
  drawer,
  canvas,
  canvasId,
  canvasClassName,
  before,
  after,
}: {
  mobile: boolean;
  /** The family bar, with the product's context. */
  bar: ReactNode;
  /** Desktop: a `WorkbenchRail`. */
  rail: ReactNode;
  /** Desktop: a `WorkbenchSidebar`. */
  sidebar: ReactNode;
  /** Phones: the product's drawer, a lazy component (`lazyDrawer`). */
  drawer: ReactNode;
  /** The calendar, the board. */
  canvas: ReactNode;
  /** The canvas's id, for skip links and focus. */
  canvasId: string;
  canvasClassName?: string;
  /** Before the bar: skip links. */
  before?: ReactNode;
  /** After everything: toasts. */
  after?: ReactNode;
}) {
  const main = (
    <main
      id={canvasId}
      tabIndex={-1}
      className={cn(
        mobile ? "min-h-0 flex-1 outline-none" : "min-w-0 flex-1 outline-none",
        canvasClassName,
      )}
      style={mobile ? { paddingBottom: PEEK_HEIGHT } : undefined}
    >
      {canvas}
    </main>
  );
  return (
    <div data-app-shell="" className="flex h-dvh flex-col bg-bg text-fg">
      {before}
      {bar}
      {mobile ? (
        <>
          {main}
          <PanelLoadBoundary title="Sidebar">
            <Suspense fallback={<DrawerPlaceholder />}>{drawer}</Suspense>
          </PanelLoadBoundary>
        </>
      ) : (
        <div className="flex min-h-0 flex-1">
          {rail}
          {sidebar}
          {main}
        </div>
      )}
      {after}
    </div>
  );
}

/**
 * The desktop sidebar: one panel, its right edge draggable. `width` is the
 * saved width, or null while it loads (the head script has already drawn
 * it, so the handle waits rather than draw the default first).
 */
export function WorkbenchSidebar({
  id,
  open,
  width,
  onWidth,
  children,
}: {
  id: string;
  open: boolean;
  width: number | null;
  onWidth: (px: number) => void;
  children: ReactNode;
}) {
  return (
    <aside
      id={id}
      aria-label="Sidebar"
      hidden={!open}
      className="relative flex w-sidebar shrink-0 flex-col border-hairline border-r"
    >
      {children}
      {width === null ? null : (
        <SidebarResizeHandle controls={id} width={width} onWidth={onWidth} />
      )}
    </aside>
  );
}

/** The drawer's resting edge while its code arrives, so nothing jumps. */
function DrawerPlaceholder() {
  return (
    <div
      aria-hidden="true"
      className="fixed inset-x-0 bottom-0 z-40 border-keyline border-t bg-bg shadow-drawer"
      style={{ height: PEEK_HEIGHT }}
    />
  );
}

/**
 * A product's phone drawer, in its own chunk: desktops never load it, and
 * phones start fetching it as the product's module runs, alongside its
 * data. It's a layout, not a place, so it's a lazy component rather than a
 * route. A chunk that fails can be tried again (PanelLoadBoundary says so).
 */
export function lazyDrawer<P extends object>(
  load: () => Promise<ComponentType<P> | undefined>,
): LazyExoticComponent<ComponentType<P>> {
  let pending: Promise<ComponentType<P>> | undefined;
  const get = () => {
    pending ??= load()
      .then((component) => {
        // Vite's loader resolves a failed chunk to nothing once
        // load-recovery has taken the error (to reload the page).
        if (!component) throw new Error("empty module");
        return component;
      })
      .catch((error: unknown) => {
        // A failed chunk (offline, a deploy in between) can be tried again.
        pending = undefined;
        throw new ChunkLoadError(error);
      });
    return pending;
  };
  if (typeof window !== "undefined" && window.matchMedia(MOBILE_QUERY).matches)
    get().catch(() => {});
  return lazy(() => get().then((component) => ({ default: component })));
}
