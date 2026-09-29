import { Link, useNavigate } from "@tanstack/react-router";
import { cn } from "cn";
import { Plus } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useMemo, useRef } from "react";
import { Mark } from "~/components/brand/mark";
import { SkipLinks } from "~/components/workbench/skip-links";
import { seasonTermOf } from "~/core/catalog/terms";
import { addDays } from "~/core/ics/dates";
import type { CourseCode, IsoDate, TodoItem } from "~/core/schema";
import {
  type CalendarView,
  courseChatTerm,
  courseKey,
  courseWeeks,
  feedWords,
  isHiddenItem,
  itemCourse,
  NO_COURSE_KEY,
  openCount,
  openWords,
  shiftAnchor,
  viewSpan,
  type WeekStart,
  weekStartOf,
} from "~/core/todo";
import { useAccount } from "~/features/auth/account-store";
import { useSignInAction } from "~/features/auth/sign-in-panel";
import {
  ComingSoonPage,
  SiteHeader,
  SitePage,
} from "~/features/site/site-page";
import { useIsMobile } from "~/hooks/use-media-query";
import { track } from "~/lib/analytics";
import { useShortcut } from "~/lib/shortcuts";
import { EmptyState } from "~/ui/empty-state";
import { InlineError } from "~/ui/inline-error";
import { Popover, PopoverAnchor, PopoverContent } from "~/ui/popover";
import { PAGE_WIDTH, PageFooter } from "~/ui/product-page";
import { Sheet, SheetTitle } from "~/ui/sheet";
import { PageSkeleton, RowSkeleton } from "~/ui/skeleton";
import { noteToast, undoToast } from "~/ui/toast";
import { WithTooltip } from "~/ui/tooltip";
import { MonthGrid, MonthPicker, WeekAgenda, WeekGrid } from "./calendar";
import { COMPOSER_ID, startTask, useComposerRequest } from "./composer";
import { todoCourseColors, useSchedulerCourses } from "./course-colors";
import { SamplePreview } from "./sample";
import {
  type CourseRow,
  CoursesPanel,
  TaskPanel,
  TODO_CONNECT_PATH,
} from "./side-panel";
import { TASK_TOAST_ID } from "./task-form";
import {
  closeTodoPanel,
  openTodoPanel,
  PANEL_BUTTONS,
  TODO_PATH,
  TodoBarActions,
  TodoBarContext,
  type TodoPanel,
  useNow,
  useTodoBar,
  useWeekStart,
  VIEW_SHORTCUTS,
} from "./todo-bar";
import { type CheckedVia, DayList, type ViewProps } from "./todo-lists";
import { useTodo } from "./todo-store";

// `/todo` (docs/V3.md §3.9): a calendar of what's due, under the family bar
// with Todo's controls (./todo-bar: the views, the week and its title, Add
// a task, and the courses and ELMS), as Schedule's and Plan's bars hold
// theirs. The calendar fills the page; the two panels (./side-panel) open
// from the bar, as popovers on a desktop and sheets on a phone. The week is
// the default, then the month and the list; each is a URL. Signed out,
// it's the front door. Nothing here is stored in the browser.

export { TEXT_LINK, TODO_CONNECT_PATH } from "./side-panel";
export { TODO_PATH, useNow } from "./todo-bar";

/** The calendar's id: the skip link and focus land there. */
const CANVAS_ID = "todo-calendar";

const PANEL_TITLES: Record<TodoPanel, string> = {
  task: "Add a task",
  courses: "Courses and ELMS",
};

/**
 * One of the bar's panels: a popover under its button on a desktop, as
 * the bell's inbox and Share are, and a sheet on a phone. Adding a task
 * focuses the field (keyboard and all); the courses and ELMS focus the
 * panel itself, so a phone's keyboard stays down.
 */
