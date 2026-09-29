import { Link } from "@tanstack/react-router";
import { cn } from "cn";
import { ExternalLink, Plus } from "lucide-react";
import { type ReactNode, useState } from "react";
import { addDays } from "~/core/ics/dates";
import type { IsoDate, TodoItem } from "~/core/schema";
import {
  compareItems,
  dayLabel,
  dueTimeLabel,
  dueWords,
  isElmsUrl,
  isWeekend,
  shortDayLabel,
  taskFieldsOf,
  weekDates,
  weekdayShort,
  weekStartOf,
} from "~/core/todo";
import { tintStyle } from "~/features/calendar/tint";
import { DAY_HEADER_HEIGHT } from "~/features/calendar/week-frame";
import { Button } from "~/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "~/ui/popover";
import { WithTooltip } from "~/ui/tooltip";
import { startTask } from "./composer";
import { TaskEditor } from "./task-form";
import { CourseTag, SOURCE_WORDS, TodoCheckbox } from "./todo-item";
import { type CheckedVia, Rows, TaskMenu, type ViewProps } from "./todo-lists";

// Todo's week (docs/V3.md §3.9): seven days side by side, edge to edge and
// shaded as Schedule's week is, each item a card in its course's tint. A
// click on a day's empty space starts a task on that day. Phones get the
// same week as its days, one under another.

/** The items due on each date, soonest first. */
function byDate(items: readonly TodoItem[]): Map<IsoDate, TodoItem[]> {
  const out = new Map<IsoDate, TodoItem[]>();
  for (const item of [...items].sort(compareItems)) {
    if (item.dueDate === null) continue;
    const day = out.get(item.dueDate) ?? [];
    day.push(item);
    out.set(item.dueDate, day);
  }
  return out;
}

/** "+" on a day: starts a task there. Fills what's left of the day on a desktop. */
function AddOnDay({
  date,
  className,
  children,
}: {
  date: IsoDate;
  className?: string;
  children?: ReactNode;
}) {
  const label = `Add a task on ${shortDayLabel(date)}`;
  return (
    <WithTooltip label={label} shortcut="Q">
      <button
        type="button"
        aria-label={label}
        onClick={() => startTask(date)}
        className={cn(
          "group flex w-full items-start gap-1 text-muted text-sm transition-colors hover:bg-hover hover:text-fg",
          className,
        )}
      >
        {children ?? (
          <Plus
            size={14}
            aria-hidden="true"
            className="m-1.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
          />
        )}
      </button>
    </WithTooltip>
  );
}

/**
 * An item's details, from its card: when, what course, where it came from,
 * and what can be done with it: check it off, open it in ELMS, or (your own
 * task) edit or delete it.
 */
function ItemDetails({
  item,
  props,
  via,
  onClose,
}: {
  item: TodoItem;
  props: ViewProps;
  via: CheckedVia;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const { course, color } = props.look(item);
  const done = props.done.has(item.uid);
  const link = item.link !== null && isElmsUrl(item.link) ? item.link : null;
  if (editing)
    return (
      <TaskEditor
        uid={item.uid}
        initial={taskFieldsOf(item)}
        courses={props.taskCourses}
        today={props.today}
        stacked
        onClose={onClose}
      />
    );
  return (
    <div className="flex flex-col gap-2">
      <p data-private="" className="break-words font-medium">
        {item.title}
      </p>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted text-sm">
        <CourseTag code={course} label={item.courseLabel} color={color} />
        <span className="tnum">{dueWords(item, props.today)}</span>
        <span>{SOURCE_WORDS[item.source]}</span>
      </p>
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <WithTooltip label={done ? "Put it back on the list" : "Check it off"}>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              props.onToggle(item, via);
              onClose();
            }}
          >
            {done ? "Mark not done" : "Mark done"}
          </Button>
        </WithTooltip>
        {link ? (
          <WithTooltip label="Open it in ELMS, in a new tab">
            <Button size="sm" variant="ghost" asChild>
              <a href={link} target="_blank" rel="noopener noreferrer">
                <ExternalLink aria-hidden="true" />
                Open in ELMS
              </a>
            </Button>
          </WithTooltip>
        ) : null}
        {item.source === "own" ? (
          <TaskMenu
            item={item}
            onEdit={() => setEditing(true)}
            onDelete={() => {
              onClose();
              props.onDeleteTask(item);
            }}
          />
        ) : null}
      </div>
    </div>
  );
}

