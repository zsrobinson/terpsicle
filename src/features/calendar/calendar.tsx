import { cn } from "cn";
import {
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { switchSection } from "~/app/actions";
import { type CalendarLayout, WeekFrame } from "~/app/calendar/week-frame";
import { useShortcut } from "~/app/shortcuts";
import type { Connection, CourseCode, Day } from "~/core/schema";
import { parseSectionKey } from "~/core/schema";
import type { SeatsMap } from "~/core/seats";
import { DAY_LONG_NAMES } from "~/core/time";
import { useTravel } from "~/state/hooks";
import { selectOpenCourse, useUi } from "~/state/ui-store";
import { BusyBlock, ClassBlock, Ghost, laneStyle, TravelPill } from "./entries";
import {
  type CalendarModel,
  ghostLanesFor,
  MAX_GHOST_LANES,
  type Pill,
  packGhosts,
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
import { GhostHint, PreviewHint, UntimedStrip } from "./strips";
import { type CalendarView, useCalendarModel } from "./use-calendar-model";

// The week calendar (SPEC §3.3): the plan's classes and blocks, the open
// course's other sections as ghosts, travel pills, and drag to block time.
// Layout is computed in layout.ts; this file draws it and handles input.

const WEEKDAYS: readonly Day[] = ["M", "Tu", "W", "Th", "F"];

/** Ghost labels shrink to the section code below this width (px). */
const NARROW_GHOST = 76;

export function Calendar() {
  const view = useCalendarModel();
  const { model, current } = view;
  useGhostKeys(view);
  useClearStalePreview(model);

  if (!model || !current)
    return (
      <WeekFrame days={WEEKDAYS} startMinute={8 * 60} endMinute={17 * 60} />
    );

  const ghostColor = model.ghost?.color ?? null;

  return (
    <WeekFrame
      days={model.days}
      startMinute={model.startMinute}
      endMinute={model.endMinute}
      top={
        <>
          {view.previewing ? (
            <PreviewHint
              label={view.previewing.label}
              planName={current.plan.name}
            />
          ) : null}
          {model.ghost && ghostColor ? (
            <GhostHint
              ghost={model.ghost}
              interactive={view.ghostsFromOpenCourse}
              readOnly={current.readOnly}
              color={ghostColor}
            />
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
  // Menus, lists and popups use the arrows and Enter themselves. A focused
  // calendar block doesn't: the preview wins, and preventing the default
  // keeps Enter from also clicking it.
  const notOnAControl = (event: KeyboardEvent) =>
    !(
      event.target instanceof Element &&
      event.target.closest(
        "[role=menu],[role=listbox],[role=dialog],[role=tablist],[data-slot=popover-content]",
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

  const n = model.columns.length;
  const colWidth = n > 0 ? width / n : 0;
  // Phones fit fewer side-by-side ghosts than the model's desktop default.
  const maxGhostLanes = ghostLanesFor(colWidth);
  const columns = useMemo(
    () =>
      maxGhostLanes >= MAX_GHOST_LANES
        ? model.columns
        : model.columns.map((column) => ({
            ...column,
            ghosts: packGhosts(column.ghosts, maxGhostLanes),
          })),
    [model.columns, maxGhostLanes],
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

  return (
    <div
      ref={ref}
      role="presentation"
      className={cn("absolute inset-0 flex", canDrag && "cursor-crosshair")}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => setDrag(null)}
      onPointerLeave={() => {
        clearTimeout(hintTimer.current);
        setHint(null);
      }}
    >
      {columns.map((column) => (
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
          {column.entries.map((entry) => {
            const style = laneStyle(entry, layout.yOf);
            const height = layout.yOf(entry.end) - layout.yOf(entry.start);
            if (entry.kind === "block")
              return (
                <BusyBlock
                  key={entry.key}
                  entry={entry}
                  height={height}
                  dimmed={ghostCourse !== null}
                  style={style}
                />
              );
            return (
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
              />
            );
          })}
          {column.ghosts.map((ghost) => (
            <Ghost
              key={ghost.key}
              entry={ghost}
              height={layout.yOf(ghost.end) - layout.yOf(ghost.start)}
              narrow={colWidth / ghost.lanes < NARROW_GHOST}
              readOnly={readOnly}
              seats={seats}
              style={laneStyle(ghost, layout.yOf)}
            />
          ))}
          {placePills(column.pills, layout, colWidth).map(
            ({ pill, top, x }) => (
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
              />
            ),
          )}
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
      ))}
      {hint ? (
        <div
          role="tooltip"
          className="pointer-events-none absolute z-40 rounded-md bg-fg px-2 py-1 text-bg text-xs"
          style={{ left: hint.x + 12, top: hint.y + 14 }}
        >
          Drag to block off time
        </div>
      ) : null}
    </div>
  );
}
