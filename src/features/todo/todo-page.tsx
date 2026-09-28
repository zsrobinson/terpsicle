import { Link } from "@tanstack/react-router";
import { cn } from "cn";
import { ExternalLink, RefreshCw } from "lucide-react";
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
import { useMediaQuery } from "~/app/use-media-query";
import type { CourseCode, IsoDate, TodoItem } from "~/core/schema";
import {
  compareItems,
  feedWords,
  hiddenWords,
  isHiddenItem,
  itemCourse,
  listRange,
  newYorkClock,
  openCount,
  openWords,
  weekProgress,
  weekProgressWords,
} from "~/core/todo";
import { useAccount } from "~/features/auth/account-store";
import { useSignInAction } from "~/features/auth/sign-in-panel";
import { usePushAskCard } from "~/features/notifications/push-ask";
import { PushAskCard } from "~/features/notifications/push-ask-card";
import {
  ComingSoonPage,
  type SiteLayout,
  SitePage,
} from "~/features/site/site-page";
import { Button } from "~/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/ui/dropdown-menu";
import { EmptyState } from "~/ui/empty-state";
import { InlineError } from "~/ui/inline-error";
import { PageHeader } from "~/ui/page-header";
import { PageSection } from "~/ui/page-section";
import { PAGE_WIDTH } from "~/ui/product-page";
import { PageSkeleton } from "~/ui/skeleton";
import { noteToast, undoToast } from "~/ui/toast";
import { WithTooltip } from "~/ui/tooltip";
import { type View, ViewSwitch } from "~/ui/view-switch";
import {
  ConnectForm,
  ELMS_CALENDAR_URL,
  WHAT_COMES_THROUGH,
} from "./connect-form";
import { todoCourseColors, useSchedulerCourses } from "./course-colors";
import { QuickAdd, TASK_TOAST_ID } from "./task-form";
import { TodoItemRow } from "./todo-item";
import {
  CourseList,
  DayList,
  groupName,
  type ItemLook,
  type ListProps,
} from "./todo-lists";
import { useTodo } from "./todo-store";
import { WeekView } from "./week-view";

// `/todo` (docs/V3.md §3.9): the front door when signed out; the first
// visit, with the paste, when ELMS isn't connected; the list by day, by
// course or (desktop) the week once it is. Nothing here is stored in the
// browser.

export type TodoView = "day" | "course" | "week";

export const TODO_PATH = "/todo";
export const TODO_CONNECT_PATH = "/todo/connect";

/** The list's title: what the page shows, not the product's name. */
const TITLE = "Deadlines and exams";

/** An inline link in running text. */
export const TEXT_LINK =
  "text-fg underline decoration-hairline-strong underline-offset-2 hover:decoration-fg";

/** New York's date and the time, ticking each minute for "checked 14 min ago". */
export function useNow(): { now: number; today: IsoDate } {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return { now, today: newYorkClock(now).date };
}

/**
 * Where Todo's pages go: the site's frame. The list is an app page (1120),
 * and so is its first visit, in a note's column at the list's left edge;
 * the front door and `/todo/connect` are a note (560).
 */
export function TodoFrame({
  width = "app",
  children,
}: {
  width?: SiteLayout;
  children: ReactNode;
}) {
  return <SitePage layout={width}>{children}</SitePage>;
}

export function TodoOff() {
  return (
    <ComingSoonPage title="Todo">
      Your deadlines and exams from ELMS, in one list.
    </ComingSoonPage>
  );
}

/** A page of deadlines on its way: the header's lines, then rows. */
export function TodoSkeleton() {
  return <PageSkeleton rows={4} label="Loading your deadlines" />;
}

const SAMPLE: readonly TodoItem[] = [
  {
    uid: "sample-1",
    source: "elms",
    title: "Project 2",
    courseLabel: "CMSC216-0103: Introduction to Computer Systems",
    courseCode: "CMSC216",
    sectionCode: "0103",
    kind: "assignment",
    exam: false,
    gradescope: true,
    dueAt: "2026-10-01T03:59:00.000Z",
    dueDate: "2026-09-30",
    link: null,
  },
  {
    uid: "sample-2",
    source: "elms",
    title: "WebAssign 5",
    courseLabel: "MATH240-0201: Introduction to Linear Algebra",
    courseCode: "MATH240",
    sectionCode: "0201",
    kind: "assignment",
    exam: false,
    gradescope: false,
    dueAt: "2026-10-01T03:59:00.000Z",
    dueDate: "2026-09-30",
    link: null,
  },
  {
    uid: "sample-3",
    source: "elms",
    title: "Midterm 1",
    courseLabel: "CMSC216-0103: Introduction to Computer Systems",
    courseCode: "CMSC216",
    sectionCode: "0103",
    kind: "event",
    exam: true,
    gradescope: false,
    dueAt: "2026-10-02T17:00:00.000Z",
    dueDate: "2026-10-02",
    link: null,
  },
];

