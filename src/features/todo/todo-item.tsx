import { cn } from "cn";
import { ExternalLink } from "lucide-react";
import type { ReactNode } from "react";
import type {
  CourseCode,
  CourseColor,
  TodoItem,
  TodoItemSource,
} from "~/core/schema";
import { dueTimeLabel, isElmsUrl } from "~/core/todo";
import { tintStyle } from "~/features/calendar/tint";
import { ListRow } from "~/ui/list-row";
import { WithTooltip } from "~/ui/tooltip";

// One deadline (docs/V3.md §3.9): a checkbox, the title, its course (tinted
// with the scheduler's color), the due time, where it came from, and a link
// to it in ELMS. Titles and course names come from professors and ELMS:
// plain text only, and `data-private`.

/** Where an item came from, under its title. */
export const SOURCE_WORDS: Record<TodoItemSource, string> = {
  elms: "From ELMS",
  file: "From a file",
  own: "Yours",
};

/** A 44px target on phones, a compact one with a pointer. */
const TARGET = "flex size-11 shrink-0 items-center justify-center md:size-8";

export function TodoCheckbox({
  title,
  done,
  onToggle,
  sample = false,
  className,
}: {
  title: string;
  done: boolean;
  onToggle?: () => void;
  /** The front door's sample: it can't be checked, and says why. */
  sample?: boolean;
  className?: string;
}) {
  // The label is the target (44px on phones); the box inside is the control.
  return (
    <label className={cn(TARGET, sample ? null : "cursor-pointer", className)}>
      <WithTooltip
        label={
          sample
            ? "A sample. Sign in to check off your own."
            : done
              ? "Mark as not done"
              : "Mark done"
        }
      >
        <input
          type="checkbox"
          checked={done}
          disabled={sample}
          aria-label={sample ? `Sample: ${title}` : `Done: ${title}`}
          onChange={() => onToggle?.()}
          className="size-4 shrink-0 cursor-pointer accent-accent disabled:cursor-default"
        />
      </WithTooltip>
    </label>
  );
}

/** The course, tinted when there's a code; the ELMS course name, neutral, when there isn't. */
export function CourseTag({
  code,
  label,
  color,
}: {
  code: CourseCode | null;
  label: string | null;
  color: CourseColor | null;
}) {
  if (code !== null && color !== null)
    return (
      <span
        style={tintStyle(color)}
        className="ident shrink-0 border px-1 font-medium text-xs"
      >
        {code}
      </span>
    );
  if (code !== null)
    return <span className="ident shrink-0 font-medium text-xs">{code}</span>;
  if (label === null) return null;
  return (
    <span
      data-private=""
      className="min-w-0 max-w-[16rem] truncate bg-hover px-1 text-xs"
    >
      {label}
    </span>
  );
}

export function TodoItemRow({
  item,
  done,
  course,
  color,
  when,
  relative,
  onToggle,
  menu,
  preview = false,
  showCourse = true,
}: {
  item: TodoItem;
  done: boolean;
  /** The code it's filed under (re-matched against the person's plans). */
  course: CourseCode | null;
  color: CourseColor | null;
  /** The due words; defaults to the time alone ("11:59pm"), or nothing for no date. */
  when?: string;
  /**
   * Due today at a time: "Due in 3 hours" or, quietly, "Due 2 hours ago",
   * in the time's place, with the time in its tooltip.
   */
  relative?: string | null;
  onToggle?: () => void;
  /** An own task's Edit and Delete, in the link's place. */
  menu?: ReactNode;
  /** The front door's sample: nothing to press. */
  preview?: boolean;
  /** Off under a course's own heading. */
  showCourse?: boolean;
}) {
  const link = item.link !== null && isElmsUrl(item.link) ? item.link : null;
  // Under "No date", the heading already says it.
  const time = when ?? (item.dueDate === null ? null : dueTimeLabel(item));
  // Flush with the page's column, the kit's row. The checkbox's and the
  // link's targets reach into the row's padding, so a phone gets 44px
  // without a taller row.
  return (
    <ListRow
      as="li"
      align="start"
      data-testid="todo-item"
      className="px-0"
      lead={
        <TodoCheckbox
          title={item.title}
          done={done}
          onToggle={onToggle}
          sample={preview}
          className="-my-3 -mr-2 -ml-3 md:-my-1.5 md:-mr-1.5 md:-ml-2"
        />
      }
      secondary={
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {showCourse ? (
            <CourseTag code={course} label={item.courseLabel} color={color} />
          ) : null}
          {relative ? (
            <WithTooltip label={`Due today at ${dueTimeLabel(item)}`}>
              <time dateTime={item.dueAt ?? undefined} className="tnum">
                {relative}
                <span className="sr-only">, at {dueTimeLabel(item)}</span>
              </time>
            </WithTooltip>
          ) : time ? (
            <span className="tnum">{time}</span>
          ) : null}
          <span>{SOURCE_WORDS[item.source]}</span>
        </span>
      }
      action={
        menu && !preview ? (
          menu
        ) : link && !preview ? (
          <WithTooltip label="Open in ELMS">
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Open ${item.title} in ELMS`}
              className={cn(
                TARGET,
                "-my-3 text-muted transition-colors hover:bg-hover hover:text-fg md:-my-1.5",
              )}
            >
              <ExternalLink size={14} aria-hidden="true" />
            </a>
          </WithTooltip>
        ) : undefined
      }
    >
      <p
        data-private=""
        className={cn(
          "break-words font-medium",
          done ? "text-muted line-through" : "text-fg",
        )}
      >
        {item.title}
      </p>
    </ListRow>
  );
}
