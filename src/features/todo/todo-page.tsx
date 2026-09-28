import { Link, useNavigate } from "@tanstack/react-router";
import { cn } from "cn";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { track } from "~/app/analytics";
import { Mark } from "~/app/brand/mark";
import { crossLinkClicked } from "~/app/cross-link";
import { useShortcut } from "~/app/shortcuts";
import { useIsMobile } from "~/app/use-media-query";
import { SkipLinks } from "~/app/workbench/skip-links";
import { seasonTermOf, termLabel } from "~/core/catalog/terms";
import { addDays } from "~/core/ics/dates";
import { todoWeekStart, withTodoWeekStart } from "~/core/prefs";
import type { CourseCode, IsoDate, TodoItem } from "~/core/schema";
import {
  type CalendarView,
  courseChatTerm,
  courseKey,
  courseWeeks,
  feedWords,
  isCurrentPeriod,
  isHiddenItem,
  itemCourse,
  monthTitle,
  NO_COURSE_KEY,
  newYorkClock,
  openCount,
  openWords,
  shiftAnchor,
  viewSpan,
  type WeekStart,
  weekStartOf,
  weekTitle,
} from "~/core/todo";
import { useAccount } from "~/features/auth/account-store";
import { useSignInAction } from "~/features/auth/sign-in-panel";
import { saveSyncedPrefs, useSyncedPrefs } from "~/features/prefs/synced-prefs";
import {
  ComingSoonPage,
  SiteHeader,
  SitePage,
} from "~/features/site/site-page";
import { Button } from "~/ui/button";
import { EmptyState } from "~/ui/empty-state";
import { InlineError } from "~/ui/inline-error";
import { PageHeader } from "~/ui/page-header";
import { PAGE_WIDTH, PageFooter } from "~/ui/product-page";
import { PageSkeleton, RowSkeleton } from "~/ui/skeleton";
import { noteToast, undoToast } from "~/ui/toast";
import { WithTooltip } from "~/ui/tooltip";
import { type View, ViewSwitch } from "~/ui/view-switch";
import {
  MonthGrid,
  MonthPicker,
  ScheduleLink,
  WeekAgenda,
  WeekGrid,
} from "./calendar";
import { startTask } from "./composer";
import { todoCourseColors, useSchedulerCourses } from "./course-colors";
import { SamplePreview } from "./sample";
import { type CourseRow, SidePanel, TODO_CONNECT_PATH } from "./side-panel";
import { TASK_TOAST_ID } from "./task-form";
import { type CheckedVia, DayList, type ViewProps } from "./todo-lists";
import { useTodo } from "./todo-store";

// `/todo` (docs/V3.md §3.9): a calendar of what's due, in the same shape as
// the scheduler and Plan: the family bar, a side panel (adding a task, each
// course's week, ELMS) and the calendar filling the rest. The week is the
// default, then the month and the list; each is a URL. Signed out, it's the
// front door. Nothing here is stored in the browser.

export { TEXT_LINK, TODO_CONNECT_PATH } from "./side-panel";

export const TODO_PATH = "/todo";

/** The calendar's id: the skip link and focus land there. */
const CANVAS_ID = "todo-calendar";
/** The side panel's id. */
const SIDEBAR_ID = "todo-sidebar";

/** How many weeks each course's chart shows, ending with the week shown. */
const CHART_WEEKS = 4;

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
function useWeekStart(): [WeekStart, (start: WeekStart) => void] {
  const prefs = useSyncedPrefs();
  const set = useCallback((start: WeekStart) => {
    track("todo_week_start_changed", { start });
    void saveSyncedPrefs((p) => withTodoWeekStart(p, start));
  }, []);
  return [todoWeekStart(prefs ?? {}), set];
}

/**
 * Where `/todo/connect` goes: the site's frame, a note (560). The calendar
 * is a workbench of its own (`TodoPage`).
 */
export function TodoFrame({ children }: { children: ReactNode }) {
  return <SitePage layout="note">{children}</SitePage>;
}

export function TodoOff() {
  return (
    <ComingSoonPage title="Todo">
      Your deadlines from ELMS and your own tasks, on a calendar.
    </ComingSoonPage>
  );
}

