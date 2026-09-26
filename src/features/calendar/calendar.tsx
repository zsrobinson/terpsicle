import { cn } from "cn";
import {
  type FocusEvent as ReactFocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { switchSection } from "~/app/actions";
import {
  type CalendarLayout,
  DAY_HEADER_HEIGHT,
  WeekFrame,
} from "~/app/calendar/week-frame";
import { PEEK_HEIGHT, snapHeights } from "~/app/mobile-drawer";
import { useShortcut } from "~/app/shortcuts";
import { useIsMobile } from "~/app/use-media-query";
import type { Connection, CourseCode, Day } from "~/core/schema";
import { parseSectionKey } from "~/core/schema";
import type { SeatsMap } from "~/core/seats";
import { DAY_LONG_NAMES } from "~/core/time";
import { useTravel } from "~/state/hooks";
import { selectOpenCourse, useUi } from "~/state/ui-store";
import { Kbd } from "~/ui/kbd";
import { quietTooltips } from "~/ui/tooltip";
import {
  BusyBlock,
  ClassBlock,
  Ghost,
  laneStyle,
  type NavProps,
  TravelPill,
} from "./entries";
import { moveFocus, NAV_KEYS, type NavItem, tabStop } from "./keyboard";
import {
  type CalendarModel,
  ghostLanesFor,
  ghostScrollDelta,
  MAX_GHOST_LANES,
  type Pill,
  packDay,
  pillsWhileComparing,
  previewOrder,
  spreadPills,
  stepPreview,
} from "./layout";
import {
  type BlockDraft,
  DraftOutline,
  daysBetween,
  NewBlockPopover,
  snapMinute,
} from "./new-block";
import { GhostHint, PreviewHint, SearchHint, UntimedStrip } from "./strips";
import { type CalendarView, useCalendarModel } from "./use-calendar-model";

// The week calendar (SPEC §3.3): the plan's classes and blocks, the open
// course's other sections as ghosts, travel pills, and drag to block time.
// Layout is computed in layout.ts; this file draws it and handles input.

const WEEKDAYS: readonly Day[] = ["M", "Tu", "W", "Th", "F"];
const EMPTY_WEEK = "Empty week: nothing on the calendar yet";

export function Calendar() {
  const view = useCalendarModel();
  const { model, current } = view;
  // On the Search tab, hovering a result shows its sections: the hint's row
  // is there before the first hover, so no hover ever moves the grid, and
  // the day names stay in view (UX-REVIEW §4.2).
  const searching = useUi(
    (s) => s.tab === "search" && s.sidebarOpen && s.stack.length === 0,
  );
  useGhostKeys(view);
  useClearStalePreview(model);
  const bottomInset = useDrawerInset();

  if (!model || !current)
    return (
      <WeekFrame
        days={WEEKDAYS}
        startMinute={8 * 60}
        endMinute={17 * 60}
        emptyLabel={EMPTY_WEEK}
      />
    );
  const empty = model.columns.every(
    (c) => c.entries.length === 0 && c.ghosts.length === 0,
  );

  const ghostColor = model.ghost?.color ?? null;

  return (
    <WeekFrame
      days={model.days}
      startMinute={model.startMinute}
      endMinute={model.endMinute}
      bottomInset={bottomInset}
      emptyLabel={empty ? EMPTY_WEEK : undefined}
      top={
        <>
          {view.previewing ? (
            <PreviewHint
              label={view.previewing.label}
              planName={current.plan.name}
            />
          ) : model.ghost && ghostColor ? (
            <GhostHint
              ghost={model.ghost}
              interactive={view.ghostsFromOpenCourse}
              readOnly={current.readOnly}
              color={ghostColor}
            />
          ) : searching ? (
            <SearchHint />
          ) : null}
          <UntimedStrip sections={model.untimed} onOpen={openCourse} />
        </>
      }
    >
      {(layout) => (
        <Grid
          model={model}
          layout={layout}
          readOnly={current.readOnly || view.previewing !== null}
          changed={view.previewing?.changed ?? null}
          seats={view.seats}
        />
      )}
    </WeekFrame>
  );
}

/**
 * On a phone, how much of the calendar the drawer covers beyond its peek
 * (the calendar's own bottom padding). The grid gets that much room below
 * it, so anything under the drawer at half can scroll into view.
 */
function useDrawerInset(): number {
  const mobile = useIsMobile();
  const snap = useUi((s) => s.drawerSnap);
  if (!mobile || snap !== "half" || typeof window === "undefined") return 0;
  return Math.max(0, snapHeights(window.innerHeight).half - PEEK_HEIGHT);
}

/** The part of the screen where the calendar can be seen, under its day names. */
function visibleBand(
  scroller: HTMLElement,
  drawerCover: number,
): { top: number; bottom: number } {
  const box = scroller.getBoundingClientRect();
  return {
    top: box.top + DAY_HEADER_HEIGHT,
    bottom: Math.min(box.bottom, window.innerHeight - drawerCover),
  };
}

/**
 * When a course's sections start showing (opened, or hovered in search) and
 * none of them is in view, scroll the calendar to the first one: smoothly,
 * and only if needed. On a phone the drawer at half covers the calendar's
 * lower part, where a 12:30 class sits.
 */
function useScrollToGhosts(
  grid: RefObject<HTMLDivElement | null>,
  model: CalendarModel,
  layout: CalendarLayout,
) {
  const mobile = useIsMobile();
  const snap = useUi((s) => s.drawerSnap);
  const ghostCourse = model.ghost?.courseCode ?? null;
  const latest = useRef({ model, layout });
  latest.current = { model, layout };
  useEffect(() => {
    if (!ghostCourse) return;
    const frame = requestAnimationFrame(() => {
      const el = grid.current;
      const scroller = el?.closest<HTMLElement>("[data-calendar-scroll]");
      if (!el || !scroller) return;
      const { model, layout } = latest.current;
      const top = el.getBoundingClientRect().top;
      const cover =
        mobile && typeof window !== "undefined"
          ? snapHeights(window.innerHeight)[snap]
          : 0;
      const delta = ghostScrollDelta(
        model.columns.flatMap((c) =>
          c.ghostItems.map((g) => ({
            top: top + layout.yOf(g.start),
            bottom: top + layout.yOf(g.end),
          })),
        ),
        visibleBand(scroller, cover),
      );
      if (delta === 0) return;
      const still = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      scroller.scrollBy({ top: delta, behavior: still ? "auto" : "smooth" });
    });
    return () => cancelAnimationFrame(frame);
  }, [ghostCourse, grid, mobile, snap]);
}

/** Clicking a course anywhere opens its details; clicking it again closes them. */
function openCourse(courseCode: CourseCode) {
  const ui = useUi.getState();
  if (selectOpenCourse(ui) === courseCode) ui.back();
  else ui.drill({ kind: "course", courseCode });
}

function openConnection(connection: Connection) {
  useUi.getState().drill({ kind: "connection", connectionId: connection.id });
}

/** ↑/↓ preview the open course's sections; ↵ switches to the preview. */
function useGhostKeys({ model, current, ghostsFromOpenCourse }: CalendarView) {
  const enabled =
    ghostsFromOpenCourse && Boolean(model?.ghost) && !current?.readOnly;
  // Menus, lists and popups use the arrows and Enter themselves, and so does
  // the calendar: there the arrows move between classes and ghosts (focusing
  // a ghost previews it), and Enter presses what's focused. Anywhere else
  // (the course's own details, most often), ↑/↓/↵ step through the sections.
  const notOnAControl = (event: KeyboardEvent) =>
    !(
      event.target instanceof Element &&
      event.target.closest(
        "[role=menu],[role=listbox],[role=dialog],[role=tablist],[data-slot=popover-content],[data-calendar-grid]",
      )
    );
  useShortcut(
    [{ key: "ArrowUp" }, { key: "ArrowDown" }],
    (event) => {
      if (!notOnAControl(event)) return false;
      const ui = useUi.getState();
      const next = stepPreview(
        previewOrder(model?.ghost ?? null),
        // With nothing previewed yet, step from the section in the plan.
        ui.previewSection ?? placedKey(model),
        event.key === "ArrowUp" ? -1 : 1,
      );
      ui.setPreviewSection(next);
      return true;
    },
    enabled,
  );
  useShortcut(
    { key: "Enter" },
    (event) => {
      if (!notOnAControl(event)) return false;
      const preview = useUi.getState().previewSection;
      const parsed = preview ? parseSectionKey(preview) : null;
      if (!parsed || parsed.courseCode !== model?.ghost?.courseCode)
        return false;
      switchSection(parsed.courseCode, parsed.sectionCode, "keyboard");
      useUi.getState().setPreviewSection(null);
      return true;
    },
    enabled,
  );
}

function placedKey(model: CalendarModel | null): string | null {
  const ghost = model?.ghost;
  return ghost?.placedCode ? `${ghost.courseCode}-${ghost.placedCode}` : null;
}

/** A preview belongs to one course's ghosts; drop it when they go away. */
function useClearStalePreview(model: CalendarModel | null) {
  const ghostCourse = model?.ghost?.courseCode ?? null;
  useEffect(() => {
    const ui = useUi.getState();
    const preview = ui.previewSection;
    if (preview && !preview.startsWith(`${ghostCourse}-`))
      ui.setPreviewSection(null);
  }, [ghostCourse]);
}

/**
 * Halfway through a short gap, as in the prototype; just under the earlier
 * class in a long one, so the pill reads as leaving that class rather than
 * floating mid-afternoon.
 */
function pillTop(pill: Pill, layout: CalendarLayout): number {
  const from = layout.yOf(pill.connection.from.time);
  return Math.min(layout.yOf(pill.at), from + 14);
}

function placePills(
  pills: readonly Pill[],
  layout: CalendarLayout,
  colWidth: number,
) {
  const spots = spreadPills(
    pills.map((pill) => pillTop(pill, layout)),
    colWidth,
  );
  return pills.map((pill, i) => ({
    pill,
    top: spots[i]?.top ?? 0,
    x: spots[i]?.x ?? 0.5,
  }));
}

interface DragState {
  fromCol: number;
  toCol: number;
  anchor: number;
  current: number;
}

function Grid({
  model,
  layout,
  readOnly,
  changed,
  seats,
}: {
  model: CalendarModel;
  layout: CalendarLayout;
  readOnly: boolean;
  /** Sections of a previewed plan that differ from the open plan. */
  changed: ReadonlySet<string> | null;
  seats: SeatsMap | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const openCode = useUi(selectOpenCourse);
  const stackTop = useUi((s) => s.stack.at(-1));
  const { travel } = useTravel();
  const [drag, setDrag] = useState<DragState | null>(null);
  const [pending, setPending] = useState<BlockDraft | null>(null);
  const [hint, setHint] = useState<{ x: number; y: number } | null>(null);
  const hintTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [remembered, setRemembered] = useState<NavItem | null>(null);
  const [learned, setLearned] = useState(false);
  /** The calendar item that has focus, while one does. */
  const focused = useRef<Element | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  useEffect(() => () => clearTimeout(hintTimer.current), []);
  useScrollToGhosts(ref, model, layout);

  const n = model.columns.length;
  const colWidth = n > 0 ? width / n : 0;
  // Narrow days (a phone, a wide sidebar on a small laptop) fit fewer
  // side-by-side ghosts than the model's desktop default.
  const maxGhostLanes = ghostLanesFor(colWidth);
  const columns = useMemo(
    () =>
      maxGhostLanes >= MAX_GHOST_LANES
        ? model.columns
        : model.columns.map((column) => ({
            ...column,
            ...packDay(
              column.entryItems,
              column.ghostItems,
              maxGhostLanes,
              model.ghost?.courseCode ?? null,
            ),
          })),
    [model.columns, model.ghost, maxGhostLanes],
  );
  const ghostCourse = model.ghost?.courseCode ?? null;
  const bounds = { start: model.startMinute, end: model.endMinute };

  const pointAt = (event: ReactPointerEvent) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect || n === 0) return null;
    const col = Math.min(
      n - 1,
      Math.max(0, Math.floor(((event.clientX - rect.left) / rect.width) * n)),
    );
    const minute =
      model.startMinute + ((event.clientY - rect.top) / layout.hourHeight) * 60;
    return { col, minute: snapMinute(minute, bounds) };
  };
  const onEmpty = (event: ReactPointerEvent) =>
    event.target instanceof HTMLElement &&
    event.target.dataset.empty !== undefined;
  const canDrag = !readOnly && !pending;

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    // Touch scrolls the calendar; on phones, blocks come from the Blocks tab.
    if (!canDrag || event.button !== 0 || event.pointerType === "touch") return;
    if (!onEmpty(event)) return;
    const at = pointAt(event);
    if (!at) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    clearTimeout(hintTimer.current);
    setHint(null);
    setDrag({
      fromCol: at.col,
      toCol: at.col,
      anchor: at.minute,
      current: at.minute,
    });
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (drag) {
      const at = pointAt(event);
      if (at) setDrag({ ...drag, toCol: at.col, current: at.minute });
      return;
    }
    clearTimeout(hintTimer.current);
    setHint(null);
    if (!canDrag || event.pointerType === "touch" || !onEmpty(event)) return;
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    hintTimer.current = setTimeout(() => setHint({ x, y }), 600);
  };
  const onPointerUp = () => {
    if (!drag) return;
    const start = Math.min(drag.anchor, drag.current);
    const end = Math.max(drag.anchor, drag.current);
    setDrag(null);
    // A click, not a drag: nothing to block.
    if (end - start < 15) return;
    setPending({
      days: daysBetween(model.days, drag.fromCol, drag.toCol),
      start,
      end,
    });
  };

  const draft: BlockDraft | null = drag
    ? {
        days: daysBetween(model.days, drag.fromCol, drag.toCol),
        start: Math.min(drag.anchor, drag.current),
        end: Math.max(drag.anchor, drag.current),
      }
    : pending;
  const draftBox = (start: number, end: number) => ({
    top: layout.yOf(start),
    height: Math.max(4, layout.yOf(end) - layout.yOf(start)),
    left: 3,
    right: 3,
  });

  // The keyboard (keyboard.ts): one Tab stop, arrows between everything.
  const days = columns.map((column, col) => ({
    column,
    col,
    pills: placePills(
      pillsWhileComparing(column.pills, ghostCourse),
      layout,
      colWidth,
    ),
  }));
  const navItems: NavItem[] = days.flatMap(({ column, col, pills }) => [
    ...column.entries.map((e) => ({
      key: `c:${e.key}`,
      col,
      start: e.start,
      lane: e.lane,
    })),
    ...column.ghosts
      .filter((g) => !g.overlay)
      .map((g) => ({ key: `g:${g.key}`, col, start: g.start, lane: g.lane })),
    ...pills.map(({ pill }) => ({
      key: `p:${column.day}:${pill.key}`,
      col,
      start: pill.at,
    })),
  ]);
  const stop = tabStop(
    navItems,
    remembered?.key ?? null,
    days.flatMap(({ column }) =>
      column.entries
        .filter((e) => e.kind === "class" && e.courseCode === ghostCourse)
        .map((e) => `c:${e.key}`),
    ),
    remembered,
  );
  const nav = (key: string): NavProps => ({
    "data-nav-key": key,
    tabIndex: key === stop ? 0 : -1,
    // Said once, as focus first arrives, until the arrows have been used.
    ...(key === stop && !learned ? { "aria-describedby": KEYS_ID } : {}),
  });
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const move = NAV_KEYS[event.key];
    if (!move || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.shiftKey) return;
    const from =
      event.target instanceof Element
        ? event.target.closest("[data-nav-key]")?.getAttribute("data-nav-key")
        : null;
    if (!from) return;
    // At the edge of a day or the week too: the arrows stay the calendar's
    // (no page scroll, no section preview) while focus is on it.
    event.preventDefault();
    const next = moveFocus(navItems, from, move);
    if (!next) return;
    setLearned(true);
    ref.current
      ?.querySelector<HTMLElement>(`[data-nav-key="${CSS.escape(next)}"]`)
      ?.focus();
  };
  const onFocus = (event: ReactFocusEvent<HTMLDivElement>) => {
    const key = event.target
      .closest("[data-nav-key]")
      ?.getAttribute("data-nav-key");
    if (key) {
      setRemembered(navItems.find((i) => i.key === key) ?? null);
      focused.current = event.target;
    }
  };
  const onBlur = (event: ReactFocusEvent<HTMLDivElement>) => {
    // Leaving for somewhere else. A focused ghost that's switched to is
    // removed instead, which fires no blur: the effect below catches that.
    if (event.relatedTarget) focused.current = null;
  };
  // Switching to a ghost replaces it with the class it becomes. Focus would
  // fall to the page; it goes to the course's new class instead (WCAG 2.4.3).
  useEffect(() => {
    const was = focused.current;
    if (!was || was.isConnected || !stop) return;
    focused.current = null;
    const active = document.activeElement;
    if (active && active !== document.body) return;
    // No tooltip over the class that just appeared: it would hide it, and
    // take the next Esc.
    quietTooltips();
    ref.current
      ?.querySelector<HTMLElement>(`[data-nav-key="${CSS.escape(stop)}"]`)
      ?.focus({ preventScroll: true });
  });

  return (
    // Key and focus events bubble up from the buttons inside (the roving
    // tabindex); the wrapper itself is never focused or pressed.
    // biome-ignore lint/a11y/noStaticElementInteractions: see above
    <div
      ref={ref}
      role="presentation"
      data-calendar-grid=""
      className={cn("absolute inset-0 flex", canDrag && "cursor-crosshair")}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => setDrag(null)}
      onPointerLeave={() => {
        clearTimeout(hintTimer.current);
        setHint(null);
      }}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
      onBlur={onBlur}
    >
      <p id={KEYS_ID} className="sr-only">
        Arrow keys move around the calendar: left and right change the day, up
        and down go through the day. To block off time, use the Blocks tab.
      </p>
      {days.map(({ column, pills }) => {
        // Reading order is time order, so a screen reader hears "STAT400,
        // 8 min walk, CMSC351" the way the day goes.
        const things: { start: number; lane: number; node: ReactNode }[] = [];
        for (const entry of column.entries) {
          const style = laneStyle(entry, layout.yOf);
          const height = layout.yOf(entry.end) - layout.yOf(entry.start);
          const width = colWidth > 0 ? colWidth / entry.lanes - 4 : null;
          things.push({
            start: entry.start,
            lane: entry.lane,
            node:
              entry.kind === "block" ? (
                <BusyBlock
                  key={entry.key}
                  entry={entry}
                  height={height}
                  dimmed={ghostCourse !== null}
                  style={style}
                  width={width}
                  nav={nav(`c:${entry.key}`)}
                />
              ) : (
                <ClassBlock
                  key={entry.key}
                  entry={entry}
                  height={height}
                  dimmed={
                    ghostCourse !== null && entry.courseCode !== ghostCourse
                  }
                  selected={ghostCourse === entry.courseCode}
                  changed={changed?.has(entry.sectionKey) ?? false}
                  open={openCode === entry.courseCode}
                  onOpen={() => openCourse(entry.courseCode)}
                  style={style}
                  width={width}
                  nav={nav(`c:${entry.key}`)}
                />
              ),
          });
        }
        for (const ghost of column.ghosts)
          things.push({
            start: ghost.start,
            lane: ghost.lane,
            node: (
              <Ghost
                key={ghost.key}
                entry={ghost}
                height={layout.yOf(ghost.end) - layout.yOf(ghost.start)}
                width={colWidth > 0 ? colWidth / ghost.lanes - 4 : null}
                readOnly={readOnly}
                seats={seats}
                style={laneStyle(ghost, layout.yOf)}
                nav={ghost.overlay ? null : nav(`g:${ghost.key}`)}
              />
            ),
          });
        for (const { pill, top, x } of pills)
          things.push({
            start: pill.at,
            lane: 0,
            node: (
              <TravelPill
                key={pill.key}
                pill={pill}
                top={top}
                x={x}
                travel={travel}
                selected={
                  stackTop?.kind === "connection" &&
                  stackTop.connectionId === pill.connection.id
                }
                onOpen={openConnection}
                nav={nav(`p:${column.day}:${pill.key}`)}
              />
            ),
          });
        things.sort((a, b) => a.start - b.start || a.lane - b.lane);
        return (
          // Screen readers hear which day they're in as they move through.
          // biome-ignore lint/a11y/useSemanticElements: a day isn't a form, so not a <fieldset>
          <div
            key={column.day}
            role="group"
            aria-label={DAY_LONG_NAMES[column.day]}
            data-empty=""
            data-day={column.day}
            className="relative h-full min-w-0 flex-1"
          >
            {things.map((thing) => thing.node)}
            {draft?.days.includes(column.day) ? (
              <DraftOutline style={draftBox(draft.start, draft.end)} />
            ) : null}
            {pending && pending.days[0] === column.day ? (
              <NewBlockPopover
                draft={pending}
                anchorStyle={{
                  ...draftBox(pending.start, pending.end),
                  // Anchor at the last dragged column, so the popup sits beside it.
                  right: -(pending.days.length - 1) * colWidth - 3,
                }}
                onDone={() => setPending(null)}
              />
            ) : null}
          </div>
        );
      })}
      {hint ? (
        <div
          role="tooltip"
          className="pointer-events-none absolute z-40 flex items-center gap-1.5 rounded-md border border-transparent bg-fg px-2 py-1 text-bg text-sm"
          style={{ left: hint.x + 12, top: hint.y + 14 }}
        >
          {/* The keyboard's way in is the Blocks tab (WCAG 2.5.7). */}
          Drag to block off time, or add one in Blocks
          <Kbd>5</Kbd>
        </div>
      ) : null}
    </div>
  );
}

/** The calendar's keys, described to a screen reader as focus first arrives. */
const KEYS_ID = "calendar-keys";
