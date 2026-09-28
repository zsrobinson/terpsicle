import { useCallback, useEffect, useMemo, useState } from "react";
import { track } from "~/app/analytics";
import { dueSoon } from "~/core/home";
import type { TodoItem } from "~/core/schema";
import {
  dueWords,
  isHiddenItem,
  itemCourse,
  relativeDue,
} from "~/core/todo/list";
import {
  todoCourseColors,
  useSchedulerCourses,
} from "~/features/todo/course-colors";
import { TodoItemRow } from "~/features/todo/todo-item";
import { useTodo } from "~/features/todo/todo-store";
import { InlineError } from "~/ui/inline-error";
import { noteToast, undoToast } from "~/ui/toast";
import { HomeNote, HomeSection, HomeSkeleton } from "./section";
import type { HomeClock } from "./use-home";

// "Due soon" (docs/V3.md §1.5): the next few things due this week from
// Todo, checked off right here with Undo, as on /todo. The list is Todo's
// own store, in memory only; titles and courses are `data-private`.

/** One toast for checks, as on /todo: each check's Undo replaces the last. */
const DONE_TOAST_ID = "home-todo-done";

export function DueSection({ clock }: { clock: HomeClock }) {
  const phase = useTodo((s) => s.phase);
  const load = useTodo((s) => s.load);
  const items = useTodo((s) => s.items);
  const done = useTodo((s) => s.done);
  const hidden = useTodo((s) => s.hidden);
  const feed = useTodo((s) => s.feed);
  const setDone = useTodo((s) => s.setDone);
  const scheduler = useSchedulerCourses();
  // Checked off here: they stay, ticked, until the page goes.
  const [kept, setKept] = useState<ReadonlySet<string>>(new Set());
  const { today, now } = clock;

  useEffect(() => {
    void load(today, Date.now());
  }, [load, today]);

  const shown = useMemo(
    () =>
      dueSoon(
        items.filter((i) => !isHiddenItem(i, hidden, scheduler.planCourses)),
        done,
        today,
        kept,
      ),
    [items, hidden, scheduler, done, today, kept],
  );
  const colors = useMemo(
    () =>
      todoCourseColors(
        shown
          .map((i) => itemCourse(i, scheduler.planCourses))
          .filter((c): c is string => c !== null),
        scheduler.colors,
      ),
    [shown, scheduler],
  );

  const onToggle = useCallback(
    (item: TodoItem) => {
      const next = !done.has(item.uid);
      track("todo_item_checked", { done: next, via: "home" });
      setKept((k) => new Set(k).add(item.uid));
      const mark = (value: boolean) => {
        const save = () =>
          void setDone(item.uid, value).then((ok) => {
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

  return (
    <HomeSection
      product="todo"
      title="Due soon"
      to="/todo"
      tooltip="Your deadlines, by week"
    >
      {phase === "failed" ? (
        <InlineError
          message="Couldn't load your deadlines."
          onRetry={() => void load(today, Date.now())}
        />
      ) : phase !== "ready" ? (
        <HomeSkeleton rows={3} label="Loading your deadlines" />
      ) : shown.length === 0 ? (
        <HomeNote>
          {feed === null && items.length === 0
            ? "Connect ELMS in Todo to see what's due here."
            : "Nothing due this week."}
        </HomeNote>
      ) : (
        <ul aria-label="Due this week">
          {shown.map((item) => {
            const course = itemCourse(item, scheduler.planCourses);
            return (
              <TodoItemRow
                key={item.uid}
                item={item}
                done={done.has(item.uid)}
                course={course}
                color={course ? (colors[course] ?? null) : null}
                when={dueWords(item, today)}
                relative={relativeDue(item, now, today)}
                onToggle={() => onToggle(item)}
              />
            );
          })}
        </ul>
      )}
    </HomeSection>
  );
}