/** Todo's words for its first visit: what it does, in one sentence. */
const WHAT_TODO_DOES =
  "Connect ELMS and your assignments and quizzes land on their due dates, or type your own tasks the way you'd say them. We'll remind you the evening before something's due.";

/** Signed out: the first visit (V3 §3.9), Sign in, and what it looks like. */
function FrontDoor({ returnTo }: { returnTo: string }) {
  const signIn = useSignInAction(returnTo, "todo");
  return (
    <div className="scroll-thin flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div
        className={cn(
          "mx-auto flex w-full flex-1 flex-col gap-8 px-4 pt-6 pb-8",
          PAGE_WIDTH.app,
        )}
      >
        <EmptyState
          headingLevel={1}
          mark={<Mark id="todo" size={40} />}
          title="Your deadlines, on a calendar"
          line={`${WHAT_TODO_DOES} Sign in to start.`}
          primary={signIn}
        />
        <SamplePreview />
      </div>
      {/* A page you read, like Chat's and Plan's front doors. */}
      <PageFooter className={PAGE_WIDTH.app} />
    </div>
  );
}

const VIEW_SHORTCUTS: Record<CalendarView, string> = {
  week: "W",
  month: "M",
  list: "L",
};

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
  return <ViewSwitch label="Todo views" views={views} current={view} />;
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
    <div className="flex items-center">
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

/** W, M and L switch views; P, N and T move the calendar. */
function Shortcuts({
  view,
  anchor,
  weekStart,
}: {
  view: CalendarView;
  anchor: IsoDate;
  weekStart: WeekStart;
}) {
  const navigate = useNavigate();
  const go = (search: { view: CalendarView; date?: IsoDate }) =>
    void navigate({ to: TODO_PATH, search });
  useShortcut(
    (["week", "month", "list"] as const).map((v) => ({
      key: VIEW_SHORTCUTS[v].toLowerCase(),
    })),
    (event) => {
      const next = (["week", "month", "list"] as const).find(
        (v) => VIEW_SHORTCUTS[v].toLowerCase() === event.key.toLowerCase(),
      );
      if (!next) return false;
      go(next === "list" ? { view: next } : { view: next, date: anchor });
      return true;
    },
  );
  useShortcut([{ key: "p" }, { key: "n" }, { key: "t" }], (event) => {
    if (view === "list") return false;
    const key = event.key.toLowerCase();
    if (key === "t") go({ view });
    else
      go({
        view,
        date: shiftAnchor(view, anchor, key === "p" ? -1 : 1, weekStart),
      });
    return true;
  });
  return null;
}

/** One toast for checks: each check's Undo replaces the last one's. */
const DONE_TOAST_ID = "todo-done";

/** One toast for hiding and showing courses. */
const HIDE_TOAST_ID = "todo-hide";

