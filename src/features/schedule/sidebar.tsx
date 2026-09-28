import { type AnyRoute, useRouter } from "@tanstack/react-router";
import { cn } from "cn";
import {
  type ComponentType,
  lazy,
  type ReactNode,
  type RefObject,
  Suspense,
  useEffect,
  useRef,
  useState,
} from "react";
import { PanelSkeleton } from "~/components/panel";
import {
  ChunkLoadError,
  PanelLoadBoundary,
} from "~/components/panel-load-boundary";
import { DrillBackBar } from "~/components/workbench/back-bar";
import {
  CONNECTION_PATH,
  COURSE_PATH,
  RESULT_PATH,
  TAB_PATHS,
} from "~/core/routing/schedule-location";
import type { RailTab } from "~/core/schema";
import { ScheduleHistoryStateSchema } from "~/core/schema/schedule-url";
import { useShortcut } from "~/lib/shortcuts";
import type { DrillEntry, DrillKind } from "~/state/drill";
import { goBack } from "./actions";
import { DrillEntryProvider } from "./drill-entry";
import { drillMono, drillName, useLatestLocation } from "./schedule-view";
import { useSidebarStack } from "./sidebar-stack";
import { tabById } from "./tabs";

// One panel at a time, with drill-in views stacked over it (SPEC §2). Each
// tab and drill-in is a route; the sidebar shows its route's component (the
// router splits each into its own chunk and preloads it on intent). Every
// tab panel visited stays mounted (hidden) and so does every drill level
// under the top one, so going back returns to exactly where you were: scroll
// position, search text, open groups. That's why there's no <Outlet />,
// which would unmount them. A drill-in's header has one Back, the same as
// the browser's (src/features/schedule/README.md, "URL state").

const DRILL_PATHS: Record<DrillKind, string> = {
  course: COURSE_PATH,
  connection: CONNECTION_PATH,
  "generated-plan": RESULT_PATH,
};

/** Route components already wrapped to wait for their chunk. */
const waiting = new WeakMap<ComponentType, ComponentType>();

type RouteView = ComponentType & { preload?: () => Promise<unknown> };

/**
 * Whether a route component's chunk failed to arrive. The router's lazy
 * component clears `preload` once its import settles; after a failure (or
 * an import that resolved to nothing, as Vite's loader does once
 * load-recovery has taken the error to reload the page) calling it throws
 * the error it recorded, while a loaded one just returns an element.
 */
function chunkFailed(component: RouteView): boolean {
  if (component.preload) return true;
  try {
    (component as (props: object) => unknown)({});
    return false;
  } catch {
    return true;
  }
}

/** Stands in for a route component whose chunk didn't arrive. */
function failedView(cause: string): ComponentType {
  return function FailedView() {
    throw new ChunkLoadError(cause);
  };
}

/**
 * A route's component. The router splits it into its own chunk (`preload`
 * loads it); the router's own <Outlet /> waits for that before rendering,
 * so here React.lazy does, showing the skeleton meanwhile. Once wrapped,
 * always wrapped, so a view never remounts when its chunk arrives. A chunk
 * that can't load says so in the panel (PanelLoadBoundary).
 */
function useRouteComponent(id: string): ComponentType | undefined {
  const router = useRouter();
  const route = (router.routesById as unknown as Record<string, AnyRoute>)[id];
  const component = route?.options.component as RouteView | undefined;
  if (!component) return undefined;
  const wrapped = waiting.get(component);
  if (wrapped) return wrapped;
  // Not split (tests hand the router plain components): nothing to wait on.
  if (!("preload" in component)) return component;
  const preload = component.preload;
  if (!preload) {
    if (!chunkFailed(component)) return component;
    const failed = failedView(id);
    waiting.set(component, failed);
    return failed;
  }
  const lazyView = lazy(async () => {
    await preload();
    return { default: chunkFailed(component) ? failedView(id) : component };
  });
  waiting.set(component, lazyView);
  return lazyView;
}

