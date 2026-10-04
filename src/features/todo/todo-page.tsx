import { useNavigate } from "@tanstack/react-router";
import { cn } from "cn";
import { type ReactNode, useCallback, useEffect, useMemo } from "react";
import { Mark } from "~/components/brand/mark";
import { CanvasHint } from "~/components/workbench/canvas-hint";
import {
  lazyDrawer,
  Workbench,
  WorkbenchSidebar,
} from "~/components/workbench/layout";
import { SkipLinks } from "~/components/workbench/skip-links";
import { seasonTermOf, termLabel } from "~/core/catalog/terms";
import type { CourseCode, IsoDate, TodoItem } from "~/core/schema";
import {
  courseChatTerm,
  courseKey,
  courseWeek,
  isHiddenItem,
  isThisWeek,
  itemCourse,
  NO_COURSE_KEY,
  shiftWeek,
  weekSpan,
  weekStartOf,
} from "~/core/todo";
import { useAccount } from "~/features/auth/account-store";
import { useSignInAction } from "~/features/auth/sign-in-panel";
import { PushAskCard } from "~/features/notifications/push-ask-card";
import {
  ComingSoonPage,
  SiteHeader,
  SitePage,
} from "~/features/site/site-page";
import { useIsMobile } from "~/hooks/use-media-query";
import { useSidebarWidth } from "~/hooks/use-sidebar-width";
import { track } from "~/lib/analytics";
import { useShortcut } from "~/lib/shortcuts";
import { Button } from "~/ui/button";
import { EmptyState } from "~/ui/empty-state";
import { InlineError } from "~/ui/inline-error";
import { PAGE_WIDTH, PageFooter } from "~/ui/product-page";
import { noteToast, undoToast } from "~/ui/toast";
import { WithTooltip } from "~/ui/tooltip";
import { WeekAgenda, WeekGrid } from "./calendar";
import { startTask } from "./composer";
import { todoCourseColors, useSchedulerCourses } from "./course-colors";
import { SyncLine, SyncSheet, TodoSyncButton } from "./elms";
import { SamplePreview } from "./sample";
import {
  type CourseRow,
  type SidebarSchedule,
  TODO_SIDEBAR_PANEL_ID,
  TodoSidebar,
} from "./sidebar";
import { TASK_TOAST_ID } from "./task-form";
import { TODO_PATH, TodoBarContext, useNow } from "./todo-bar";
import type { CheckedVia, ViewProps } from "./todo-lists";
import { useTodo } from "./todo-store";
import {
  openElmsSettings,
  useTodoWorkbench,
  useTodoWorkbenchMounted,
} from "./workbench-store";

// `/todo` (docs/V3.md §3.9): one week, done well (the owner, 2026-09-29:
// "let's ONLY design around the week view"). A workbench like Schedule's
// and Plan's: the family bar with Back, Today, Ahead and the week; a
// sidebar (./sidebar) with ELMS's line, Add a task and the week's progress
// by course, its edge draggable like theirs; and the week, edge to edge,
// shaded as Schedule's is. On a phone the sidebar is the drawer
// (./todo-drawer). Each week is a URL. Signed out, it's the front door.
// Nothing here is stored in the browser but the sidebar's width.

export { TODO_CONNECT_PATH, TODO_PATH, useNow } from "./todo-bar";

/** The week's id: the skip link and focus land there. */
const CANVAS_ID = "todo-calendar";
/** The sidebar's frame, which the resize handle controls. */
const SIDEBAR_ID = "todo-sidebar";

// The phone drawer (Base UI's Drawer) is its own chunk, fetched at once on phones only.
const TodoDrawer = lazyDrawer(() =>
  import("./todo-drawer").then((m) => m?.TodoDrawer),
);

/**
 * Where `/todo/connect` goes: the site's frame, a note (560). The week is
 * a workbench of its own (`TodoPage`).
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
      <main
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
      </main>
      {/* A page you read, like Chat's and Plan's front doors. */}
      <PageFooter className={PAGE_WIDTH.app} />
    </div>
  );
}

/** P, N and T move the week; Q starts a task. */
function Shortcuts({ anchor }: { anchor: IsoDate }) {
  const navigate = useNavigate();
  useShortcut({ key: "q" }, () => {
    startTask();
    return true;
  });
  useShortcut([{ key: "p" }, { key: "n" }, { key: "t" }], (event) => {
    const key = event.key.toLowerCase();
    void navigate({
      to: TODO_PATH,
      search:
        key === "t" ? {} : { date: shiftWeek(anchor, key === "p" ? -1 : 1) },
    });
    return true;
  });
  return null;
}