/** The calendar and its side panel, signed in. */
function TodoWorkspace({
  view,
  anchor: asked,
  day,
}: {
  view: CalendarView;
  anchor?: IsoDate;
  day?: IsoDate;
}) {
  const { now, today } = useNow();
  const mobile = useIsMobile();
  const phase = useTodo((s) => s.phase);
  const load = useTodo((s) => s.load);
  const ensureRange = useTodo((s) => s.ensureRange);
  const feed = useTodo((s) => s.feed);
  const items = useTodo((s) => s.items);
  const done = useTodo((s) => s.done);
  const refreshing = useTodo((s) => s.refreshing);
  const setDone = useTodo((s) => s.setDone);
  const hidden = useTodo((s) => s.hidden);
  const hideCourse = useTodo((s) => s.hideCourse);
  const deleteTask = useTodo((s) => s.deleteTask);
  const restoreTask = useTodo((s) => s.restoreTask);
  const scheduler = useSchedulerCourses();
  const chatOn = useAccount((s) => s.flags.chat !== "off");
  const [weekStart, setWeekStart] = useWeekStart();
  const [fold, setFold] = useState(false);
  const anchor = asked ?? today;

  // Once per page, and again when the date turns over.
  useEffect(() => {
    void load(today, Date.now());
  }, [load, today]);

  // A week or month away from today: its dates, and the chart's weeks before it.
  useEffect(() => {
    if (phase !== "ready" || view === "list") return;
    const span = viewSpan(view, anchor, weekStart);
    void ensureRange(span);
  }, [phase, view, anchor, weekStart, ensureRange]);

  useEffect(() => {
    if (phase !== "ready" || !day) return;
    document.getElementById(`day-${day}`)?.scrollIntoView({ block: "nearest" });
  }, [phase, day]);

  const { look, taskCourses, colors } = useMemo(() => {
    const courseOf = (item: TodoItem) =>
      itemCourse(item, scheduler.planCourses);
    const codes = new Set(
      items.map(courseOf).filter((c): c is string => c !== null),
    );
    const colors = todoCourseColors(codes, scheduler.colors);
    const look = (item: TodoItem) => {
      const course = courseOf(item);
      return { course, color: course ? (colors[course] ?? null) : null };
    };
    // What a task can be for: the feed's courses and your plans'.
    const taskCourses: CourseCode[] = [
      ...new Set([...codes, ...scheduler.planCourses]),
    ].sort();
    return { look, taskCourses, colors };
  }, [items, scheduler]);

  // A hidden course's items show nowhere, and count in nothing.
  const shown = useMemo(
    () => items.filter((i) => !isHiddenItem(i, hidden, scheduler.planCourses)),
    [items, hidden, scheduler],
  );

  const lastWeek = weekStartOf(view === "week" ? anchor : today, weekStart);
  const rows = useMemo((): CourseRow[] => {
    const course = (item: TodoItem) => ({
      key: courseKey(item, scheduler.planCourses),
      code: itemCourse(item, scheduler.planCourses),
      label: item.courseLabel,
    });
    const tallied = courseWeeks(items, done, lastWeek, CHART_WEEKS, course);
    // Every course on the list has a row, charted or not, and so does each
    // hidden one, so it can be shown again.
    const byKey = new Map(tallied.map((r) => [r.key, r]));
    for (const item of items) {
      const c = course(item);
      if (!byKey.has(c.key))
        byKey.set(c.key, {
          ...c,
          weeks: Array.from({ length: CHART_WEEKS }, (_, i) => ({
            week: addDays(lastWeek, 7 * (i - CHART_WEEKS + 1)),
            done: 0,
            total: 0,
          })),
        });
    }
    const chatItems = (key: string) =>
      items.filter((i) => course(i).key === key);
    return [...byKey.values()]
      .map((r) => ({
        ...r,
        color: r.code ? (colors[r.code] ?? null) : null,
        hidden: hidden.has(r.key) || (r.code !== null && hidden.has(r.code)),
        chatTerm:
          chatOn && r.code ? courseChatTerm(chatItems(r.key), today) : null,
      }))
      .sort(
        (a, b) =>
          Number(a.hidden) - Number(b.hidden) ||
          Number(a.code === null) - Number(b.code === null) ||
          Number(a.key === NO_COURSE_KEY) - Number(b.key === NO_COURSE_KEY) ||
          a.key.localeCompare(b.key),
      );
  }, [items, done, lastWeek, scheduler, colors, hidden, chatOn, today]);

  const onHide = useCallback(
    (row: CourseRow, hide: boolean) => {
      const name = row.code ?? row.key;
      const send = (value: boolean) =>
        void hideCourse(row.key, value).then((ok) => {
          if (!ok)
            noteToast(
              value ? `${name} didn't hide` : `${name} didn't come back`,
              {
                id: HIDE_TOAST_ID,
                description: "Check your connection and try again.",
                retry: () => send(value),
              },
            );
        });
      send(hide);
      // Hiding takes things off the calendar, so it gets Undo; showing puts
      // them back where they can be seen.
      if (hide)
        undoToast({
          id: HIDE_TOAST_ID,
          message: `Hid ${name}`,
          description: "Its items won't show here or remind you.",
          tooltip: `Show ${name} again`,
          onUndo: () => send(false),
        });
    },
    [hideCourse],
  );

  const onToggle = useCallback(
    (item: TodoItem, via: CheckedVia) => {
      const next = !done.has(item.uid);
      track("todo_item_checked", { done: next, via });
      const mark = (value: boolean) => {
        const save = () =>
          void setDone(item.uid, value).then((ok) => {
            // Takes Undo's place: the check is back as it was.
            if (!ok)
              noteToast("That didn't save", {
                id: DONE_TOAST_ID,
                description: "Check your connection and try again.",
                retry: save,
              });
          });
        save();
      };
      mark(next);
      undoToast({
        id: DONE_TOAST_ID,
        message: `Marked ${item.title} ${next ? "done" : "not done"}`,
        tooltip: next ? "Put it back on the list" : "Mark it done again",
        onUndo: () => mark(!next),
      });
    },
    [done, setDone],
  );

  const onDeleteTask = useCallback(
    (item: TodoItem) => {
      const wasDone = done.has(item.uid);
      const remove = () => {
        const deleting = deleteTask(item.uid).then((ok) => {
          if (!ok)
            noteToast("That didn't delete", {
              id: TASK_TOAST_ID,
              description: "Check your connection and try again.",
              retry: remove,
            });
          return ok;
        });
        undoToast({
          id: TASK_TOAST_ID,
          message: `Deleted ${item.title}`,
          tooltip: "Put it back on the list",
          // After the delete has landed, so the two can't cross.
          onUndo: () =>
            void deleting.then(async (deleted) => {
              if (!deleted) return;
              if (!(await restoreTask(item, wasDone)))
                noteToast("That didn't go back on the list", {
                  id: TASK_TOAST_ID,
                  description: "Check your connection and add it again.",
                });
            }),
        });
      };
      remove();
    },
    [done, deleteTask, restoreTask],
  );

  const props: ViewProps = {
    items: shown,
    done,
    today,
    now,
    weekStart,
    look,
    onToggle,
    taskCourses,
    onDeleteTask,
  };

  const ready = phase === "ready";
  const empty = ready && !feed && items.length === 0;
  const words = feedWords(feed, now);
  const checked = refreshing ? "Checking ELMS…" : words.checked;
  const title =
    view === "week"
      ? weekTitle(weekStartOf(anchor, weekStart), today)
      : view === "month"
        ? monthTitle(anchor)
        : "Everything due";
  const term = seasonTermOf(weekStartOf(anchor, weekStart));

  const header = (
    <PageHeader
      title={title}
      status={
        ready ? (
          <>
            <span className="tnum" role="status">
              {openWords(openCount(shown, done))}
              {checked ? ` · ${checked}` : ""}
            </span>
            {view === "week" ? (
              <>
                <span aria-hidden="true">·</span>
                <ScheduleLink
                  term={term}
                  planId={scheduler.mainPlans[term]?.id}
                  label={
                    scheduler.mainPlans[term]
                      ? `Opens ${scheduler.mainPlans[term].name}, your main plan for ${termLabel(term)}`
                      : `Your ${termLabel(term)} classes`
                  }
                  onClick={() => crossLinkClicked("todo", "schedule")}
                />
              </>
            ) : null}
          </>
        ) : null
      }
      views={<TodoViews view={view} anchor={anchor} />}
      actions={
        view === "list" ? (
          // The list has no periods, but keeps their room, so Week, Month
          // and List stay put when you switch between them.
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
        )
      }
    />
  );

  // The first visit: what Todo does, and its two ways in.
  const firstVisit = empty ? (
    <EmptyState
      title="Your deadlines, on a calendar"
      line={WHAT_TODO_DOES}
      equal
      primary={{
        label: "Connect ELMS",
        hint: "Paste your ELMS calendar link: three steps",
        to: TODO_CONNECT_PATH,
      }}
      secondary={{
        label: "Add a task",
        icon: <Plus aria-hidden="true" />,
        hint: "Type a task in the box, with its date",
        shortcut: "Q",
        onClick: () => startTask(),
      }}
      className="py-2"
    />
  ) : null;

  const calendar =
    phase === "failed" ? (
      <InlineError
        message="We couldn't load your calendar. Check your connection and try again."
        onRetry={() => void load(today, Date.now())}
      />
    ) : !ready ? (
      <PageSkeleton rows={4} label="Loading your calendar" />
    ) : (
      <>
        {view === "list" ? (
          <DayList {...props} />
        ) : view === "week" ? (
          mobile ? (
            <WeekAgenda anchor={anchor} props={props} />
          ) : (
            <WeekGrid anchor={anchor} props={props} />
          )
        ) : mobile ? (
          <MonthPicker
            anchor={anchor}
            props={props}
            dayLink={(date, children, label) => (
              <WithTooltip label={label}>
                <Link
                  to={TODO_PATH}
                  search={{ view: "month", date }}
                  replace
                  aria-label={label}
                  aria-current={date === anchor ? "date" : undefined}
                >
                  {children}
                </Link>
              </WithTooltip>
            )}
          />
        ) : (
          <MonthGrid
            anchor={anchor}
            props={props}
            weekLink={(date, more) => (
              <WithTooltip label="See the whole week">
                <Link
                  to={TODO_PATH}
                  search={{ view: "week", date }}
                  className="px-2 text-left text-muted text-xs hover:text-fg hover:underline"
                >
                  +{more} more
                </Link>
              </WithTooltip>
            )}
          />
        )}
      </>
    );

  const panel = ready ? (
    <SidePanel
      courses={taskCourses}
      colors={colors}
      weekStart={weekStart}
      onWeekStart={setWeekStart}
      rows={rows}
      lastWeek={lastWeek}
      isThisWeek={lastWeek === weekStartOf(today, weekStart)}
      onHide={onHide}
      feed={feed}
      now={now}
      hasFileItems={items.some((i) => i.source === "file")}
      fold={mobile ? { open: fold, onOpenChange: setFold } : undefined}
    />
  ) : (
    <RowSkeleton rows={4} label="Loading" />
  );

  return (
    <>
      <Shortcuts view={view} anchor={anchor} weekStart={weekStart} />
      {mobile ? (
        <main
          id={CANVAS_ID}
          tabIndex={-1}
          className="scroll-thin min-h-0 flex-1 overflow-y-auto px-4 pt-4 pb-8 outline-none"
        >
          <div className="flex flex-col gap-4">
            {header}
            {firstVisit}
            <div id={SIDEBAR_ID}>{panel}</div>
            {calendar}
          </div>
        </main>
      ) : (
        <div className="flex min-h-0 flex-1">
          <aside
            id={SIDEBAR_ID}
            aria-label="Sidebar"
            tabIndex={-1}
            className="scroll-thin w-sidebar shrink-0 overflow-y-auto overscroll-y-contain border-hairline border-r outline-none"
          >
            {panel}
          </aside>
          <main
            id={CANVAS_ID}
            tabIndex={-1}
            className="scroll-thin min-w-0 flex-1 overflow-y-auto overscroll-y-contain px-6 pt-4 pb-8 outline-none"
          >
            <div className="flex min-h-full flex-col gap-4">
              {header}
              {firstVisit}
              {calendar}
            </div>
          </main>
        </div>
      )}
    </>
  );
}

