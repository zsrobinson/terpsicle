import { cn } from "cn";
import { ChevronDown, MoreHorizontal } from "lucide-react";
import { type ReactNode, useState } from "react";
import type { CourseCode, CourseColor, IsoDate, TodoItem } from "~/core/schema";
import {
  doneWords,
  groupByDay,
  relativeDue,
  type TodoDay,
  taskFieldsOf,
  type WeekStart,
} from "~/core/todo";
import { Button } from "~/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/ui/dropdown-menu";
import { ListRow } from "~/ui/list-row";
import { WithTooltip } from "~/ui/tooltip";
import { TaskEditor } from "./task-form";
import { TodoItemRow } from "./todo-item";

// The List view (docs/V3.md §3.9): what's due by day, from Earlier to Later,
// with No date last. Done items fold into "3 done" per day, so what's left
// stays in front.

export interface ItemLook {
  course: CourseCode | null;
  color: CourseColor | null;
}

/** Where an item was checked off, for `todo_item_checked`. */
export type CheckedVia = "list" | "week" | "month";

/** What every view of the items takes. */
export interface ViewProps {
  items: readonly TodoItem[];
  done: ReadonlySet<string>;
  today: IsoDate;
  /** The time, ticking each minute, for "Due in 3 hours". */
  now: number;
  weekStart: WeekStart;
  look: (item: TodoItem) => ItemLook;
  onToggle: (item: TodoItem, via: CheckedVia) => void;
  /** The courses an own task can be for: on the feed and in your plans. */
  taskCourses: readonly CourseCode[];
  /** Deletes an own task, with Undo. */
  onDeleteTask: (item: TodoItem) => void;
}

/** An own task's ⋯: Edit and Delete. */
export function TaskMenu({
  item,
  onEdit,
  onDelete,
  className,
}: {
  item: TodoItem;
  onEdit: () => void;
  onDelete: () => void;
  className?: string;
}) {
  return (
    <DropdownMenu>
      <WithTooltip label="Edit or delete this task">
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`${item.title} options`}
            className={className}
          >
            <MoreHorizontal aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
      </WithTooltip>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={onEdit}>Edit</DropdownMenuItem>
        <DropdownMenuItem onSelect={onDelete}>Delete</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** An own task: its row with Edit and Delete, or its fields while it's changed. */
function OwnTaskRow({
  item,
  done,
  props,
}: {
  item: TodoItem;
  done: boolean;
  props: ViewProps;
}) {
  const [editing, setEditing] = useState(false);
  if (editing)
    return (
      <ListRow as="li" className="px-0">
        <TaskEditor
          uid={item.uid}
          initial={taskFieldsOf(item)}
          courses={props.taskCourses}
          today={props.today}
          onClose={() => setEditing(false)}
        />
      </ListRow>
    );
  return (
    <TodoItemRow
      item={item}
      done={done}
      {...props.look(item)}
      relative={relativeDue(item, props.now, props.today)}
      onToggle={() => props.onToggle(item, "list")}
      menu={
        <TaskMenu
          item={item}
          onEdit={() => setEditing(true)}
          onDelete={() => props.onDeleteTask(item)}
          className="-my-3 md:-my-1.5"
        />
      }
    />
  );
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

export function Rows({
  items,
  done,
  props,
}: {
  items: readonly TodoItem[];
  done: boolean;
  props: ViewProps;
}) {
  return items.map((item) =>
    item.source === "own" ? (
      <OwnTaskRow key={item.uid} item={item} done={done} props={props} />
    ) : (
      <TodoItemRow
        key={item.uid}
        item={item}
        done={done}
        {...props.look(item)}
        relative={relativeDue(item, props.now, props.today)}
        onToggle={() => props.onToggle(item, "list")}
      />
    ),
  );
}

function DayBlock({
  day,
  heading,
  props,
}: {
  day: TodoDay;
  heading: boolean;
  props: ViewProps;
}) {
  return (
    <div id={`day-${day.date ?? "none"}`} className="scroll-mt-4">
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

export function DayList(props: ViewProps) {
  const sections = groupByDay(
    props.items,
    props.done,
    props.today,
    props.weekStart,
  );
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
                key={day.date ?? "none"}
                day={day}
                // Today, Tomorrow and No date are one "day" each: the
                // section says it.
                heading={
                  section.id !== "today" &&
                  section.id !== "tomorrow" &&
                  section.id !== "no-date"
                }
                props={props}
              />
            ))
          )}
        </section>
      ))}
    </div>
  );
}