/** One toast for checks: each check's Undo replaces the last one's. */
const DONE_TOAST_ID = "todo-done";

/** One toast for hiding and showing courses. */
const HIDE_TOAST_ID = "todo-hide";

/** The skip link to the sidebar: raises a resting drawer, then focuses it. */
function toSidebar() {
  const ui = useTodoWorkbench.getState();
  if (ui.drawerSnap === "peek") ui.setDrawerSnap("half");
  requestAnimationFrame(() =>
    document.getElementById(TODO_SIDEBAR_PANEL_ID)?.focus(),
  );
}

/**
 * Everything the week and its sidebar show. It asks for nothing until
 * someone's signed in (`on`), so the page can keep one frame throughout.
 */
function useTodoWeek(anchor: IsoDate, day: IsoDate | undefined, on: boolean) {
  const { now, today } = useNow();
  const phase = useTodo((s) => s.phase);
  const load = useTodo((s) => s.load);
  const ensureRange = useTodo((s) => s.ensureRange);
  const feed = useTodo((s) => s.feed);
  const items = useTodo((s) => s.items);
  const done = useTodo((s) => s.done);
  const setDone = useTodo((s) => s.setDone);
  const hidden = useTodo((s) => s.hidden);
  const hideCourse = useTodo((s) => s.hideCourse);
  const deleteTask = useTodo((s) => s.deleteTask);
  const restoreTask = useTodo((s) => s.restoreTask);
  const scheduler = useSchedulerCourses();
  const chatOn = useAccount((s) => s.flags.chat !== "off");
  const weekFirst = weekStartOf(anchor);

  // Once per page, and again when the date turns over.
  useEffect(() => {
    if (on) void load(today, Date.now());
  }, [on, load, today]);

  // A week away from today: its dates, and the weeks before it.
  useEffect(() => {
    if (phase !== "ready") return;
    void ensureRange(weekSpan(anchor));
  }, [phase, anchor, ensureRange]);

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

  const rows = useMemo((): CourseRow[] => {
    const course = (item: TodoItem) => ({
      key: courseKey(item, scheduler.planCourses),
      code: itemCourse(item, scheduler.planCourses),
      label: item.courseLabel,
    });
    const tallied = courseWeek(items, done, weekFirst, course);
    // A hidden course keeps its row, due this week or not, so it can be
    // shown again.
    const byKey = new Map(tallied.map((r) => [r.key, r]));
    for (const item of items) {
      const c = course(item);
      if (byKey.has(c.key)) continue;
      if (!hidden.has(c.key) && !(c.code !== null && hidden.has(c.code)))
        continue;
      byKey.set(c.key, { ...c, done: 0, total: 0 });
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
  }, [items, done, weekFirst, scheduler, colors, hidden, chatOn, today]);

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
      // Hiding takes things off the week, so it gets Undo; showing puts
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
    look,
    onToggle,
    taskCourses,
    onDeleteTask,
  };

  // "View schedule": the week's classes, on its term's main plan.
  const term = seasonTermOf(weekFirst);
  const mainPlan = scheduler.mainPlans[term];
  const schedule: SidebarSchedule = {
    term,
    planId: mainPlan?.id,
    label: mainPlan
      ? `Opens ${mainPlan.name}, your main plan for ${termLabel(term)}`
      : `Your ${termLabel(term)} classes`,
  };

  return {
    phase,
    reload: () => void load(today, Date.now()),
    firstVisit: phase === "ready" && !feed && items.length === 0,
    props,
    sidebar: {
      props,
      rows,
      weekFirst,
      thisWeek: isThisWeek(anchor, today),
      schedule,
      onHide,
      courses: taskCourses,
      colors,
    },
    hasFileItems: items.some((i) => i.source === "file"),
  };
}

/** The first visit, over the empty week: what lands here, and the two ways in. */
function FirstVisitHint() {
  return (
    <CanvasHint className="py-2 max-md:w-full">
      <div className="flex w-full flex-col gap-2 md:flex-row md:items-center md:gap-4">
        <p className="min-w-0 flex-1">
          <span className="emph-heading">Your deadlines, on a calendar. </span>
          <span className="emph-secondary">
            Connect ELMS and your assignments land on their days, or add your
            own tasks.
          </span>
        </p>
        <span className="flex shrink-0 gap-2">
          <WithTooltip label="Paste your ELMS calendar link: three steps">
            <Button size="sm" onClick={() => openElmsSettings()}>
              Connect ELMS
            </Button>
          </WithTooltip>
          <WithTooltip label="Type a task, with its date" shortcut="Q">
            <Button size="sm" variant="outline" onClick={() => startTask()}>
              Add a task
            </Button>
          </WithTooltip>
        </span>
      </div>
    </CanvasHint>
  );
}

