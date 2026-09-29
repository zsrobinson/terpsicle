import { Link, useNavigate } from "@tanstack/react-router";
import { cn } from "cn";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ListChecks,
  Plus,
} from "lucide-react";
import {
  createRef,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { create } from "zustand";
import { termLabel } from "~/core/catalog/terms";
import { todoWeekStart, withTodoWeekStart } from "~/core/prefs";
import type { IsoDate, TermId } from "~/core/schema";
import {
  type CalendarView,
  isCurrentPeriod,
  monthTitle,
  newYorkClock,
  shiftAnchor,
  type WeekStart,
  weekStartOf,
  weekTitle,
} from "~/core/todo";
import { saveSyncedPrefs, useSyncedPrefs } from "~/features/prefs/synced-prefs";
import { track } from "~/lib/analytics";
import { crossLinkClicked } from "~/lib/cross-link";
import {
  ActionMenu,
  ActionMenuLinkItem,
  ActionMenuRadioGroup,
  ActionMenuRadioItem,
  ActionMenuSeparator,
  usePhoneMenus,
} from "~/ui/action-menu";
import { Button } from "~/ui/button";
import { BarTitle } from "~/ui/page-header";
import { WithTooltip } from "~/ui/tooltip";
import { type View, ViewSwitch } from "~/ui/view-switch";
import { ScheduleLink } from "./calendar";
import { startTask } from "./composer";

// Todo's controls in the family bar (docs/decisions.md, "One bar at the
// top"), as Schedule and Plan keep theirs: the views, Back, Today and
// Ahead, the week's title with what's open under it, then + (Add a task)
// and Courses and ELMS, each opening its panel (./side-panel): a popover
// under its button on a desktop, a sheet on a phone (`TodoPanels` in
// ./todo-page). The calendar then fills the page under the bar. On a phone
// the views and the moving about are one sheet too (the kit's ActionMenu).

export const TODO_PATH = "/todo";

export const VIEW_SHORTCUTS: Record<CalendarView, string> = {
  week: "W",
  month: "M",
  list: "L",
};

/** New York's date and the time, ticking each minute for "checked 14 minutes ago". */
export function useNow(): { now: number; today: IsoDate } {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return { now, today: newYorkClock(now).date };
}

/** The day Todo's weeks start on, following the account (Monday until it's read). */
export function useWeekStart(): [WeekStart, (start: WeekStart) => void] {
  const prefs = useSyncedPrefs();
  const set = useCallback((start: WeekStart) => {
    track("todo_week_start_changed", { start });
    void saveSyncedPrefs((p) => withTodoWeekStart(p, start));
  }, []);
  return [todoWeekStart(prefs ?? {}), set];
}

/**
 * What the calendar says about itself, for the bar: "5 open · ELMS feed
 * checked 2 minutes ago" once it's loaded, and the scheduler's plan for the
 * week's term. The calendar (./todo-page) writes it; the bar reads it.
 */
export interface TodoBarState {
  status: string | null;
  schedule: { term: TermId; planId?: string; planName?: string } | null;
  /** The open panel: adding a task, or the courses and ELMS. */
  panel: TodoPanel | null;
}

export type TodoPanel = "task" | "courses";

export const useTodoBar = create<TodoBarState>()(() => ({
  status: null,
  schedule: null,
  panel: null,
}));

export function openTodoPanel(panel: TodoPanel): void {
  useTodoBar.setState({ panel });
}

export function closeTodoPanel(): void {
  useTodoBar.setState({ panel: null });
}

/** The bar's buttons, which a desktop's panels hang from. */
export const PANEL_BUTTONS: Record<
  TodoPanel,
  RefObject<HTMLButtonElement | null>
> = { task: createRef(), courses: createRef() };

function viewTitle(
  view: CalendarView,
  anchor: IsoDate,
  today: IsoDate,
  weekStart: WeekStart,
): string {
  return view === "week"
    ? weekTitle(weekStartOf(anchor, weekStart), today)
    : view === "month"
      ? monthTitle(anchor)
      : "Everything due";
}

function scheduleLabel(schedule: NonNullable<TodoBarState["schedule"]>) {
  return schedule.planName
    ? `Opens ${schedule.planName}, your main plan for ${termLabel(schedule.term)}`
    : `Your ${termLabel(schedule.term)} classes`;
}

function TodoViews({ view, anchor }: { view: CalendarView; anchor: IsoDate }) {
  // Counted as the view changes, from the switch, a key or Back.
  const shown = useRef(view);
  useEffect(() => {
    if (shown.current === view) return;
    shown.current = view;
    track("todo_view_changed", { view });
  }, [view]);
  const views: View[] = [
    {
      id: "week",
      label: "Week",
      hint: "The week, day by day",
      shortcut: VIEW_SHORTCUTS.week,
      to: TODO_PATH,
      search: { view: "week", date: anchor },
    },
    {
      id: "month",
      label: "Month",
      hint: "The whole month",
      shortcut: VIEW_SHORTCUTS.month,
      to: TODO_PATH,
      search: { view: "month", date: anchor },
    },
    {
      id: "list",
      label: "List",
      hint: "Everything due, by day",
      shortcut: VIEW_SHORTCUTS.list,
      to: TODO_PATH,
      search: { view: "list" },
    },
  ];
  return (
    <ViewSwitch
      label="Todo views"
      views={views}
      current={view}
      className="shrink-0"
    />
  );
}

/** Back, Today and Ahead: links, so each week or month is a URL. */
function PeriodNav({
  view,
  anchor,
  today,
  weekStart,
}: {
  view: Exclude<CalendarView, "list">;
  anchor: IsoDate;
  today: IsoDate;
  weekStart: WeekStart;
}) {
  const unit = view === "week" ? "week" : "month";
  const back = shiftAnchor(view, anchor, -1, weekStart);
  const ahead = shiftAnchor(view, anchor, 1, weekStart);
  const current = isCurrentPeriod(view, anchor, today, weekStart);
  return (
    <div className="flex shrink-0 items-center">
      <WithTooltip label={`Back a ${unit}`} shortcut="P">
        <Button variant="ghost" size="icon-sm" asChild>
          <Link
            to={TODO_PATH}
            search={{ view, date: back }}
            aria-label={`Back a ${unit}`}
          >
            <ChevronLeft aria-hidden="true" />
          </Link>
        </Button>
      </WithTooltip>
      <WithTooltip label={`Show this ${unit}`} shortcut="T">
        <Button
          variant="ghost"
          size="sm"
          asChild
          className={cn(current && "pointer-events-none opacity-50")}
        >
          <Link
            to={TODO_PATH}
            search={{ view }}
            aria-disabled={current || undefined}
            tabIndex={current ? -1 : undefined}
          >
            Today
          </Link>
        </Button>
      </WithTooltip>
      <WithTooltip label={`Ahead a ${unit}`} shortcut="N">
        <Button variant="ghost" size="icon-sm" asChild>
          <Link
            to={TODO_PATH}
            search={{ view, date: ahead }}
            aria-label={`Ahead a ${unit}`}
          >
            <ChevronRight aria-hidden="true" />
          </Link>
        </Button>
      </WithTooltip>
    </div>
  );
}

/**
 * The bar's context, signed in: the views, Back, Today and Ahead, then the
 * week's title (the page's h1) with what's open under it. A phone keeps the
 * title; the rest is in its sheets (`TodoBarActions`).
 */
export function TodoBarContext({
  view,
  anchor: asked,
}: {
  view: CalendarView;
  anchor?: IsoDate;
}) {
  const { today } = useNow();
  const [weekStart] = useWeekStart();
  const phone = usePhoneMenus();
  const status = useTodoBar((s) => s.status);
  const schedule = useTodoBar((s) => s.schedule);
  const anchor = asked ?? today;
  const title = viewTitle(view, anchor, today, weekStart);
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      {phone ? null : (
        <>
          <TodoViews view={view} anchor={anchor} />
          {view === "list" ? (
            // The list has no periods, but keeps their room, so the title
            // stays put as you switch views.
            <div className="invisible" aria-hidden="true" inert>
              <PeriodNav
                view="week"
                anchor={anchor}
                today={today}
                weekStart={weekStart}
              />
            </div>
          ) : (
            <PeriodNav
              view={view}
              anchor={anchor}
              today={today}
              weekStart={weekStart}
            />
          )}
        </>
      )}
      <BarTitle
        title={title}
        status={
          status ? (
            <>
              <span className="tnum truncate" role="status">
                {status}
              </span>
              {view === "week" && schedule && !phone ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="shrink-0">
                    <ScheduleLink
                      term={schedule.term}
                      planId={schedule.planId}
                      label={scheduleLabel(schedule)}
                      onClick={() => crossLinkClicked("todo", "schedule")}
                    />
                  </span>
                </>
              ) : null}
            </>
          ) : null
        }
      />
    </div>
  );
}

