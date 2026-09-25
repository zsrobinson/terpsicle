import { cn } from "cn";
import { ChevronRight } from "lucide-react";
import {
  Fragment,
  type ReactNode,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";
import type { RailTab } from "~/core/schema";
import type { DrillEntry } from "~/state/drill";
import { useUi } from "~/state/ui-store";
import { WithTooltip } from "~/ui/tooltip";
import { PanelSkeleton } from "./panel";
import { drillViewFor, type PanelRegistry, usePanelRegistry } from "./registry";
import { useShortcut } from "./shortcuts";
import { tabById } from "./tabs";

// One panel at a time, with drill-in views stacked over it (SPEC §2). Every
// tab panel visited stays mounted (hidden) and so does every drill level
// under the top one, so going back returns to exactly where you were: scroll
// position, search text, open groups.

export const SIDEBAR_PANEL_ID = "sidebar-panel";

export function SidebarContent() {
  const tab = useUi((s) => s.tab);
  const stack = useUi((s) => s.stack);
  const back = useUi((s) => s.back);
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
    return back();
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
          label={crumbFor(registry, entry)}
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
 * back (Esc, the breadcrumb) returns focus to whatever opened it, such as the
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
  return Panel ? <Panel /> : <PanelSkeleton title={tabById(tab).label} />;
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
  return (
    <>
      <Breadcrumb
        tab={tab}
        trail={stack.slice(0, depth + 1)}
        registry={registry}
      />
      <div className="flex min-h-0 flex-1 flex-col">
        {View ? (
          <View entry={entry} />
        ) : (
          <PanelSkeleton title={crumbFor(registry, entry)} />
        )}
      </div>
    </>
  );
}

function crumbFor(registry: PanelRegistry, entry: DrillEntry): string {
  const view = drillViewFor(registry, entry);
  if (view) return view.crumb(entry);
  if (entry.kind === "course") return entry.courseCode;
  return "Details";
}

/** "Search › CMSC351": every level but the last is a way back. */
function Breadcrumb({
  tab,
  trail,
  registry,
}: {
  tab: RailTab;
  trail: readonly DrillEntry[];
  registry: PanelRegistry;
}) {
  const backTo = useUi((s) => s.backTo);
  const levels = [
    { key: tab, label: tabById(tab).label, mono: false },
    ...trail.map((entry, depth) => ({
      key: trail
        .slice(0, depth + 1)
        .map(drillIdentity)
        .join("/"),
      label: crumbFor(registry, entry),
      mono: drillViewFor(registry, entry)?.monoCrumb ?? entry.kind === "course",
    })),
  ];
  return (
    <nav
      aria-label="Breadcrumb"
      className="flex h-12 shrink-0 items-center border-hairline border-b px-2"
    >
      <ol className="flex min-w-0 items-center gap-1 px-1 text-base">
        {levels.map((level, i) => {
          const last = i === levels.length - 1;
          return (
            <Fragment key={level.key}>
              {i > 0 ? (
                <ChevronRight
                  size={13}
                  className="shrink-0 text-faint"
                  aria-hidden="true"
                />
              ) : null}
              <li className={cn("min-w-0", last && "truncate")}>
                {last ? (
                  <span
                    aria-current="page"
                    className={cn("font-medium", level.mono && "font-mono")}
                  >
                    {level.label}
                  </span>
                ) : (
                  <WithTooltip
                    label={`Back to ${level.label}`}
                    shortcut={i === levels.length - 2 ? "Esc" : undefined}
                  >
                    <button
                      type="button"
                      onClick={() => backTo(i)}
                      className={cn(
                        "rounded px-1 text-muted transition-colors hover:bg-hover hover:text-fg",
                        level.mono && "font-mono",
                      )}
                    >
                      {level.label}
                    </button>
                  </WithTooltip>
                )}
              </li>
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