/** A button that opens an item's details over the calendar. */
function WithDetails({
  item,
  props,
  via,
  children,
}: {
  item: TodoItem;
  props: ViewProps;
  via: CheckedVia;
  children: (trigger: { label: string }) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <WithTooltip label="Details">
        <PopoverTrigger asChild>
          {children({ label: `${item.title}, details` })}
        </PopoverTrigger>
      </WithTooltip>
      <PopoverContent className="w-80 max-w-[calc(100vw-16px)]">
        <ItemDetails
          item={item}
          props={props}
          via={via}
          onClose={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  );
}

/** One item in a week's column: its checkbox, then its time, title and course. */
function WeekCard({ item, props }: { item: TodoItem; props: ViewProps }) {
  const done = props.done.has(item.uid);
  const { course, color } = props.look(item);
  return (
    <li
      data-testid="todo-chip"
      style={!done && color ? tintStyle(color) : undefined}
      className={cn(
        "flex items-start border text-xs",
        (done || !color) && "border-hairline-strong bg-panel",
        done && "text-muted",
      )}
    >
      <TodoCheckbox
        title={item.title}
        done={done}
        onToggle={() => props.onToggle(item, "week")}
        className="md:size-7"
      />
      <WithDetails item={item} props={props} via="week">
        {({ label }) => (
          <button
            type="button"
            aria-label={label}
            className="min-w-0 flex-1 py-1 pr-1.5 text-left"
          >
            {/* Faded like a block's time on the tint; muted text on a done
                card can't fade further and stay readable. */}
            <span className={cn("tnum block", !done && color && "opacity-80")}>
              {dueTimeLabel(item)}
              {course ? (
                <span className="ident ml-1 font-medium">{course}</span>
              ) : null}
            </span>
            <span
              data-private=""
              className={cn(
                "line-clamp-3 block break-words font-medium",
                done && "line-through",
              )}
            >
              {item.title}
            </span>
          </button>
        )}
      </WithDetails>
    </li>
  );
}

/**
 * How a day is shaded, as on Schedule's week: the weekend one step of gray,
 * today's heading two, and today's body left as paper, so its cards read
 * as they do on any other day (the owner, 2026-09-29).
 */
function dayShade(date: IsoDate, today: IsoDate) {
  const weekend = isWeekend(date);
  return {
    head: date === today ? "bg-hover" : weekend ? "bg-panel" : "bg-bg",
    body: weekend ? "bg-panel" : undefined,
  };
}

/** What a screen reader hears for a day's heading: its whole date and what's due. */
function DayWords({
  date,
  today,
  count,
}: {
  date: IsoDate;
  today: IsoDate;
  count: number;
}) {
  const label = dayLabel(date, today);
  return (
    <span className="sr-only">
      {label}
      {label.includes(",") ? "" : `, ${shortDayLabel(date)}`}:{" "}
      {count === 0 ? "nothing due" : `${count} due`}
    </span>
  );
}

/**
 * The day's heading over its column, in the week's row of day names, the
 * height of Schedule's. An h2: each day is a section of the page's h1.
 */
function DayHead({
  date,
  today,
  count,
}: {
  date: IsoDate;
  today: IsoDate;
  count: number;
}) {
  const isToday = date === today;
  return (
    <h2
      className={cn(
        // Pinned while the week scrolls, as Schedule's day names are.
        "sticky top-0 z-10 flex shrink-0 items-center gap-1.5 border-hairline border-b px-2 text-sm",
        // A day's name heads its column: Label, and today Heading.
        isToday ? "emph-heading" : "emph-label",
        dayShade(date, today).head,
      )}
      style={{ height: DAY_HEADER_HEIGHT }}
    >
      <span aria-hidden="true">{weekdayShort(date)}</span>
      <span aria-hidden="true" className="tnum">
        {Number(date.slice(8))}
      </span>
      <DayWords date={date} today={today} count={count} />
    </h2>
  );
}

/**
 * Desktop: the week as seven columns, edge to edge under the bar, as
 * Schedule's week is.
 */
export function WeekGrid({
  anchor,
  props,
}: {
  anchor: IsoDate;
  props: ViewProps;
}) {
  const dates = weekDates(weekStartOf(anchor));
  const due = byDate(props.items);
  return (
    <section aria-label="The week" className="grid flex-1 grid-cols-7">
      {dates.map((date, i) => {
        const items = due.get(date) ?? [];
        return (
          <div
            key={date}
            id={`day-${date}`}
            data-weekend={isWeekend(date) || undefined}
            data-today={date === props.today || undefined}
            className={cn(
              "flex min-w-0 flex-col",
              i > 0 && "border-hairline border-l",
              dayShade(date, props.today).body,
            )}
          >
            <DayHead date={date} today={props.today} count={items.length} />
            {items.length > 0 ? (
              <ul className="space-y-1 p-1">
                {items.map((item) => (
                  <WeekCard key={item.uid} item={item} props={props} />
                ))}
              </ul>
            ) : null}
            <AddOnDay date={date} className="min-h-10 flex-1" />
          </div>
        );
      })}
    </section>
  );
}

/**
 * Phones: the week as its days, one under another, each under a heading
 * shaded as the desktop's are, with its rows and a + to add a task there.
 */
export function WeekAgenda({
  anchor,
  props,
}: {
  anchor: IsoDate;
  props: ViewProps;
}) {
  const dates = weekDates(weekStartOf(anchor));
  const due = byDate(props.items);
  return (
    <section aria-label="The week">
      {dates.map((date) => {
        const items = due.get(date) ?? [];
        const open = items.filter((i) => !props.done.has(i.uid));
        const done = items.filter((i) => props.done.has(i.uid));
        const shade = dayShade(date, props.today);
        const add = `Add a task on ${shortDayLabel(date)}`;
        return (
          <section
            key={date}
            id={`day-${date}`}
            aria-labelledby={`todo-day-${date}`}
            className={cn("border-hairline border-b", shade.body)}
          >
            <div
              className={cn(
                "flex h-11 items-center gap-2 border-hairline border-b pr-1 pl-4",
                shade.head,
              )}
            >
              <h2
                id={`todo-day-${date}`}
                className={cn(
                  "flex min-w-0 flex-1 items-baseline gap-2 text-sm",
                  date === props.today ? "emph-heading" : "emph-label",
                )}
              >
                {dayLabel(date, props.today)}
                {date === props.today || date === addDays(props.today, 1) ? (
                  <span className="emph-meta">{shortDayLabel(date)}</span>
                ) : null}
              </h2>
              <WithTooltip label={add} shortcut="Q">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={add}
                  onClick={() => startTask(date)}
                >
                  <Plus aria-hidden="true" />
                </Button>
              </WithTooltip>
            </div>
            {items.length === 0 ? (
              <p className="emph-secondary px-4 py-3 text-sm">Nothing due</p>
            ) : (
              <ul className="px-4">
                <Rows items={open} done={false} props={props} />
                <Rows items={done} done props={props} />
              </ul>
            )}
          </section>
        );
      })}
    </section>
  );
}

/** "View schedule" in the week's header: its classes, in the scheduler, on the term's main plan. */
export function ScheduleLink({
  term,
  planId,
  label,
  onClick,
}: {
  term: string;
  /** The term's main plan, opened there (V2 §5.5). */
  planId?: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <WithTooltip label={label}>
      <Link
        to="/schedule"
        search={planId ? { term, planId } : { term }}
        onClick={onClick}
        className="text-muted underline-offset-2 hover:text-fg hover:underline max-md:py-3"
      >
        View schedule
      </Link>
    </WithTooltip>
  );
}
