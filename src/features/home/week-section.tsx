import { Check } from "lucide-react";
import { useMemo } from "react";
import { type ClassWeek, weekByClass, weekOf, weekTotals } from "~/core/home";
import type { CourseCode, CourseColor, TodoItem } from "~/core/schema";
import { dueTimeLabel, dueWords, relativeDue } from "~/core/todo/list";
import type { WeekStart } from "~/core/todo/weeks";
import { CourseTag, TodoCheckbox } from "~/features/todo/todo-item";
import { InlineError } from "~/ui/inline-error";
import { ListRow } from "~/ui/list-row";
import { WithTooltip } from "~/ui/tooltip";
import { useCheckOff } from "./check-off";
import { HomeMeter } from "./meter";
import { HomeNote, HomeSection, HomeSkeleton } from "./section";
import type { HomeClock, HomeTodo } from "./use-home";

// "This week" (docs/V3.md §1.5; the owner: "todo status across classes for
// the week"): Todo's week, a class to a row. Each row has the class's next
// open item, checked off right here with Undo, and how much of its week is
// done. Titles and course names come from ELMS: plain text, `data-private`.

export function WeekSection({
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
  const rows = useMemo(
    () =>
      weekByClass(
        todo.items,
        todo.done,
        weekOf(clock.today, weekStart),
        todo.course,
      ),
    [todo, clock.today, weekStart],
  );
  const totals = weekTotals(rows);
  const check = useCheckOff(todo.done);

  return (
    <HomeSection
      product="todo"
      title="This week"
      meta={
        todo.phase === "ready" && totals.total > 0
          ? `${totals.done} of ${totals.total} done`
          : undefined
      }
      to="/todo"
      tooltip="Your deadlines, by week"
    >
      {todo.phase === "failed" ? (
        <InlineError
          message="Couldn't load your deadlines."
          onRetry={todo.retry}
        />
      ) : todo.phase !== "ready" ? (
        <HomeSkeleton rows={3} label="Loading your deadlines" />
      ) : rows.length === 0 ? (
        <HomeNote>Nothing's due this week.</HomeNote>
      ) : (
        <ul aria-label="This week, by class">
          {rows.map((row) => (
            <ClassWeekRow
              key={row.key}
              row={row}
              clock={clock}
              color={row.code ? (colors[row.code] ?? null) : null}
              onCheck={check}
            />
          ))}
        </ul>
      )}
    </HomeSection>
  );
}

function ClassWeekRow({
  row,
  clock,
  color,
  onCheck,
}: {
  row: ClassWeek;
  clock: HomeClock;
  color: CourseColor | null;
  onCheck: (item: TodoItem) => void;
}) {
  const next = row.open[0] ?? null;
  const more = row.open.length - 1;
  const name = row.code ?? row.label ?? "Your tasks";
  return (
    <ListRow
      as="li"
      align="start"
      className="px-0"
      data-home-class={row.key}
      lead={
        next ? (
          <TodoCheckbox
            title={next.title}
            done={false}
            onToggle={() => onCheck(next)}
            className="-my-3 -mr-2 -ml-3 md:-my-1.5 md:-mr-1.5 md:-ml-2"
          />
        ) : (
          // Where the box would be: this class's week is done.
          <span className="-my-3 -mr-2 -ml-3 flex size-11 items-center justify-center text-muted md:-my-1.5 md:-mr-1.5 md:-ml-2 md:size-8">
            <Check size={14} aria-hidden="true" />
          </span>
        )
      }
      secondary={
        next ? <DueLine item={next} clock={clock} more={more} /> : undefined
      }
      trail={
        <HomeMeter
          value={row.done}
          max={row.total}
          words={`${row.done} of ${row.total} done`}
          color={color}
        />
      }
    >
      <p className="flex min-w-0 items-center gap-2">
        <CourseTag
          code={row.code}
          label={row.code ? null : name}
          color={color}
        />
        {next ? (
          <span data-private="" className="truncate font-medium text-fg">
            {next.title}
          </span>
        ) : (
          <span className="text-muted">All done this week</span>
        )}
      </p>
    </ListRow>
  );
}

/** When the next item's due, and how many more the class has this week. */
function DueLine({
  item,
  clock,
  more,
}: {
  item: TodoItem;
  clock: HomeClock;
  more: number;
}) {
  const relative = relativeDue(item, clock.now, clock.today);
  return (
    <span className="flex flex-wrap items-center gap-x-2">
      {relative ? (
        <WithTooltip label={`Due today at ${dueTimeLabel(item)}`}>
          <time dateTime={item.dueAt ?? undefined} className="tnum">
            {relative}
            <span className="sr-only">, at {dueTimeLabel(item)}</span>
          </time>
        </WithTooltip>
      ) : (
        <span className="tnum">{dueWords(item, clock.today)}</span>
      )}
      {more > 0 ? <span>+{more} more this week</span> : null}
    </span>
  );
}