export const SIDEBAR_PANEL_ID = "sidebar-panel";

export function SidebarContent() {
  const {
    view: { tab },
    stack,
  } = useSidebarStack();
  const [visited, setVisited] = useState<readonly RailTab[]>([tab]);

  useEffect(() => {
    setVisited((v) => (v.includes(tab) ? v : [...v, tab]));
  }, [tab]);

  // Esc goes back one level. Menus and dialogs handle their own Esc first.
  useShortcut({ key: "Escape", whileTyping: true }, (event) => {
    const target = event.target;
    if (
      target instanceof Element &&
      target.closest('[role="menu"],[role="listbox"],[aria-modal="true"]')
    )
      return false;
    if (target instanceof HTMLElement && target.matches("input,textarea")) {
      // Esc in a field leaves the field first.
      target.blur();
      return true;
    }
    return goBack();
  });

  const shownTabs = visited.includes(tab) ? visited : [...visited, tab];
  const containerRef = useRef<HTMLDivElement>(null);
  useDrillFocus(containerRef, stack);

  return (
    <div
      ref={containerRef}
      id={SIDEBAR_PANEL_ID}
      className="relative min-h-0 flex-1"
    >
      {shownTabs.map((t) => (
        <Layer key={t} active={t === tab && stack.length === 0}>
          <TabPanel tab={t} />
        </Layer>
      ))}
      {stack.map((entry, depth) => (
        <Layer
          // The path to this level: a view keeps its state while the levels
          // under it stay the same.
          key={stack
            .slice(0, depth + 1)
            .map(drillIdentity)
            .join("/")}
          active={depth === stack.length - 1}
          animate
          label={drillName(entry)}
        >
          <DrillLayer tab={tab} stack={stack} depth={depth} />
        </Layer>
      ))}
    </div>
  );
}

/**
 * Keyboard focus follows drill-ins: opening one moves focus into it, and going
 * back (Esc, Back) returns focus to whatever opened it, such as the
 * search result, section row or calendar block. Opening with nothing focused
 * (a restored or deep-linked drill-in) leaves focus alone.
 */
function useDrillFocus(
  containerRef: RefObject<HTMLDivElement | null>,
  stack: readonly DrillEntry[],
) {
  // What had focus when each level opened, by depth.
  const openers = useRef<(Element | null)[]>([]);
  // Focus as the URL moved: the history tells its subscribers at once, while
  // focus is still on the control that opened (or closed) the level; the
  // views change a moment later, once the route has loaded.
  const atMove = useRef<{ focused: Element | null; inside: boolean }>({
    focused: null,
    inside: false,
  });
  const router = useRouter();
  useEffect(
    () =>
      router.history.subscribe(() => {
        const focused = document.activeElement;
        const somewhere = focused !== null && focused !== document.body;
        atMove.current = {
          focused: somewhere ? focused : null,
          inside: containerRef.current?.contains(focused) ?? false,
        };
      }),
    [router, containerRef],
  );

  const previous = useRef(stack);
  useEffect(() => {
    const prev = previous.current;
    previous.current = stack;
    if (prev === stack) return;
    const { focused, inside } = atMove.current;
    atMove.current = { focused: null, inside: false };
    let move: "into" | "back" | null = null;
    if (stack.length > prev.length) {
      openers.current[stack.length - 1] = focused;
      move = focused ? "into" : null;
    } else if (stack.length < prev.length) {
      openers.current.length = stack.length + 1;
      // A rail tab or shortcut from outside keeps focus where it is.
      move = inside || !focused ? "back" : null;
    } else if (inside && !sameView(stack.at(-1), prev.at(-1))) {
      // Replaced by a different view; a sub-tab change keeps focus.
      move = "into";
    }
    const container = containerRef.current;
    if (!move || !container) return;
    const active = container.querySelector<HTMLElement>(
      ":scope > [data-layer][data-active]",
    );
    if (move === "back") {
      const opener = openers.current[stack.length];
      openers.current.length = stack.length;
      if (
        opener instanceof HTMLElement &&
        opener.isConnected &&
        !opener.closest("[inert]")
      ) {
        opener.focus({ preventScroll: false });
        return;
      }
    }
    active?.focus({ preventScroll: true });
  }, [stack, containerRef]);
}

