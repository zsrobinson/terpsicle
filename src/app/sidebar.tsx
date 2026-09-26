import { cn } from "cn";
import { ChevronLeft } from "lucide-react";
import {
  type ReactNode,
  type RefObject,
  Suspense,
  useEffect,
  useRef,
  useState,
} from "react";
import type { RailTab } from "~/core/schema";
import type { DrillEntry } from "~/state/drill";
import { useUi } from "~/state/ui-store";
import { WithTooltip } from "~/ui/tooltip";
import { goBack } from "./actions";
import { PanelSkeleton } from "./panel";
import { PanelLoadBoundary } from "./panel-load-boundary";
import { drillViewFor, type PanelRegistry, usePanelRegistry } from "./registry";
import { useShortcut } from "./shortcuts";
import { tabById } from "./tabs";

// One panel at a time, with drill-in views stacked over it (SPEC §2). Every
// tab panel visited stays mounted (hidden) and so does every drill level
// under the top one, so going back returns to exactly where you were: scroll
// position, search text, open groups. A drill-in's header has one Back, the
// same as the browser's (src/app/README.md, "URL state").

export const SIDEBAR_PANEL_ID = "sidebar-panel";

export function SidebarContent() {
  const tab = useUi((s) => s.tab);
  const stack = useUi((s) => s.stack);
  const registry = usePanelRegistry();
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
  useDrillFocus(containerRef);

  return (
    <div
      ref={containerRef}
      id={SIDEBAR_PANEL_ID}
      className="relative min-h-0 flex-1"
    >
      {shownTabs.map((t) => (
        <Layer key={t} active={t === tab && stack.length === 0}>
          <TabPanel tab={t} registry={registry} />
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
          label={nameFor(registry, entry)}
        >
          <DrillLayer
            tab={tab}
            stack={stack}
            depth={depth}
            registry={registry}
          />
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
function useDrillFocus(containerRef: RefObject<HTMLDivElement | null>) {
  // What had focus when each level opened, by depth.
  const openers = useRef<(Element | null)[]>([]);
  const pending = useRef<"into" | "back" | null>(null);
  const stack = useUi((s) => s.stack);

  useEffect(
    () =>
      // Store changes are synchronous, so focus is still on the control
      // that opened (or closed) the level.
      useUi.subscribe((s, prev) => {
        const focused = document.activeElement;
        const somewhere = focused !== null && focused !== document.body;
        const inside = containerRef.current?.contains(focused) ?? false;
        if (s.stack.length > prev.stack.length) {
          openers.current[s.stack.length - 1] = somewhere ? focused : null;
          pending.current = somewhere ? "into" : null;
        } else if (s.stack.length < prev.stack.length) {
          openers.current.length = s.stack.length + 1;
          // A rail tab or shortcut from outside keeps focus where it is.
          pending.current = inside || !somewhere ? "back" : null;
        } else if (inside && !sameView(s.stack.at(-1), prev.stack.at(-1))) {
          // Replaced by a different view; a sub-tab change keeps focus.
          pending.current = "into";
        }
      }),
    [containerRef],
  );

  useEffect(() => {
    const move = pending.current;
    pending.current = null;
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

function TabPanel({
  tab,
  registry,
}: {
  tab: RailTab;
  registry: PanelRegistry;
}) {
  const Panel = registry.tabs[tab];
  const skeleton = <PanelSkeleton title={tabById(tab).label} />;
  if (!Panel) return skeleton;
  // Tabs past the first few load on first use (lazy-panel.tsx).
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
  registry,
}: {
  tab: RailTab;
  stack: readonly DrillEntry[];
  depth: number;
  registry: PanelRegistry;
}) {
  const entry = stack[depth];
  if (!entry) return null;
  const view = drillViewFor(registry, entry);
  const View = view?.component;
  const under = stack[depth - 1];
  return (
    <>
      <BackBar
        entry={entry}
        under={
          under
            ? {
                label: nameFor(registry, under),
                mono: monoFor(registry, under),
              }
            : { label: tabById(tab).label, mono: false }
        }
        active={depth === stack.length - 1}
        registry={registry}
      />
      <div className="flex min-h-0 flex-1 flex-col">
        {View ? (
          <PanelLoadBoundary title={nameFor(registry, entry)}>
            <Suspense
              fallback={<PanelSkeleton title={nameFor(registry, entry)} />}
            >
              <View entry={entry} />
            </Suspense>
          </PanelLoadBoundary>
        ) : (
          <PanelSkeleton title={nameFor(registry, entry)} />
        )}
      </div>
    </>
  );
}

/** A drill-in's short name: "CMSC351", "Connection", "Option 3". */
export function nameFor(registry: PanelRegistry, entry: DrillEntry): string {
  const view = drillViewFor(registry, entry);
  if (view) return view.name(entry);
  if (entry.kind === "course") return entry.courseCode;
  return "Details";
}

/** Whether a drill-in's name is set in Geist Mono (codes). */
export function monoFor(registry: PanelRegistry, entry: DrillEntry): boolean {
  return drillViewFor(registry, entry)?.monoName ?? entry.kind === "course";
}

/**
 * "‹ Search   CMSC351": one Back, to wherever you came from (the browser's
 * Back does the same), labeled with that view's short name, then this view's
 * name. Going from course to course never builds a trail to aim at.
 */
function BackBar({
  entry,
  under,
  active,
  registry,
}: {
  entry: DrillEntry;
  /** Where Back goes without history to follow: the level under this one. */
  under: { label: string; mono: boolean };
  active: boolean;
  registry: PanelRegistry;
}) {
  const fromHistory = useUi((s) => (active ? s.historyBack : null));
  const name = nameFor(registry, entry);
  const to = fromHistory ?? under;
  // From one plan's CMSC351 back to another's: "Back", not "CMSC351".
  const same = to.label === name;
  return (
    <div className="flex h-12 shrink-0 items-center gap-2 border-hairline border-b px-2">
      <WithTooltip label={same ? "Back" : `Back to ${to.label}`} shortcut="Esc">
        <button
          type="button"
          onClick={() => goBack()}
          className="flex min-w-0 max-w-[60%] shrink-0 items-center gap-0.5 rounded py-1 pr-1.5 pl-0.5 text-base text-muted transition-colors hover:bg-hover hover:text-fg"
        >
          <ChevronLeft size={16} className="shrink-0" aria-hidden="true" />
          {same ? (
            "Back"
          ) : (
            <>
              <span className="sr-only">Back to </span>
              <span className={cn("truncate", to.mono && "font-mono")}>
                {to.label}
              </span>
            </>
          )}
        </button>
      </WithTooltip>
      <span
        aria-current="page"
        className={cn(
          "min-w-0 truncate font-medium text-base",
          monoFor(registry, entry) && "font-mono",
        )}
      >
        {name}
      </span>
    </div>
  );
}