const ICON_BUTTON =
  "flex size-8 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-hover hover:text-fg data-popup-open:bg-hover data-popup-open:text-fg aria-expanded:bg-hover aria-expanded:text-fg max-[380px]:size-7";

/**
 * The bar's end: + (Add a task) and Courses and ELMS, and on a phone first
 * the views and moving about in one sheet (a desktop has those in the
 * bar's context).
 */
export function TodoBarActions({
  view,
  anchor: asked,
}: {
  view: CalendarView;
  anchor?: IsoDate;
}) {
  const phone = usePhoneMenus();
  const navigate = useNavigate();
  const { today } = useNow();
  const [weekStart] = useWeekStart();
  const schedule = useTodoBar((s) => s.schedule);
  const panel = useTodoBar((s) => s.panel);
  const anchor = asked ?? today;
  const period = view === "list" ? null : view;
  const unit = view === "month" ? "month" : "week";
  const pickView = (next: string) => {
    const v = (["week", "month", "list"] as const).find((x) => x === next);
    if (!v) return;
    void navigate({
      to: TODO_PATH,
      search: v === "list" ? { view: v } : { view: v, date: anchor },
    });
  };
  // A press on the open panel's button closes it, as the bell's does. The
  // press moves focus out of the panel first, which closes it, so what
  // counts is whether it was open as the press began.
  const pressed = useRef<TodoPanel | null | undefined>(undefined);
  const notePress = () => {
    pressed.current = useTodoBar.getState().panel;
  };
  const toggle = (which: TodoPanel) => {
    const before = pressed.current === undefined ? panel : pressed.current;
    pressed.current = undefined;
    if (before === which) closeTodoPanel();
    else if (which === "task") startTask();
    else openTodoPanel(which);
  };
  const buttons = (
    <>
      <WithTooltip label="Add a task" shortcut="Q">
        <button
          ref={PANEL_BUTTONS.task}
          type="button"
          aria-label="Add a task"
          aria-expanded={panel === "task"}
          onPointerDown={notePress}
          onClick={() => toggle("task")}
          className={ICON_BUTTON}
        >
          <Plus size={17} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </WithTooltip>
      <WithTooltip label="Your courses' weeks, ELMS, and when weeks start">
        <button
          ref={PANEL_BUTTONS.courses}
          type="button"
          aria-label="Courses and ELMS"
          aria-expanded={panel === "courses"}
          onPointerDown={notePress}
          onClick={() => toggle("courses")}
          className={ICON_BUTTON}
        >
          <ListChecks size={16} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </WithTooltip>
    </>
  );
  if (!phone) return buttons;
  return (
    <>
      <ActionMenu
        title="Calendar"
        description={viewTitle(view, anchor, today, weekStart)}
        tooltip="Week, month or list, and other weeks"
        align="end"
        trigger={
          <button
            type="button"
            aria-label="Views and dates"
            className={ICON_BUTTON}
          >
            <CalendarDays size={16} strokeWidth={1.75} aria-hidden="true" />
          </button>
        }
      >
        <ActionMenuRadioGroup value={view} onValueChange={pickView}>
          {(["week", "month", "list"] as const).map((v) => (
            <ActionMenuRadioItem key={v} value={v} hint={VIEW_WORDS[v].hint}>
              {VIEW_WORDS[v].label}
            </ActionMenuRadioItem>
          ))}
        </ActionMenuRadioGroup>
        {period ? (
          <>
            <ActionMenuSeparator />
            <ActionMenuLinkItem
              icon={<ChevronLeft aria-hidden="true" />}
              render={
                <Link
                  to={TODO_PATH}
                  search={{
                    view: period,
                    date: shiftAnchor(period, anchor, -1, weekStart),
                  }}
                />
              }
            >
              Back a {unit}
            </ActionMenuLinkItem>
            {isCurrentPeriod(period, anchor, today, weekStart) ? null : (
              <ActionMenuLinkItem
                icon={<CalendarDays aria-hidden="true" />}
                render={<Link to={TODO_PATH} search={{ view: period }} />}
              >
                This {unit}
              </ActionMenuLinkItem>
            )}
            <ActionMenuLinkItem
              icon={<ChevronRight aria-hidden="true" />}
              render={
                <Link
                  to={TODO_PATH}
                  search={{
                    view: period,
                    date: shiftAnchor(period, anchor, 1, weekStart),
                  }}
                />
              }
            >
              Ahead a {unit}
            </ActionMenuLinkItem>
          </>
        ) : null}
        {view === "week" && schedule ? (
          <>
            <ActionMenuSeparator />
            <ActionMenuLinkItem
              hint={scheduleLabel(schedule)}
              render={
                <Link
                  to="/schedule"
                  search={
                    schedule.planId
                      ? { term: schedule.term, planId: schedule.planId }
                      : { term: schedule.term }
                  }
                  onClick={() => crossLinkClicked("todo", "schedule")}
                />
              }
            >
              View schedule
            </ActionMenuLinkItem>
          </>
        ) : null}
      </ActionMenu>
      {buttons}
    </>
  );
}

const VIEW_WORDS: Record<CalendarView, { label: string; hint: string }> = {
  week: { label: "Week", hint: "The week, day by day" },
  month: { label: "Month", hint: "The whole month" },
  list: { label: "List", hint: "Everything due, by day" },
};