function sameView(a: DrillEntry | undefined, b: DrillEntry | undefined) {
  if (!a || !b) return a === b;
  return drillIdentity(a) === drillIdentity(b);
}

/** The part of an entry that decides whether it's the same view (not its sub-tab). */
function drillIdentity(entry: DrillEntry): string {
  const { tab: _tab, ...rest } = entry as DrillEntry & { tab?: unknown };
  return JSON.stringify(rest);
}

function Layer({
  active,
  animate = false,
  label,
  children,
}: {
  active: boolean;
  animate?: boolean;
  /** A drill-in's name ("CMSC351"), announced when focus moves into it. */
  label?: string;
  children: ReactNode;
}) {
  return (
    <section
      data-layer=""
      data-active={active ? "" : undefined}
      aria-label={label}
      // Focus lands here when a drill-in opens (useDrillFocus); Tab then
      // moves on to its first control.
      tabIndex={-1}
      // Hidden layers keep their layout (and so their scroll position).
      className={cn(
        "absolute inset-0 flex flex-col bg-bg outline-none",
        !active && "invisible",
        animate &&
          "fade-in-0 slide-in-from-left-2 animate-in duration-150 ease-out",
      )}
      inert={!active}
      aria-hidden={!active}
    >
      {children}
    </section>
  );
}

function TabPanel({ tab }: { tab: RailTab }) {
  const Panel = useRouteComponent(TAB_PATHS[tab]);
  const skeleton = <PanelSkeleton title={tabById(tab).label} />;
  if (!Panel) return skeleton;
  // A tab's route chunk loads on first use; the skeleton shows meanwhile.
  return (
    <PanelLoadBoundary title={tabById(tab).label}>
      <Suspense fallback={skeleton}>
        <Panel />
      </Suspense>
    </PanelLoadBoundary>
  );
}

function DrillLayer({
  tab,
  stack,
  depth,
}: {
  tab: RailTab;
  stack: readonly DrillEntry[];
  depth: number;
}) {
  const entry = stack[depth];
  const View = useRouteComponent(DRILL_PATHS[entry?.kind ?? "course"]);
  if (!entry) return null;
  const under = stack[depth - 1];
  const name = drillName(entry);
  return (
    <>
      <BackBar
        entry={entry}
        under={
          under
            ? { label: drillName(under), mono: drillMono(under) }
            : { label: tabById(tab).label, mono: false }
        }
        active={depth === stack.length - 1}
      />
      <div className="flex min-h-0 flex-1 flex-col">
        {View ? (
          <PanelLoadBoundary title={name}>
            <Suspense fallback={<PanelSkeleton title={name} />}>
              <DrillEntryProvider entry={entry}>
                <View />
              </DrillEntryProvider>
            </Suspense>
          </PanelLoadBoundary>
        ) : (
          <PanelSkeleton title={name} />
        )}
      </div>
    </>
  );
}

/** "‹ Search   CMSC351" (~/components/workbench/back-bar), labeled from the history. */
function BackBar({
  entry,
  under,
  active,
}: {
  entry: DrillEntry;
  /** Where Back goes without history to follow: the level under this one. */
  under: { label: string; mono: boolean };
  active: boolean;
}) {
  // The entry before this one, when it's the app's, labels Back.
  const state = useLatestLocation().state;
  const { backLabel, backMono } = ScheduleHistoryStateSchema.parse(state);
  const to =
    active && backLabel ? { label: backLabel, mono: backMono ?? false } : under;
  return (
    <DrillBackBar
      back={to}
      name={drillName(entry)}
      mono={drillMono(entry)}
      onBack={() => goBack()}
    />
  );
}