/** The week, signed in: the grid on a desktop, its days on a phone. */
function TodoCanvas({
  mobile,
  anchor,
  week,
}: {
  mobile: boolean;
  anchor: IsoDate;
  week: ReturnType<typeof useTodoWeek>;
}) {
  if (week.phase === "failed")
    return (
      <div className="p-4">
        <InlineError
          message="We couldn't load your deadlines. Check your connection and try again."
          onRetry={week.reload}
        />
      </div>
    );
  // While it loads, the week's days are already there, empty.
  const hint = week.firstVisit ? <FirstVisitHint /> : null;
  if (mobile)
    return (
      <>
        {/* Connecting ELMS asks for reminders (V2 §6.7): over the week on
            a phone, where the drawer at rest wouldn't show it. */}
        <PushAskCard moment="todo-connected" className="m-3" />
        {hint ? <div className="p-3">{hint}</div> : null}
        <WeekAgenda anchor={anchor} props={week.props} />
      </>
    );
  return (
    <div
      className="relative flex flex-1 flex-col"
      aria-busy={week.phase !== "ready" || undefined}
    >
      <WeekGrid anchor={anchor} props={week.props} />
      {hint ? (
        // Floats under the day names, as Schedule's hints do.
        <div className="pointer-events-none absolute inset-x-4 top-12 z-20 flex justify-center">
          {hint}
        </div>
      ) : null}
    </div>
  );
}

/** `/todo`, whoever's looking. */
export function TodoPage({ anchor, day }: { anchor?: IsoDate; day?: IsoDate }) {
  const status = useAccount((s) => s.status);
  const on = useAccount((s) => s.flags.todo);
  if (status !== "loading" && !on) return <TodoOff />;
  return <TodoWorkbench status={status} anchor={anchor} day={day} />;
}

/**
 * One frame for every state, so the family bar stays mounted (with focus
 * in it) as the account and the week arrive.
 */
function TodoWorkbench({
  status,
  anchor: asked,
  day,
}: {
  status: ReturnType<typeof useAccount.getState>["status"];
  anchor?: IsoDate;
  day?: IsoDate;
}) {
  const mobile = useIsMobile();
  const { today } = useNow();
  const anchor = asked ?? today;
  const signedIn = status === "signed-in";
  const week = useTodoWeek(anchor, day, signedIn);
  const [width, setWidth] = useSidebarWidth();
  useTodoWorkbenchMounted();
  return (
    <Workbench
      mobile={mobile}
      before={
        signedIn ? (
          <SkipLinks
            canvasId={CANVAS_ID}
            canvasName="week"
            sidebarId={TODO_SIDEBAR_PANEL_ID}
            onSidebar={toSidebar}
          />
        ) : null
      }
      bar={
        <SiteHeader
          context={
            signedIn ? (
              <TodoBarContext
                anchor={anchor}
                status={<SyncLine now={week.props.now} />}
              />
            ) : undefined
          }
          status={
            signedIn ? (
              <TodoSyncButton
                hasFileItems={week.hasFileItems}
                now={week.props.now}
              />
            ) : undefined
          }
        />
      }
      rail={null}
      sidebar={
        signedIn ? (
          <WorkbenchSidebar
            id={SIDEBAR_ID}
            open
            width={width}
            onWidth={setWidth}
          >
            <TodoSidebar {...week.sidebar} />
          </WorkbenchSidebar>
        ) : null
      }
      drawer={signedIn ? <TodoDrawer {...week.sidebar} /> : null}
      canvas={
        signedIn ? (
          <TodoCanvas mobile={mobile} anchor={anchor} week={week} />
        ) : status === "signed-out" ? (
          <FrontDoor returnTo={TODO_PATH} />
        ) : null
      }
      canvasId={CANVAS_ID}
      canvasClassName={
        signedIn
          ? "scroll-thin flex flex-col overflow-y-auto overscroll-y-contain"
          : "flex flex-col"
      }
      after={
        signedIn ? (
          <>
            <Shortcuts anchor={anchor} />
            {mobile ? (
              <SyncSheet
                hasFileItems={week.hasFileItems}
                now={week.props.now}
              />
            ) : null}
          </>
        ) : null
      }
    />
  );
}
