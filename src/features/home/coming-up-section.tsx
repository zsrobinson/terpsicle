import { useMemo } from "react";
import { comingUp, weekOf } from "~/core/home";
import type { CourseCode, CourseColor } from "~/core/schema";
import { dueWords } from "~/core/todo/list";
import type { WeekStart } from "~/core/todo/weeks";
import { TodoItemRow } from "~/features/todo/todo-item";
import { useCheckOff } from "./check-off";
import { HomeSection } from "./section";
import type { HomeClock, HomeTodo } from "./use-home";

// "Coming up" (docs/V3.md §1.5): the next few deadlines after this week,
// within three weeks, so a midterm or a project doesn't arrive as a
// surprise. Todo's own rows, checked off here with Undo. Nothing coming:
// no section at all.

export function ComingUpSection({
  clock,
  todo,
  weekStart,
  colors,
}: {
  clock: HomeClock;
  todo: HomeTodo;
  weekStart: WeekStart;
  colors: Readonly<Record<CourseCode, CourseColor>>;
}) {
  const items = useMemo(
    () => comingUp(todo.items, todo.done, weekOf(clock.today, weekStart).to),
    [todo, clock.today, weekStart],
  );
  const check = useCheckOff(todo.done);
  if (todo.phase !== "ready" || items.length === 0) return null;
  return (
    <HomeSection
      product="todo"
      title="Coming up"
      to="/todo"
      search={{ view: "list" }}
      tooltip="Every deadline, by day"
    >
      <ul aria-label="Coming up after this week">
        {items.map((item) => {
          const code = todo.course(item).code;
          return (
            <TodoItemRow
              key={item.uid}
              item={item}
              done={todo.done.has(item.uid)}
              course={code}
              color={code ? (colors[code] ?? null) : null}
              when={dueWords(item, clock.today)}
              onToggle={() => check(item)}
            />
          );
        })}
      </ul>
    </HomeSection>
  );
}