/** Signed out: the first visit (V3 §3.9), Sign in, and what it looks like. */
export function FrontDoor({ returnTo }: { returnTo: string }) {
  const colors = todoCourseColors(["CMSC216", "MATH240"], {});
  const signIn = useSignInAction(returnTo, "todo");
  return (
    <>
      <EmptyState
        headingLevel={1}
        mark={<Mark id="todo" size={40} />}
        title="Your deadlines and exams, in one list"
        line="Sign in, then paste your ELMS calendar link, and your deadlines show up here. We'll remind you the evening before something's due."
        primary={signIn}
      />
      <PageSection title="What it looks like" className="mt-4">
        <p className="text-muted text-sm">{WHAT_COMES_THROUGH}</p>
        <ul aria-label="A sample list">
          {SAMPLE.map((item) => (
            <TodoItemRow
              key={item.uid}
              item={item}
              done={false}
              course={item.courseCode}
              color={item.courseCode ? (colors[item.courseCode] ?? null) : null}
              when={
                item.dueDate === "2026-09-30"
                  ? "Tomorrow · 11:59pm"
                  : "Friday · 1pm"
              }
              preview
            />
          ))}
        </ul>
      </PageSection>
    </>
  );
}

const VIEWS: readonly View[] = [
  {
    id: "day",
    label: "By day",
    hint: "What's due each day",
    to: TODO_PATH,
    search: {},
  },
  {
    id: "course",
    label: "By course",
    hint: "What's due in each course",
    to: TODO_PATH,
    search: { view: "course" },
  },
  {
    id: "week",
    label: "Week",
    hint: "The week, day by day",
    to: TODO_PATH,
    search: { view: "week" },
  },
];

/** Phones have no week: "Week" goes, and By day stands in for it. */
function TodoViews({ view }: { view: TodoView }) {
  const wide = useMediaQuery("(min-width: 768px)");
  // Counted as the view changes, from the switch or Back.
  const shown = useRef(view);
  useEffect(() => {
    if (shown.current === view) return;
    shown.current = view;
    track("todo_view_changed", { view });
  }, [view]);
  return (
    <ViewSwitch
      label="Todo views"
      views={wide ? VIEWS : VIEWS.filter((v) => v.id !== "week")}
      current={!wide && view === "week" ? "day" : view}
    />
  );
}

function RefreshButton() {
  const refresh = useTodo((s) => s.refresh);
  const refreshing = useTodo((s) => s.refreshing);
  return (
    <WithTooltip label="Check ELMS now">
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Check ELMS now"
        disabled={refreshing}
        onClick={() => void refresh()}
        className="max-md:-my-3"
      >
        <RefreshCw aria-hidden="true" className="size-3" />
      </Button>
    </WithTooltip>
  );
}

const TOO_SOON = "ELMS was checked in the last 5 minutes.";
const NO_ANSWER = "ELMS didn't answer. We'll try again in 20 minutes.";

/** One toast for checks: each check's Undo replaces the last one's. */
const DONE_TOAST_ID = "todo-done";

/** One toast for hiding and showing courses. */
const HIDE_TOAST_ID = "todo-hide";

/**
 * Signed in, before ELMS: Todo's first visit, the kit's template like the
 * other products'. Step one is its button; the paste is right under it. It
 * sits in the list's own column, so connecting doesn't move the page: the
 * list takes its place, at its width.
 */
function FirstConnect({
  courses,
  today,
}: {
  courses: readonly CourseCode[];
  today: IsoDate;
}) {
  return (
    <div className={cn("flex w-full flex-col gap-6", PAGE_WIDTH.note)}>
      <EmptyState
        headingLevel={1}
        mark={<Mark id="todo" size={40} />}
        title="Connect ELMS to see your deadlines"
        line="Open your ELMS calendar, click Calendar Feed at the bottom right and copy the link. Paste it below and your deadlines show up here."
        primary={{
          label: "Open your ELMS calendar",
          icon: <ExternalLink aria-hidden="true" />,
          hint: "Opens ELMS in a new tab, so you can come back and paste",
          href: ELMS_CALENDAR_URL,
          newTab: true,
        }}
        secondary={{
          label: "or add a calendar file",
          hint: "Add an .ics file instead, from the ELMS link page",
          to: TODO_CONNECT_PATH,
        }}
      />
      <div className="flex flex-col gap-3">
        <ConnectForm />
        <p className="text-muted text-sm">{WHAT_COMES_THROUGH}</p>
        <p className="text-muted text-sm">
          We keep the link encrypted.{" "}
          <WithTooltip label="What we do with the link, and adding a calendar file">
            <Link to={TODO_CONNECT_PATH} className={TEXT_LINK}>
              More about the link
            </Link>
          </WithTooltip>
        </p>
      </div>
      <PageSection title="Or start with your own tasks">
        <p className="text-muted text-sm">
          Add a task and your list starts here. Your tasks stay in Terpsicle and
          never go to ELMS.
        </p>
        <QuickAdd courses={courses} today={today} />
      </PageSection>
    </div>
  );
}

