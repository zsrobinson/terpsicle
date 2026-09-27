import { Link } from "@tanstack/react-router";
import { cn } from "cn";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { crossLinkClicked, viewWords } from "~/app/cross-link";
import { seasonTermOf, termLabel } from "~/core/catalog/terms";
import { addDays } from "~/core/ics/dates";
import type { IsoDate, TodoItem } from "~/core/schema";
import { formatShortDate } from "~/core/time";
import { compareItems, dueTimeLabel, weekDates, weekStart } from "~/core/todo";
import { tintStyle } from "~/features/calendar/tint";
import { Button } from "~/ui/button";
import { WithTooltip } from "~/ui/tooltip";
import { TodoCheckbox } from "./todo-item";
import type { ListProps } from "./todo-lists";

// The week, on desktop (docs/V3.md §3.1, §3.9): seven days side by side with
// the Due lane, each item a chip in its course's tint. Exams are dashed.
// The lane sits where the scheduler's grid would start, so the class grid
// can go under it once Plan links a schedule to a term.

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function Chip({
  item,
  done,
  props,
}: {
  item: TodoItem;
  done: boolean;
  props: ListProps;
}) {
  const { color } = props.look(item);
  return (
    <li
      data-testid="todo-chip"
      style={!done && color ? tintStyle(color) : undefined}
      className={cn(
        "flex items-start gap-1 border text-xs",
        item.exam && "border-dashed",
        (done || !color) && "border-hairline-strong bg-panel",
        done && "text-muted",
      )}
    >
      <TodoCheckbox
        title={item.title}
        done={done}
        onToggle={() => props.onToggle(item)}
        className="md:size-6"
      />
      <div className="min-w-0 flex-1 py-1 pr-1">
        <p
          data-private=""
          className={cn("line-clamp-3 break-words", done && "line-through")}
        >
          {item.title}
        </p>
        {/* Faded like a block's time on the tint; muted text on a done chip
            can't fade further and stay readable. */}
        <p className={cn("tnum", !done && color && "opacity-80")}>
          {dueTimeLabel(item)}
          {item.exam ? " · Exam" : ""}
        </p>
      </div>
    </li>
  );
}

export function WeekView(props: ListProps & { from: IsoDate; to: IsoDate }) {
  const thisWeek = weekStart(props.today);
  const [monday, setMonday] = useState(thisWeek);
  const dates = weekDates(monday);
  const sunday = addDays(monday, 6);
  const inWeek = props.items
    .filter((i) => i.dueDate >= monday && i.dueDate <= sunday)
    .sort(compareItems);
  const canBack = addDays(monday, -1) >= props.from;
  const canForward = addDays(monday, 7) <= props.to;
  // The week's classes: the term its Monday falls in.
  const term = seasonTermOf(monday);

  return (
    <section aria-labelledby="todo-week">
      <div className="mb-2 flex items-center gap-2">
        <h2 id="todo-week" className="font-semibold text-base">
          {formatShortDate(monday)} – {formatShortDate(sunday)}
        </h2>
        <WithTooltip label={`Your ${termLabel(term)} classes`}>
          <Link
            to="/schedule"
            search={{ term }}
            onClick={() => crossLinkClicked("todo", "schedule")}
            className="text-muted text-sm underline-offset-2 hover:text-fg hover:underline"
          >
            {viewWords("schedule")}
          </Link>
        </WithTooltip>
        <div className="ml-auto flex items-center gap-1">
          <WithTooltip label="Back a week">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Back a week"
              disabled={!canBack}
              onClick={() => setMonday(addDays(monday, -7))}
            >
              <ChevronLeft aria-hidden="true" />
            </Button>
          </WithTooltip>
          <WithTooltip label="Go to this week">
            <Button
              variant="ghost"
              size="sm"
              disabled={monday === thisWeek}
              onClick={() => setMonday(thisWeek)}
            >
              This week
            </Button>
          </WithTooltip>
          <WithTooltip label="Ahead a week">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Ahead a week"
              disabled={!canForward}
              onClick={() => setMonday(addDays(monday, 7))}
            >
              <ChevronRight aria-hidden="true" />
            </Button>
          </WithTooltip>
        </div>
      </div>
      {inWeek.length === 0 ? (
        <p className="mb-2 text-muted text-sm">Nothing due this week.</p>
      ) : null}
      <div className="grid grid-cols-[48px_repeat(7,minmax(0,1fr))] border-hairline border-t border-l">
        <div className="border-hairline border-r border-b" />
        {dates.map((date, i) => (
          <div
            key={date}
            className={cn(
              "border-hairline border-r border-b px-2 py-1 text-sm",
              date === props.today
                ? "bg-accent-soft font-medium"
                : "text-muted",
            )}
          >
            {DAY_NAMES[i]} <span className="tnum">{Number(date.slice(8))}</span>
          </div>
        ))}
        <div className="border-hairline border-r border-b px-2 py-1 text-muted text-xs">
          Due
        </div>
        {dates.map((date) => {
          const day = inWeek.filter((i) => i.dueDate === date);
          return (
            <div
              key={date}
              className="min-h-24 border-hairline border-r border-b p-1"
            >
              {day.length > 0 ? (
                <ul aria-label={`Due ${date}`} className="space-y-1">
                  {day.map((item) => (
                    <Chip
                      key={item.uid}
                      item={item}
                      done={props.done.has(item.uid)}
                      props={props}
                    />
                  ))}
                </ul>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