function BarPanel({
  which,
  mobile,
  children,
}: {
  which: TodoPanel;
  mobile: boolean;
  children: ReactNode;
}) {
  const open = useTodoBar((s) => s.panel === which);
  const body = useRef<HTMLDivElement>(null);
  const onOpenChange = (next: boolean) => {
    if (!next && useTodoBar.getState().panel === which) closeTodoPanel();
  };
  const title = PANEL_TITLES[which];
  const focusFirst = () =>
    which === "task" ? document.getElementById(COMPOSER_ID) : null;
  if (mobile)
    return (
      <Sheet
        open={open}
        onOpenChange={onOpenChange}
        initialFocus={() => focusFirst() ?? body.current ?? true}
      >
        <SheetTitle className="sr-only">{title}</SheetTitle>
        <div
          ref={body}
          tabIndex={-1}
          className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain pb-4 outline-none"
        >
          {children}
        </div>
      </Sheet>
    );
  const button = PANEL_BUTTONS[which];
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor virtualRef={button} />
      <PopoverContent
        side="bottom"
        align="end"
        role="dialog"
        aria-label={title}
        className="scroll-thin max-h-[min(40rem,var(--radix-popover-content-available-height))] w-[380px] overflow-y-auto overscroll-y-contain p-0"
        // Its button toggles it: a press on it isn't a click away.
        onInteractOutside={(e) => {
          if (button.current?.contains(e.target as Node)) e.preventDefault();
        }}
        onOpenAutoFocus={(e) => {
          const first = focusFirst();
          if (!first) return;
          e.preventDefault();
          first.focus({ preventScroll: true });
        }}
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}

/** How many weeks each course's chart shows, ending with the week shown. */
const CHART_WEEKS = 4;

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

/** W, M and L switch views; P, N and T move the calendar; Q starts a task. */
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
  // Here, not in the composer: a phone's is in a sheet that Q opens.
  useShortcut({ key: "q" }, () => {
    startTask();
    return true;
  });
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
  const checked = refreshing
    ? "Checking ELMS…"
    : // The panel says what to do; the bar says it's happened.
      feed?.status === "broken"
      ? "ELMS stopped sharing your calendar"
      : words.checked;
  const openLine = ready
    ? `${openWords(openCount(shown, done))}${checked ? ` · ${checked}` : ""}`
    : null;
  const term = seasonTermOf(weekStartOf(anchor, weekStart));
  const mainPlan = scheduler.mainPlans[term];
  // The bar says what's open and links the week's classes (./todo-bar).
  useEffect(() => {
    useTodoBar.setState({
      status: openLine,
      schedule: {
        term,
        planId: mainPlan?.id,
        planName: mainPlan?.name,
      },
    });
  }, [openLine, term, mainPlan]);
  useEffect(
    () => () =>
      useTodoBar.setState({ status: null, schedule: null, panel: null }),
    [],
  );

  // The composer is in the bar's panel: a task started anywhere (+, Q, an
  // empty day, the first visit) opens it, and the composer takes the day.
  const request = useComposerRequest();
  const panelOpen = useTodoBar((s) => s.panel);
  useEffect(() => {
    if (request.seq !== request.taken && panelOpen !== "task")
      openTodoPanel("task");
  }, [request, panelOpen]);

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
    ) : view === "list" ? (
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
    );

  const loadingPanel = <RowSkeleton rows={4} label="Loading" />;

  return (
    <>
      <Shortcuts view={view} anchor={anchor} weekStart={weekStart} />
      {/* The page's h1 is the bar's title (./todo-bar). */}
      <main
        id={CANVAS_ID}
        tabIndex={-1}
        className={cn(
          "scroll-thin flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-y-contain outline-none",
          mobile ? "px-4 pt-3 pb-8" : "p-4",
        )}
      >
        {firstVisit}
        {calendar}
      </main>
      <BarPanel which="task" mobile={mobile}>
        {ready ? (
          <TaskPanel
            courses={taskCourses}
            colors={colors}
            weekStart={weekStart}
            onAdded={closeTodoPanel}
          />
        ) : (
          loadingPanel
        )}
      </BarPanel>
      <BarPanel which="courses" mobile={mobile}>
        {ready ? (
          <CoursesPanel
            weekStart={weekStart}
            onWeekStart={setWeekStart}
            rows={rows}
            lastWeek={lastWeek}
            isThisWeek={lastWeek === weekStartOf(today, weekStart)}
            onHide={onHide}
            feed={feed}
            now={now}
            hasFileItems={items.some((i) => i.source === "file")}
          />
        ) : (
          loadingPanel
        )}
      </BarPanel>
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
    // Its panes end above a phone's tab bar (--tab-bar-space, styles.css).
    <div
      data-app-shell=""
      className="flex h-dvh flex-col bg-bg pb-(--tab-bar-space) text-fg"
    >
      {status === "signed-in" ? (
        <SkipLinks canvasId={CANVAS_ID} canvasName="calendar" />
      ) : null}
      <SiteHeader
        // Todo's controls, in the bar (./todo-bar), once there's a calendar.
        context={
          status === "signed-in" ? (
            <TodoBarContext view={view} anchor={anchor} />
          ) : undefined
        }
        status={
          status === "signed-in" ? (
            <TodoBarActions view={view} anchor={anchor} />
          ) : undefined
        }
      />
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
