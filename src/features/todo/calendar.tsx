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
  monthOf,
  monthWeeks,
  NO_DATE,
  shortDayLabel,
  taskFieldsOf,
  weekDates,
  weekdayNames,
  weekStartOf,
} from "~/core/todo";
import { dotStyle, tintStyle } from "~/features/calendar/tint";
import { Button } from "~/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "~/ui/popover";
import { WithTooltip } from "~/ui/tooltip";
import { startTask } from "./composer";
import { TaskEditor } from "./task-form";
import { CourseTag, SOURCE_WORDS, TodoCheckbox } from "./todo-item";
import { type CheckedVia, Rows, TaskMenu, type ViewProps } from "./todo-lists";

// Todo's calendar (docs/V3.md §3.9): the week, seven days side by side,
// each item a card in its course's tint; the month, a grid of days with the
// first few items in each. A click on a day's empty space starts a task on
// that day. Phones get the week as a day-by-day agenda, and the month as a
// grid of dots over the day picked.

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

/** Own tasks with no date, under the calendar, since no day holds them. */
function Undated({ props }: { props: ViewProps }) {
  const undated = props.items
    .filter((i) => i.dueDate === null && !props.done.has(i.uid))
    .sort(compareItems);
  if (undated.length === 0) return null;
  return (
    <section aria-labelledby="todo-no-date" className="mt-6">
      <h2
        id="todo-no-date"
        className="border-hairline border-b pb-1 font-semibold text-base"
      >
        {NO_DATE}
      </h2>
      <ul>
        <Rows items={undated} done={false} props={props} />
      </ul>
    </section>
  );
}

/**
 * The day's heading over its column: the weekday, then its date, today
 * marked in Todo's color. A screen reader hears the whole date and what's due.
 * An h2, as the phone's days: each day is a section of the page's h1.
 */
function DayHead({
  date,
  name,
  today,
  count,
  className,
}: {
  date: IsoDate;
  name: string;
  today: IsoDate;
  count: number;
  className?: string;
}) {
  const isToday = date === today;
  return (
    <h2
      className={cn(
        "flex items-baseline gap-1.5 px-2 py-1.5 font-normal text-sm",
        isToday ? "font-semibold text-fg" : "text-muted",
        className,
      )}
    >
      <span aria-hidden="true">{name}</span>
      <span
        aria-hidden="true"
        className={cn(
          "tnum",
          isToday &&
            "bg-product-todo-soft px-1 text-product-todo-text shadow-[inset_0_-2px_0_var(--product-todo-line)]",
        )}
      >
        {Number(date.slice(8))}
      </span>
      <span className="sr-only">
        {dayLabel(date, today)}
        {dayLabel(date, today).includes(",") ? "" : `, ${shortDayLabel(date)}`}:{" "}
        {count === 0 ? "nothing due" : `${count} due`}
      </span>
    </h2>
  );
}