/** The list once signed in: header, view, items. `TodoPage` frames it. */
export function TodoList({ view, day }: { view: TodoView; day?: IsoDate }) {
  const { now, today } = useNow();
  const phase = useTodo((s) => s.phase);
  const load = useTodo((s) => s.load);
  const feed = useTodo((s) => s.feed);
  const items = useTodo((s) => s.items);
  const done = useTodo((s) => s.done);
  const refreshing = useTodo((s) => s.refreshing);
  const refreshNote = useTodo((s) => s.refreshNote);
  const setDone = useTodo((s) => s.setDone);
  const hidden = useTodo((s) => s.hidden);
  const hideCourse = useTodo((s) => s.hideCourse);
  const deleteTask = useTodo((s) => s.deleteTask);
  const restoreTask = useTodo((s) => s.restoreTask);
  const scheduler = useSchedulerCourses();
  const chatOn = useAccount((s) => s.flags.chat !== "off");
  // Connecting ELMS from the first visit lands here: the list is where its
  // ask shows (V2 §6.7), so the page holds the place from the start.
  usePushAskCard("todo-connected");

  // Once per page, and again when the date turns over.
  useEffect(() => {
    void load(today, Date.now());
  }, [load, today]);

  useEffect(() => {
    if (phase !== "ready" || !day) return;
    document.getElementById(`day-${day}`)?.scrollIntoView({ block: "start" });
  }, [phase, day]);

  const { look, taskCourses } = useMemo(() => {
    const courseOf = (item: TodoItem) =>
      itemCourse(item, scheduler.planCourses);
    const codes = new Set(
      items.map(courseOf).filter((c): c is string => c !== null),
    );
    const colors = todoCourseColors(codes, scheduler.colors);
    const look = (item: TodoItem): ItemLook => {
      const course = courseOf(item);
      return { course, color: course ? (colors[course] ?? null) : null };
    };
    // What an own task can be for: the feed's courses and your plans'.
    const taskCourses = [
      ...new Set([...codes, ...scheduler.planCourses]),
    ].sort();
    return { look, taskCourses };
  }, [items, scheduler]);

  // A hidden course's items show nowhere, and count in nothing.
  const shown = useMemo(
    () => items.filter((i) => !isHiddenItem(i, hidden, scheduler.planCourses)),
    [items, hidden, scheduler],
  );

  const setHidden = useCallback(
    (key: string, name: string, hide: boolean) => {
      const send = (value: boolean) =>
        void hideCourse(key, value).then((ok) => {
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
      // Hiding takes things off the list, so it gets Undo; showing puts
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
    (item: TodoItem, via: "list" | "week") => {
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
      // A check folds the item away, so it gets Undo like any change.
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
          // Takes Undo's place: the task is back on the list.
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

  if (phase === "idle" || phase === "loading") return <TodoSkeleton />;
  if (phase === "failed")
    return (
      <>
        <PageHeader title={TITLE} />
        <InlineError
          message="We couldn't load your list. Check your connection and try again."
          onRetry={() => void load(today, Date.now())}
        />
      </>
    );

  if (!feed && items.length === 0)
    return <FirstConnect courses={taskCourses} today={today} />;

  const open = openCount(shown, done);
  const progress = weekProgressWords(weekProgress(shown, done, today));
  const words = feedWords(feed, now);
  const noteUid =
    [...shown]
      .filter(
        (i) =>
          i.gradescope &&
          !done.has(i.uid) &&
          i.dueDate !== null &&
          i.dueDate >= today,
      )
      .sort(compareItems)[0]?.uid ?? null;
  const props: ListProps = {
    items: shown,
    done,
    today,
    now,
    look,
    noteUid,
    onToggle: (item) => onToggle(item, "list"),
    taskCourses,
    onDeleteTask,
  };
  const range = listRange(today);
  // While ELMS is being asked, the status says so in words, not a spinner.
  const checked = refreshing ? "Checking ELMS…" : words.checked;

  return (
    <>
      <PageHeader
        title={TITLE}
        status={
          <>
            <span className="tnum" role="status">
              {openWords(open)}
              {checked ? ` · ${checked}` : ""}
            </span>
            {feed && feed.status !== "broken" ? <RefreshButton /> : null}
            {/* A line of its own: the week at a glance. */}
            {progress ? (
              <span className="tnum basis-full">{progress}</span>
            ) : null}
          </>
        }
        views={<TodoViews view={view} />}
        actions={
          <WithTooltip label="Connect, check or disconnect ELMS, or add a file">
            <Button variant="ghost" size="sm" asChild>
              <Link to={TODO_CONNECT_PATH}>ELMS link</Link>
            </Button>
          </WithTooltip>
        }
      />

      {words.problem ? (
        <p className="text-fg">
          {words.problem}
          {feed?.status === "broken" ? (
            <>
              {" "}
              <WithTooltip label="Paste the link from Calendar Feed again">
                <Link to={TODO_CONNECT_PATH} className={TEXT_LINK}>
                  Paste a new link
                </Link>
              </WithTooltip>
            </>
          ) : null}
        </p>
      ) : refreshNote === "failed" ? (
        <InlineError message={NO_ANSWER} className="py-0" />
      ) : refreshNote === "too-soon" ? (
        <p className="text-muted text-sm">{TOO_SOON}</p>
      ) : null}

      {!feed ? (
        <p className="text-muted text-sm">
          {items.some((i) => i.source === "file") ? (
            <>
              {items.some((i) => i.source === "own")
                ? "Your deadlines came from a file."
                : "These came from a file."}{" "}
              <WithTooltip label="Paste your ELMS calendar link">
                <Link to={TODO_CONNECT_PATH} className={TEXT_LINK}>
                  Connect ELMS
                </Link>
              </WithTooltip>{" "}
              to keep them up to date.
            </>
          ) : (
            <>
              <WithTooltip label="Paste your ELMS calendar link">
                <Link to={TODO_CONNECT_PATH} className={TEXT_LINK}>
                  Connect ELMS
                </Link>
              </WithTooltip>{" "}
              to see your deadlines beside your tasks.
            </>
          )}
        </p>
      ) : null}

      <PushAskCard moment="todo-connected" />

      <QuickAdd courses={taskCourses} today={today} />

      {open === 0 ? <p className="text-fg">You're all caught up.</p> : null}

      {view === "course" ? (
        <CourseList
          {...props}
          planCourses={scheduler.planCourses}
          chatOn={chatOn}
          onHideCourse={(group) => setHidden(group.key, groupName(group), true)}
        />
      ) : view === "week" ? (
        <>
          <div className="max-md:hidden">
            <WeekView
              {...props}
              onToggle={(item) => onToggle(item, "week")}
              from={range.from}
              to={range.to}
            />
          </div>
          <div className="md:hidden">
            <DayList {...props} />
          </div>
        </>
      ) : (
        <DayList {...props} />
      )}

      {hidden.size > 0 ? (
        <HiddenCourses
          hidden={hidden}
          onShow={(key) => setHidden(key, key, false)}
        />
      ) : null}
    </>
  );
}

/**
 * The line at the bottom once a course is hidden: "Hidden: 2 courses", and a
 * menu to show each one again.
 */
function HiddenCourses({
  hidden,
  onShow,
}: {
  hidden: ReadonlySet<string>;
  onShow: (key: string) => void;
}) {
  const keys = [...hidden].sort();
  return (
    <div className="flex items-center gap-2 border-hairline border-t pt-3 text-muted text-sm">
      <span className="tnum">{hiddenWords(keys.length)}</span>
      <DropdownMenu>
        <WithTooltip label="Show a hidden course's items again">
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm">
              Show again
            </Button>
          </DropdownMenuTrigger>
        </WithTooltip>
        <DropdownMenuContent align="start">
          {keys.map((key) => (
            <DropdownMenuItem key={key} onSelect={() => onShow(key)}>
              <span data-private="">Show {key}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/** `/todo`, whoever's looking. */
export function TodoPage({ view, day }: { view: TodoView; day?: IsoDate }) {
  const status = useAccount((s) => s.status);
  const on = useAccount((s) => s.flags.todo);
  if (status !== "loading" && !on) return <TodoOff />;
  // One frame for every state, so the family bar stays mounted (with focus
  // in it) as the account and the list arrive. Signed in, it's the list's
  // width from the first visit on, so connecting ELMS doesn't move the page.
  return (
    <TodoFrame width={status === "signed-out" ? "note" : "app"}>
      {status === "loading" ? (
        <TodoSkeleton />
      ) : status === "signed-out" ? (
        <FrontDoor returnTo={TODO_PATH} />
      ) : (
        <TodoList view={view} day={day} />
      )}
    </TodoFrame>
  );
}
