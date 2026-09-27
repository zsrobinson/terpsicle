import { Link } from "@tanstack/react-router";
import { RefreshCw } from "lucide-react";
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
import type { IsoDate, TodoItem } from "~/core/schema";
import {
  compareItems,
  feedWords,
  itemCourse,
  listRange,
  newYorkClock,
  openCount,
  openWords,
} from "~/core/todo";
import { useAccount } from "~/features/auth/account-store";
import { useSignInAction } from "~/features/auth/sign-in-panel";
import {
  ComingSoonPage,
  type SiteLayout,
  SitePage,
} from "~/features/site/site-page";
import { Button } from "~/ui/button";
import { EmptyState } from "~/ui/empty-state";
import { InlineError } from "~/ui/inline-error";
import { PageHeader } from "~/ui/page-header";
import { PageSection } from "~/ui/page-section";
import { PageSkeleton } from "~/ui/skeleton";
import { noteToast, undoToast } from "~/ui/toast";
import { WithTooltip } from "~/ui/tooltip";
import { type View, ViewSwitch } from "~/ui/view-switch";
import { ConnectForm, ConnectSteps, WHAT_COMES_THROUGH } from "./connect-form";
import { todoCourseColors, useSchedulerCourses } from "./course-colors";
import { TodoItemRow } from "./todo-item";
import {
  CourseList,
  DayList,
  type ItemLook,
  type ListProps,
} from "./todo-lists";
import { useTodo } from "./todo-store";
import { WeekView } from "./week-view";

// `/todo` (docs/V3.md §3.9): the front door when signed out; the three
// steps when ELMS isn't connected; the list by day, by course or (desktop)
// the week once it is. Nothing here is stored in the browser.

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
 * Where Todo's pages go: the site's frame. The list is an app page (1120);
 * the front door and the connect steps are a form, so a note (560).
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
        line="Sign in to see your ELMS deadlines here. We'll remind you the evening before something's due."
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

/** Signed in, before ELMS: what comes through and the three steps. */
function InlineConnect() {
  return (
    <TodoFrame width="note">
      <PageHeader title={TITLE} status="ELMS isn't connected yet" />
      <PageSection title="Connect ELMS">
        <div className="flex flex-col gap-4">
          <p className="text-muted">{WHAT_COMES_THROUGH}</p>
          <ConnectSteps />
          <ConnectForm />
          <p className="text-muted text-sm">
            We keep the link encrypted. More about it, and adding a calendar
            file instead:{" "}
            <WithTooltip label="Connect ELMS, or add a calendar file">
              <Link to={TODO_CONNECT_PATH} className={TEXT_LINK}>
                ELMS and files
              </Link>
            </WithTooltip>
          </p>
        </div>
      </PageSection>
    </TodoFrame>
  );
}

/** The list once signed in: header, view, items. */
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
  const scheduler = useSchedulerCourses();
  const chatOn = useAccount((s) => s.flags.chat !== "off");

  // Once per page, and again when the date turns over.
  useEffect(() => {
    void load(today, Date.now());
  }, [load, today]);

  useEffect(() => {
    if (phase !== "ready" || !day) return;
    document.getElementById(`day-${day}`)?.scrollIntoView({ block: "start" });
  }, [phase, day]);

  const look = useMemo(() => {
    const courseOf = (item: TodoItem) =>
      itemCourse(item, scheduler.planCourses);
    const codes = new Set(
      items.map(courseOf).filter((c): c is string => c !== null),
    );
    const colors = todoCourseColors(codes, scheduler.colors);
    return (item: TodoItem): ItemLook => {
      const course = courseOf(item);
      return { course, color: course ? (colors[course] ?? null) : null };
    };
  }, [items, scheduler]);

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

  if (phase === "idle" || phase === "loading")
    return (
      <TodoFrame>
        <TodoSkeleton />
      </TodoFrame>
    );
  if (phase === "failed")
    return (
      <TodoFrame>
        <PageHeader title={TITLE} />
        <InlineError
          message="We couldn't load your list. Check your connection and try again."
          onRetry={() => void load(today, Date.now())}
        />
      </TodoFrame>
    );

  if (!feed && items.length === 0) return <InlineConnect />;

  const open = openCount(items, done);
  const words = feedWords(feed, now);
  const noteUid =
    [...items]
      .filter((i) => i.gradescope && !done.has(i.uid) && i.dueDate >= today)
      .sort(compareItems)[0]?.uid ?? null;
  const props: ListProps = {
    items,
    done,
    today,
    look,
    noteUid,
    onToggle: (item) => onToggle(item, "list"),
  };
  const range = listRange(today);
  // While ELMS is being asked, the status says so in words, not a spinner.
  const checked = refreshing ? "Checking ELMS…" : words.checked;

  return (
    <TodoFrame>
      <PageHeader
        title={TITLE}
        status={
          <>
            <span className="tnum" role="status">
              {openWords(open)}
              {checked ? ` · ${checked}` : ""}
            </span>
            {feed && feed.status !== "broken" ? <RefreshButton /> : null}
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
          These came from a file.{" "}
          <WithTooltip label="Paste your ELMS calendar link">
            <Link to={TODO_CONNECT_PATH} className={TEXT_LINK}>
              Connect ELMS
            </Link>
          </WithTooltip>{" "}
          to keep them up to date.
        </p>
      ) : null}

      {open === 0 ? <p className="text-fg">You're all caught up.</p> : null}

      {view === "course" ? (
        <CourseList
          {...props}
          planCourses={scheduler.planCourses}
          chatOn={chatOn}
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
    </TodoFrame>
  );
}

/** `/todo`, whoever's looking. */
export function TodoPage({ view, day }: { view: TodoView; day?: IsoDate }) {
  const status = useAccount((s) => s.status);
  const on = useAccount((s) => s.flags.todo);
  if (status === "loading")
    return (
      <TodoFrame>
        <TodoSkeleton />
      </TodoFrame>
    );
  if (!on) return <TodoOff />;
  if (status === "signed-out")
    return (
      <TodoFrame width="note">
        <FrontDoor returnTo={TODO_PATH} />
      </TodoFrame>
    );
  return <TodoList view={view} day={day} />;
}
