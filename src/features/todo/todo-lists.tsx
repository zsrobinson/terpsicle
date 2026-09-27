import { Link } from "@tanstack/react-router";
import { cn } from "cn";
import { ChevronDown, MoreHorizontal } from "lucide-react";
import { type ReactNode, useState } from "react";
import { crossLinkClicked, viewWords } from "~/app/cross-link";
import type {
  CourseCode,
  CourseColor,
  IsoDate,
  TermId,
  TodoItem,
} from "~/core/schema";
import {
  courseChatTerm,
  doneWords,
  dueWords,
  groupByCourse,
  groupByDay,
  NO_COURSE_KEY,
  progressWords,
  relativeDue,
  type TodoCourseGroup,
  type TodoDay,
  taskFieldsOf,
} from "~/core/todo";
import { dotStyle } from "~/features/calendar/tint";
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
  /** The time, ticking each minute, for "Due in 3 hours". */
  now: number;
  /** The courses an own task can be for: on the feed and in your plans. */
  taskCourses: readonly CourseCode[];
  /** Deletes an own task, with Undo. */
  onDeleteTask: (item: TodoItem) => void;
}

/** An own task: its row with Edit and Delete, or its fields while it's changed. */
function OwnTaskRow({
  item,
  done,
  props,
  when,
  showCourse,
}: {
  item: TodoItem;
  done: boolean;
  props: ListProps;
  when: string | undefined;
  showCourse: boolean;
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
      when={when}
      relative={relativeDue(item, props.now, props.today)}
      showCourse={showCourse}
      onToggle={() => props.onToggle(item)}
      menu={
        <DropdownMenu>
          <WithTooltip label="Edit or delete this task">
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`${item.title} options`}
                className="-my-3 md:-my-1.5"
              >
                <MoreHorizontal aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
          </WithTooltip>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setEditing(true)}>
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => props.onDeleteTask(item)}>
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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
  when,
}: {
  items: readonly TodoItem[];
  done: boolean;
  props: ListProps;
  when?: (item: TodoItem) => string;
}) {
  // Under a course's heading (when there's `when`), the course goes unsaid.
  return items.map((item) =>
    item.source === "own" ? (
      <OwnTaskRow
        key={item.uid}
        item={item}
        done={done}
        props={props}
        when={when?.(item)}
        showCourse={when === undefined}
      />
    ) : (
      <TodoItemRow
        key={item.uid}
        item={item}
        done={done}
        {...props.look(item)}
        when={when?.(item)}
        relative={relativeDue(item, props.now, props.today)}
        showCourse={when === undefined}
        note={
          item.uid === props.noteUid ? GRADESCOPE_EXTENSIONS_NOTE : undefined
        }
        onToggle={() => props.onToggle(item)}
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
  props: ListProps;
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

/** A course group's way into its chat room (`courseChatTerm`). */
function ViewChat({ code, term }: { code: CourseCode; term: TermId }) {
  return (
    <WithTooltip label={`Talk with the people in ${code}`}>
      <Link
        to="/chat"
        search={{ term, course: code }}
        onClick={() => crossLinkClicked("todo", "chat")}
        className="inline-flex min-h-11 shrink-0 items-center text-muted text-sm underline-offset-2 hover:text-fg hover:underline md:min-h-0"
      >
        {viewWords("chat")}
      </Link>
    </WithTooltip>
  );
}

/**
 * A course's week: a small bar in its color and "3 of 5 done", counting what's
 * due Monday to Sunday, done or not.
 */
function WeekProgress({
  group,
  color,
}: {
  group: TodoCourseGroup;
  color: CourseColor | null;
}) {
  const { done, total } = group.week;
  if (total === 0) return null;
  const words = progressWords(group.week);
  return (
    <div className="flex items-center gap-2 pt-1.5 text-muted text-xs">
      <div
        role="progressbar"
        aria-label={`This week in ${group.code ?? group.key}`}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        aria-valuetext={words}
        className="h-1.5 w-24 shrink-0 bg-hover"
      >
        <div
          style={{
            width: `${(done / total) * 100}%`,
            ...(color ? dotStyle(color) : {}),
          }}
          className={cn("h-full", color ? null : "bg-fg")}
        />
      </div>
      <span className="tnum">{words} this week</span>
    </div>
  );
}

/** A course group's ⋯: hide its items everywhere (with Undo). */
function GroupMenu({ name, onHide }: { name: string; onHide: () => void }) {
  return (
    <DropdownMenu>
      <WithTooltip label={`Hide ${name}'s items everywhere in Todo`}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`${name} options`}
            className="max-md:-my-2 shrink-0"
          >
            <MoreHorizontal aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
      </WithTooltip>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={onHide}>
          <span data-private="">Hide {name}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The name a course group goes by in its menu and toast. */
export function groupName(
  group: Pick<TodoCourseGroup, "code" | "key">,
): string {
  return group.code ?? group.key;
}

export function CourseList(
  props: ListProps & {
    planCourses: ReadonlySet<CourseCode>;
    /** Chat is on here: each course group links to its room. */
    chatOn: boolean;
    /** Hides a course group's items everywhere, with Undo. */
    onHideCourse: (group: TodoCourseGroup) => void;
  },
) {
  const groups = groupByCourse(
    props.items,
    props.done,
    props.today,
    props.planCourses,
  );
  if (groups.length === 0)
    return <p className="py-2 text-muted text-sm">Nothing due.</p>;
  const when = (item: TodoItem) => dueWords(item, props.today);
  return (
    <div className="space-y-6">
      {groups.map((group) => {
        const first = group.open[0] ?? group.done[0];
        const color = first ? props.look(first).color : null;
        const chatTerm = courseChatTerm(group, props.today);
        return (
          <section key={group.key} aria-label={group.code ?? group.key}>
            <div className="flex min-w-0 items-center gap-2 border-hairline border-b pb-1">
              <h2 className="flex min-w-0 items-center gap-2 font-semibold text-base">
                {group.code !== null ? (
                  <CourseTag code={group.code} label={null} color={color} />
                ) : null}
                <span
                  data-private=""
                  className="min-w-0 truncate font-normal text-muted text-sm"
                >
                  {group.code !== null
                    ? (group.label ?? "")
                    : group.key === NO_COURSE_KEY
                      ? "Not from a course"
                      : group.key}
                </span>
              </h2>
              <span className="tnum ml-auto shrink-0 text-muted text-sm">
                {group.open.length} open
              </span>
              {group.code !== null && props.chatOn && chatTerm ? (
                <ViewChat code={group.code} term={chatTerm} />
              ) : null}
              {group.key !== NO_COURSE_KEY ? (
                <GroupMenu
                  name={groupName(group)}
                  onHide={() => props.onHideCourse(group)}
                />
              ) : null}
            </div>
            <WeekProgress group={group} color={color} />
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
