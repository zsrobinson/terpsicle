import { cn } from "cn";
import { RefreshCw } from "lucide-react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { toast } from "sonner";
import { track } from "~/app/analytics";
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
import { GoogleButton } from "~/features/auth/sign-in-panel";
import { ComingSoonPage, SitePage } from "~/features/site/site-page";
import { Button } from "~/ui/button";
import { Skeleton } from "~/ui/skeleton";
import { WithTooltip } from "~/ui/tooltip";
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

/** New York's date and the time, ticking each minute for "checked 14 min ago". */
export function useNow(): { now: number; today: IsoDate } {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return { now, today: newYorkClock(now).date };
}

/** Where Todo's pages go: the site's frame, kept out of autocapture. */
export function TodoFrame({ children }: { children: ReactNode }) {
  return (
    <SitePage layout="app">
      {/* ph-no-capture: autocapture would read titles off what's clicked. */}
      <div className="ph-no-capture">{children}</div>
    </SitePage>
  );
}

export function TodoOff() {
  return (
    <ComingSoonPage title="Terpsicle Todo">
      Your deadlines and exams from ELMS, in one list.
    </ComingSoonPage>
  );
}

export function ListSkeleton() {
  return (
    <div className="space-y-3" data-testid="todo-loading">
      <Skeleton className="h-5 w-48" />
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
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

/** Signed out: what Todo is, and Sign in (V3 §3.9). */
export function FrontDoor({ returnTo }: { returnTo: string }) {
  const colors = todoCourseColors(["CMSC216", "MATH240"], {});
  return (
    <div className="mx-auto max-w-[560px] space-y-6 pt-[8vh]">
      <div className="space-y-2">
        <h1 className="font-semibold text-xl tracking-tight">Terpsicle Todo</h1>
        <p className="text-fg">
          Sign in to see your ELMS deadlines here. We'll remind you the evening
          before something's due.
        </p>
        <p className="text-muted text-sm">{WHAT_COMES_THROUGH}</p>
      </div>
      <div className="max-w-[320px]">
        <GoogleButton returnTo={returnTo} from="todo" />
      </div>
      <figure className="border border-hairline bg-raised px-4 py-2">
        <figcaption className="pb-1 text-muted text-xs">
          What it looks like
        </figcaption>
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
      </figure>
    </div>
  );
}

const VIEWS: readonly { view: TodoView; label: string; tip: string }[] = [
  { view: "day", label: "By day", tip: "What's due each day" },
  { view: "course", label: "By course", tip: "What's due in each course" },
  { view: "week", label: "Week", tip: "The week, day by day" },
];

/** Phones have no week: "Week" hides, and By day stands in for it. */
function ViewSwitch({
  view,
  onChange,
}: {
  view: TodoView;
  onChange: (view: TodoView) => void;
}) {
  return (
    <fieldset aria-label="View" className="flex border border-hairline-strong">
      {VIEWS.map((v) => (
        <WithTooltip key={v.view} label={v.tip}>
          <button
            type="button"
            aria-pressed={view === v.view}
            onClick={() => {
              if (view === v.view) return;
              track("todo_view_changed", { view: v.view });
              onChange(v.view);
            }}
            className={cn(
              "h-11 px-3 text-sm transition-colors md:h-7",
              view === v.view
                ? "bg-accent-soft font-medium text-fg"
                : "text-muted hover:bg-hover hover:text-fg",
              v.view === "week" && "max-md:hidden",
              v.view === "day" &&
                view === "week" &&
                "max-md:bg-accent-soft max-md:font-medium max-md:text-fg",
            )}
          >
            {v.label}
          </button>
        </WithTooltip>
      ))}
    </fieldset>
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
        className="size-11 md:size-7"
      >
        <RefreshCw
          aria-hidden="true"
          className={cn(refreshing && "motion-safe:animate-spin")}
        />
      </Button>
    </WithTooltip>
  );
}

const REFRESH_NOTES = {
  "too-soon": "ELMS was checked in the last 5 minutes.",
  failed: "ELMS didn't answer. We'll try again in 20 minutes.",
} as const;

function InlineConnect() {
  return (
    <section aria-labelledby="todo-connect" className="max-w-[560px] space-y-4">
      <h2 id="todo-connect" className="font-semibold text-lg">
        Connect ELMS
      </h2>
      <p className="text-muted">{WHAT_COMES_THROUGH}</p>
      <ConnectSteps />
      <ConnectForm />
      <p className="text-muted text-sm">
        We keep the link encrypted. More about it, and adding a calendar file
        instead:{" "}
        <WithTooltip label="Connect ELMS, or add a calendar file">
          <a
            href={TODO_CONNECT_PATH}
            className="text-fg underline underline-offset-4"
          >
            ELMS and files
          </a>
        </WithTooltip>
      </p>
    </section>
  );
}

/** The list once signed in: header, view, items. */
export function TodoList({
  view,
  day,
  onViewChange,
}: {
  view: TodoView;
  day?: IsoDate;
  onViewChange: (view: TodoView) => void;
}) {
  const { now, today } = useNow();
  const phase = useTodo((s) => s.phase);
  const load = useTodo((s) => s.load);
  const feed = useTodo((s) => s.feed);
  const items = useTodo((s) => s.items);
  const done = useTodo((s) => s.done);
  const refreshNote = useTodo((s) => s.refreshNote);
  const setDone = useTodo((s) => s.setDone);
  const scheduler = useSchedulerCourses();

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
      void setDone(item.uid, next).then((ok) => {
        if (!ok)
          toast("That didn't save", {
            description: "Check your connection and try again.",
          });
      });
    },
    [done, setDone],
  );

  if (phase === "idle" || phase === "loading") return <ListSkeleton />;
  if (phase === "failed")
    return (
      <div className="space-y-3">
        <p className="text-fg">
          We couldn't load your list. Check your connection and try again.
        </p>
        <WithTooltip label="Load the list again">
          <Button
            variant="outline"
            onClick={() => void load(today, Date.now())}
          >
            Try again
          </Button>
        </WithTooltip>
      </div>
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

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
        <div className="min-w-0 md:flex-1">
          <h1 className="font-semibold text-xl tracking-tight">Todo</h1>
          <p className="flex items-center gap-1 text-muted text-sm">
            <span className="tnum" role="status">
              {openWords(open)}
              {words.checked ? ` · ${words.checked}` : ""}
            </span>
            {feed && feed.status !== "broken" ? <RefreshButton /> : null}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ViewSwitch view={view} onChange={onViewChange} />
          <WithTooltip label="Connect, check or disconnect ELMS, or add a file">
            <a
              href={TODO_CONNECT_PATH}
              className="flex h-11 items-center px-2 text-muted text-sm underline-offset-4 hover:text-fg hover:underline md:h-7"
            >
              ELMS link
            </a>
          </WithTooltip>
        </div>
      </header>

      {words.problem ? (
        <p className="text-fg text-sm">
          {words.problem}
          {feed?.status === "broken" ? (
            <>
              {" "}
              <WithTooltip label="Paste the link from Calendar Feed again">
                <a
                  href={TODO_CONNECT_PATH}
                  className="underline underline-offset-4"
                >
                  Paste a new link
                </a>
              </WithTooltip>
            </>
          ) : null}
        </p>
      ) : refreshNote ? (
        <p className="text-muted text-sm">{REFRESH_NOTES[refreshNote]}</p>
      ) : null}

      {!feed ? (
        <p className="text-muted text-sm">
          These came from a file.{" "}
          <WithTooltip label="Paste your ELMS calendar link">
            <a
              href={TODO_CONNECT_PATH}
              className="text-fg underline underline-offset-4"
            >
              Connect ELMS
            </a>
          </WithTooltip>{" "}
          to keep them up to date.
        </p>
      ) : null}

      {open === 0 ? <p className="text-fg">You're all caught up.</p> : null}

      {view === "course" ? (
        <CourseList {...props} planCourses={scheduler.planCourses} />
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
    </div>
  );
}

/** `/todo`, whoever's looking. */
export function TodoPage({
  view,
  day,
  onViewChange,
}: {
  view: TodoView;
  day?: IsoDate;
  onViewChange: (view: TodoView) => void;
}) {
  const status = useAccount((s) => s.status);
  const on = useAccount((s) => s.flags.todo);
  if (status === "loading")
    return (
      <TodoFrame>
        <ListSkeleton />
      </TodoFrame>
    );
  if (!on) return <TodoOff />;
  return (
    <TodoFrame>
      {status === "signed-out" ? (
        <FrontDoor returnTo={TODO_PATH} />
      ) : (
        <TodoList view={view} day={day} onViewChange={onViewChange} />
      )}
    </TodoFrame>
  );
}
