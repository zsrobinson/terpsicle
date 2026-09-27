import { cn } from "cn";
import { ChevronDown } from "lucide-react";
import { type ReactNode, useState } from "react";
import type { CourseCode, CourseColor, IsoDate, TodoItem } from "~/core/schema";
import {
  dayLabel,
  doneWords,
  dueTimeLabel,
  groupByCourse,
  groupByDay,
  type TodoDay,
} from "~/core/todo";
import { WithTooltip } from "~/ui/tooltip";
import {
  CourseTag,
  GRADESCOPE_EXTENSIONS_NOTE,
  TodoItemRow,
} from "./todo-item";

// The list by day (the default) and by course (docs/V3.md §3.9). Done items
// fold into "3 done" per day or course, so what's left stays in front.

export interface ItemLook {
  course: CourseCode | null;
  color: CourseColor | null;
}

export interface ListProps {
  items: readonly TodoItem[];
  done: ReadonlySet<string>;
  today: IsoDate;
  look: (item: TodoItem) => ItemLook;
  onToggle: (item: TodoItem) => void;
  /** The item that carries the Gradescope extensions note, if any. */
  noteUid: string | null;
}

function DoneFold({ count, children }: { count: number; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  if (count === 0) return null;
  return (
    <div>
      <WithTooltip label={open ? "Hide what's done" : "Show what's done"}>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="-ml-1 flex h-11 items-center gap-1 px-1 text-muted text-sm transition-colors hover:text-fg md:h-7"
        >
          <ChevronDown
            size={13}
            aria-hidden="true"
            className={cn(
              "transition-transform duration-150",
              !open && "-rotate-90",
            )}
          />
          {doneWords(count)}
        </button>
      </WithTooltip>
      {open ? <ul>{children}</ul> : null}
    </div>
  );
}

function Rows({
  items,
  done,
  props,
  when,
}: {
  items: readonly TodoItem[];
  done: boolean;
  props: ListProps;
  when?: (item: TodoItem) => string;
}) {
  // Under a course's heading (when there's `when`), the course goes unsaid.
  return items.map((item) => (
    <TodoItemRow
      key={item.uid}
      item={item}
      done={done}
      {...props.look(item)}
      when={when?.(item)}
      showCourse={when === undefined}
      note={item.uid === props.noteUid ? GRADESCOPE_EXTENSIONS_NOTE : undefined}
      onToggle={() => props.onToggle(item)}
    />
  ));
}

function DayBlock({
  day,
  heading,
  props,
}: {
  day: TodoDay;
  heading: boolean;
  props: ListProps;
}) {
  return (
    <div id={`day-${day.date}`} className="scroll-mt-4">
      {heading ? (
        <h3 className="border-hairline border-b pt-3 pb-1 font-semibold text-muted text-sm">
          {day.label}
        </h3>
      ) : null}
      {day.open.length > 0 ? (
        <ul>
          <Rows items={day.open} done={false} props={props} />
        </ul>
      ) : day.done.length === 0 ? (
        <p className="py-2 text-muted text-sm">Nothing due</p>
      ) : null}
      <DoneFold count={day.done.length}>
        <Rows items={day.done} done props={props} />
      </DoneFold>
    </div>
  );
}

export function DayList(props: ListProps) {
  const sections = groupByDay(props.items, props.done, props.today);
  return (
    <div className="space-y-6">
      {sections.map((section) => (
        <section key={section.id} aria-labelledby={`todo-${section.id}`}>
          <h2
            id={`todo-${section.id}`}
            className="border-hairline border-b pb-1 font-semibold text-base"
          >
            {section.label}
          </h2>
          {section.days.length === 0 ? (
            <p className="py-2 text-muted text-sm">{section.empty}</p>
          ) : (
            section.days.map((day) => (
              <DayBlock
                key={day.date}
                day={day}
                // Today and Tomorrow are one day each: the section says it.
                heading={section.id !== "today" && section.id !== "tomorrow"}
                props={props}
              />
            ))
          )}
        </section>
      ))}
    </div>
  );
}

export function CourseList(
  props: ListProps & { planCourses: ReadonlySet<CourseCode> },
) {
  const groups = groupByCourse(
    props.items,
    props.done,
    props.today,
    props.planCourses,
  );
  if (groups.length === 0)
    return <p className="py-2 text-muted text-sm">Nothing due.</p>;
  const when = (item: TodoItem) =>
    `${dayLabel(item.dueDate, props.today)} · ${dueTimeLabel(item)}`;
  return (
    <div className="space-y-6">
      {groups.map((group) => {
        const first = group.open[0] ?? group.done[0];
        const color = first ? props.look(first).color : null;
        return (
          <section key={group.key} aria-label={group.code ?? group.key}>
            <h2 className="flex min-w-0 items-center gap-2 border-hairline border-b pb-1 font-semibold text-base">
              {group.code !== null ? (
                <CourseTag code={group.code} label={null} color={color} />
              ) : null}
              <span
                data-private=""
                className="min-w-0 truncate font-normal text-muted text-sm"
              >
                {group.code !== null
                  ? (group.label ?? "")
                  : group.key === "Other"
                    ? "Not from a course"
                    : group.key}
              </span>
              <span className="tnum ml-auto shrink-0 font-normal text-muted text-sm">
                {group.open.length} open
              </span>
            </h2>
            {group.open.length > 0 ? (
              <ul>
                <Rows
                  items={group.open}
                  done={false}
                  props={props}
                  when={when}
                />
              </ul>
            ) : null}
            <DoneFold count={group.done.length}>
              <Rows items={group.done} done props={props} when={when} />
            </DoneFold>
          </section>
        );
      })}
    </div>
  );
}