/** `/todo`, whoever's looking. */
export function TodoPage({
  view,
  anchor,
  day,
}: {
  view: CalendarView;
  anchor?: IsoDate;
  day?: IsoDate;
}) {
  const status = useAccount((s) => s.status);
  const on = useAccount((s) => s.flags.todo);
  if (status !== "loading" && !on) return <TodoOff />;
  // One frame for every state, so the family bar stays mounted (with focus
  // in it) as the account and the calendar arrive.
  return (
    <div data-app-shell="" className="flex h-dvh flex-col bg-bg text-fg">
      {status === "signed-in" ? (
        <SkipLinks
          canvasId={CANVAS_ID}
          canvasName="calendar"
          sidebarId={SIDEBAR_ID}
          onSidebar={() => document.getElementById(SIDEBAR_ID)?.focus()}
        />
      ) : null}
      <SiteHeader />
      {status === "loading" ? (
        <div className={cn("mx-auto w-full px-4 pt-6", PAGE_WIDTH.app)}>
          <PageSkeleton rows={4} label="Loading your calendar" />
        </div>
      ) : status === "signed-out" ? (
        <FrontDoor returnTo={TODO_PATH} />
      ) : (
        <TodoWorkspace view={view} anchor={anchor} day={day} />
      )}
    </div>
  );
}