/** Desktop: the week as seven columns. */
export function WeekGrid({
  anchor,
  props,
}: {
  anchor: IsoDate;
  props: ViewProps;
}) {
  const dates = weekDates(weekStartOf(anchor, props.weekStart));
  const names = weekdayNames(props.weekStart);
  const due = byDate(props.items);
  return (
    <>
      <section
        aria-label="The week"
        className="grid min-h-[420px] flex-1 grid-cols-7 border-hairline border-t border-l"
      >
        {dates.map((date, i) => {
          const items = due.get(date) ?? [];
          return (
            <div
              key={date}
              id={`day-${date}`}
              className={cn(
                "flex min-w-0 flex-col border-hairline border-r border-b",
                date === props.today && "bg-panel",
              )}
            >
              <DayHead
                date={date}
                name={names[i] ?? ""}
                today={props.today}
                count={items.length}
                className="border-hairline border-b"
              />
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
      <Undated props={props} />
    </>
  );
}

/** Phones: the week as a list of its days, each with its items and "+ Add". */
export function WeekAgenda({
  anchor,
  props,
}: {
  anchor: IsoDate;
  props: ViewProps;
}) {
  const dates = weekDates(weekStartOf(anchor, props.weekStart));
  const due = byDate(props.items);
  return (
    <div className="space-y-4">
      {dates.map((date) => {
        const items = due.get(date) ?? [];
        const open = items.filter((i) => !props.done.has(i.uid));
        const done = items.filter((i) => props.done.has(i.uid));
        return (
          <section
            key={date}
            id={`day-${date}`}
            aria-labelledby={`todo-day-${date}`}
            className="scroll-mt-4"
          >
            <h2
              id={`todo-day-${date}`}
              className={cn(
                "flex items-baseline gap-2 border-hairline border-b pb-1 font-semibold text-base",
                date !== props.today && "text-muted",
              )}
            >
              {dayLabel(date, props.today)}
              {date === props.today || date === addDays(props.today, 1) ? (
                <span className="font-normal text-muted text-sm">
                  {shortDayLabel(date)}
                </span>
              ) : null}
            </h2>
            {items.length === 0 ? (
              <p className="py-2 text-muted text-sm">Nothing due</p>
            ) : (
              <ul>
                <Rows items={open} done={false} props={props} />
                <Rows items={done} done props={props} />
              </ul>
            )}
            <AddOnDay date={date} className="h-11 items-center">
              <Plus size={14} aria-hidden="true" className="ml-0.5" />
              Add a task
            </AddOnDay>
          </section>
        );
      })}
      <Undated props={props} />
    </div>
  );
}

/** How many items a month's day shows before "+2 more". */
const MONTH_SHOWN = 3;

/** One item in a month's day: its course's dot and its title. */
function MonthChip({ item, props }: { item: TodoItem; props: ViewProps }) {
  const done = props.done.has(item.uid);
  const { color } = props.look(item);
  return (
    <li data-testid="todo-chip">
      <WithDetails item={item} props={props} via="month">
        {({ label }) => (
          <button
            type="button"
            aria-label={label}
            className="flex min-h-6 w-full min-w-0 items-center gap-1.5 px-1 text-left text-xs hover:bg-hover"
          >
            <span
              aria-hidden="true"
              className={cn("size-2 shrink-0", !color && "bg-muted")}
              style={color && !done ? dotStyle(color) : undefined}
            />
            <span
              data-private=""
              className={cn(
                "min-w-0 truncate",
                done ? "text-muted line-through" : "text-fg",
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

/** Desktop: the month as a grid of days. */
export function MonthGrid({
  anchor,
  props,
  weekLink,
}: {
  anchor: IsoDate;
  props: ViewProps;
  /** "+2 more" opens that day's week. */
  weekLink: (date: IsoDate, more: number) => ReactNode;
}) {
  const weeks = monthWeeks(anchor, props.weekStart);
  const month = monthOf(anchor);
  const names = weekdayNames(props.weekStart);
  const due = byDate(props.items);
  return (
    <>
      <section
        aria-label="The month"
        // Fills the page under the bar, as the week does: its weeks share
        // the height.
        className="flex flex-1 flex-col border-hairline border-t border-l"
      >
        <div aria-hidden="true" className="grid grid-cols-7">
          {names.map((name) => (
            <div
              key={name}
              className="border-hairline border-r border-b px-2 py-1 text-muted text-xs"
            >
              {name}
            </div>
          ))}
        </div>
        {weeks.map((week) => (
          <div key={week[0]} className="grid flex-1 grid-cols-7">
            {week.map((date) => {
              const items = due.get(date) ?? [];
              const inMonth = monthOf(date) === month;
              const more = items.length - MONTH_SHOWN;
              return (
                <div
                  key={date}
                  id={`day-${date}`}
                  className={cn(
                    "flex min-h-28 min-w-0 flex-col border-hairline border-r border-b",
                    !inMonth && "bg-panel",
                  )}
                >
                  <DayHead
                    date={date}
                    name=""
                    today={props.today}
                    count={items.length}
                    className={cn("py-1", !inMonth && "text-muted")}
                  />
                  {items.length > 0 ? (
                    <ul className="space-y-0.5 px-0.5">
                      {items.slice(0, MONTH_SHOWN).map((item) => (
                        <MonthChip key={item.uid} item={item} props={props} />
                      ))}
                    </ul>
                  ) : null}
                  {more > 0 ? weekLink(date, more) : null}
                  <AddOnDay date={date} className="min-h-4 flex-1" />
                </div>
              );
            })}
          </div>
        ))}
      </section>
      <Undated props={props} />
    </>
  );
}

/**
 * Phones: the month as a grid of days with a dot for what's due, and the
 * day picked (`?date`) listed under it.
 */
export function MonthPicker({
  anchor,
  props,
  dayLink,
}: {
  anchor: IsoDate;
  props: ViewProps;
  /** A day in the grid: picks it (`?date`). */
  dayLink: (date: IsoDate, children: ReactNode, label: string) => ReactNode;
}) {
  const weeks = monthWeeks(anchor, props.weekStart);
  const month = monthOf(anchor);
  const names = weekdayNames(props.weekStart);
  const due = byDate(props.items);
  const picked = anchor;
  const items = due.get(picked) ?? [];
  const open = items.filter((i) => !props.done.has(i.uid));
  const done = items.filter((i) => props.done.has(i.uid));
  return (
    <div className="space-y-4">
      <nav aria-label="Days of the month">
        <div aria-hidden="true" className="grid grid-cols-7">
          {names.map((name) => (
            <div key={name} className="py-1 text-center text-muted text-xs">
              {name.slice(0, 2)}
            </div>
          ))}
        </div>
        {weeks.map((week) => (
          <div key={week[0]} className="grid grid-cols-7">
            {week.map((date) => {
              const count = (due.get(date) ?? []).filter(
                (i) => !props.done.has(i.uid),
              ).length;
              const inMonth = monthOf(date) === month;
              return (
                <div key={date} className="flex justify-center">
                  {dayLink(
                    date,
                    <span
                      className={cn(
                        "flex size-11 flex-col items-center justify-center gap-0.5 text-sm",
                        !inMonth && "text-muted",
                        date === picked && "bg-accent-soft font-semibold",
                        date === props.today &&
                          "text-product-todo-text shadow-[inset_0_-2px_0_var(--product-todo-line)]",
                      )}
                    >
                      <span className="tnum">{Number(date.slice(8))}</span>
                      <span
                        aria-hidden="true"
                        className={cn(
                          "size-1 rounded-full",
                          count > 0 ? "bg-fg" : "bg-transparent",
                        )}
                      />
                    </span>,
                    `${shortDayLabel(date)}, ${count === 0 ? "nothing due" : `${count} due`}`,
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </nav>
      <section aria-labelledby="todo-picked-day">
        <h2
          id="todo-picked-day"
          className="border-hairline border-b pb-1 font-semibold text-base"
        >
          {dayLabel(picked, props.today)}
        </h2>
        {items.length === 0 ? (
          <p className="py-2 text-muted text-sm">Nothing due</p>
        ) : (
          <ul>
            <Rows items={open} done={false} props={props} />
            <Rows items={done} done props={props} />
          </ul>
        )}
        <AddOnDay date={picked} className="h-11 items-center">
          <Plus size={14} aria-hidden="true" className="ml-0.5" />
          Add a task
        </AddOnDay>
      </section>
      <Undated props={props} />
    </div>
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
