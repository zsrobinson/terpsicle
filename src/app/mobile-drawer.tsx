import { cn } from "cn";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { Drawer } from "vaul";
import type { RailTab } from "~/core/schema";
import { type DrawerSnap, useUi } from "~/state/ui-store";
import { WithTooltip } from "~/ui/tooltip";
import { openTab } from "./actions";
import { ProblemBadge } from "./rail";
import { SidebarContent } from "./sidebar";
import { TABS, type Tab } from "./tabs";

// Phones (SPEC §2): the same sidebar, in a bottom drawer that rests at peek,
// half or full height. The rail becomes the drawer's tab strip. No bespoke
// mobile screens, so features only have to work in the sidebar.

/** Handle + tab strip + the panel's header line. */
export const PEEK_HEIGHT = 124;
const TOP_BAR_HEIGHT = 48;

function useViewportHeight(): number {
  return useSyncExternalStore(
    (onChange) => {
      window.addEventListener("resize", onChange);
      return () => window.removeEventListener("resize", onChange);
    },
    () => window.innerHeight,
    () => 800,
  );
}

export function snapHeights(viewport: number): Record<DrawerSnap, number> {
  return {
    peek: PEEK_HEIGHT,
    half: Math.round(viewport * 0.5),
    full: viewport - TOP_BAR_HEIGHT,
  };
}

export function MobileDrawer() {
  const snap = useUi((s) => s.drawerSnap);
  const setSnap = useUi((s) => s.setDrawerSnap);
  const tab = useUi((s) => s.tab);
  const depth = useUi((s) => s.stack.length);
  const viewport = useViewportHeight();
  const heights = snapHeights(viewport);
  const points = [
    `${heights.peek}px`,
    `${heights.half}px`,
    `${heights.full}px`,
  ];
  const snapOf = (point: string | number | null): DrawerSnap =>
    point === points[2] ? "full" : point === points[1] ? "half" : "peek";

  // Opening a tab or drilling in from elsewhere (a shortcut, the calendar)
  // raises a resting drawer so the result is visible.
  const last = useRef({ tab, depth });
  useEffect(() => {
    const changed = last.current.tab !== tab || depth > last.current.depth;
    last.current = { tab, depth };
    if (changed && useUi.getState().drawerSnap === "peek") setSnap("half");
  }, [tab, depth, setSnap]);

  return (
    <Drawer.Root
      open
      modal={false}
      dismissible={false}
      snapPoints={points}
      activeSnapPoint={points[["peek", "half", "full"].indexOf(snap)] ?? null}
      setActiveSnapPoint={(point) => setSnap(snapOf(point))}
    >
      <Drawer.Portal>
        <Drawer.Content
          aria-describedby={undefined}
          onOpenAutoFocus={(event) => event.preventDefault()}
          data-snap={snap}
          className="fixed inset-x-0 bottom-0 z-40 flex h-dvh flex-col rounded-t-xl border border-hairline border-b-0 bg-bg shadow-pop outline-none"
        >
          <Drawer.Title className="sr-only">Sidebar</Drawer.Title>
          <div
            className="flex flex-col"
            // The drawer is full height and slides down; size the inside to
            // what's showing so its scroll area ends at the screen's edge.
            style={{ height: heights[snap] }}
          >
            <Grabber snap={snap} onSnap={setSnap} />
            <DrawerTabs />
            <div className="flex min-h-0 flex-1 flex-col">
              <SidebarContent />
            </div>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

const NEXT_SNAP: Record<DrawerSnap, DrawerSnap> = {
  peek: "half",
  half: "full",
  full: "peek",
};

/**
 * The bar at the top: drag the drawer anywhere to resize it, or tap this to
 * step peek → half → full. A real button (vaul's handle isn't focusable).
 */
function Grabber({
  snap,
  onSnap,
}: {
  snap: DrawerSnap;
  onSnap: (snap: DrawerSnap) => void;
}) {
  const next = NEXT_SNAP[snap];
  return (
    <WithTooltip
      label={next === "peek" ? "Lower the panel" : "Raise the panel"}
    >
      <button
        type="button"
        aria-label={next === "peek" ? "Lower the panel" : "Raise the panel"}
        onClick={() => onSnap(next)}
        className="mx-auto flex h-5 w-16 shrink-0 items-center justify-center rounded-full"
      >
        <span className="h-1 w-8 rounded-full bg-hairline-strong" />
      </button>
    </WithTooltip>
  );
}

/** A tap on the open tab lowers the drawer, like the rail collapsing the sidebar. */
function tapTab(tab: RailTab): void {
  const ui = useUi.getState();
  if (tab === ui.tab && ui.drawerSnap !== "peek") {
    if (ui.stack.length > 0) ui.backTo(0);
    else ui.setDrawerSnap("peek");
    return;
  }
  openTab(tab, "click");
  if (useUi.getState().drawerSnap === "peek") ui.setDrawerSnap("half");
}

function DrawerTabs() {
  const current = useUi((s) => s.tab);
  return (
    <nav
      aria-label="Tabs"
      className="flex shrink-0 justify-around border-hairline border-b px-1 pb-1"
    >
      {TABS.map((t) => (
        <DrawerTab key={t.id} tab={t} selected={t.id === current} />
      ))}
    </nav>
  );
}

function DrawerTab({ tab, selected }: { tab: Tab; selected: boolean }) {
  const Icon = tab.icon;
  return (
    <WithTooltip label={tab.label} shortcut={tab.shortcut} side="top">
      <button
        type="button"
        aria-pressed={selected}
        onClick={() => tapTab(tab.id)}
        className={cn(
          "relative flex min-w-0 flex-1 flex-col items-center gap-1 rounded-lg py-1.5 transition-colors",
          selected
            ? "bg-raised text-fg shadow-xs ring-1 ring-hairline"
            : "text-muted hover:bg-hover hover:text-fg",
        )}
      >
        <Icon size={17} strokeWidth={1.75} aria-hidden="true" />
        <span className="max-w-full truncate font-medium text-[10px] leading-none">
          {tab.label}
        </span>
        {tab.id === "problems" ? <ProblemBadge className="right-1" /> : null}
      </button>
    </WithTooltip>
  );
}
