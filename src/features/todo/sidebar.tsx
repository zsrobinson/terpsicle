import { Link } from "@tanstack/react-router";
import { cn } from "cn";
import { Check, Eye, EyeOff } from "lucide-react";
import { type CSSProperties, useRef } from "react";
import { IntegrationLabel } from "~/components/brand/integration-label";
import { PanelBody, SectionHeader } from "~/components/panel";
import { EVERYONE_SLUG } from "~/core/chat/room-paths";
import { courseColorTokens } from "~/core/color";
import type { CourseCode, CourseColor, IsoDate, TermId } from "~/core/schema";
import { formatShortDate } from "~/core/time";
import {
  type CourseWeek,
  compareItems,
  NO_COURSE_KEY,
  NO_DATE,
  type Progress,
  totalOf,
} from "~/core/todo";
import { PushAskCard } from "~/features/notifications/push-ask-card";
import { crossLinkClicked } from "~/lib/cross-link";
import { Button } from "~/ui/button";
import { useCelebrate } from "~/ui/celebrate";
import type { ConfettiColor, ConfettiSize } from "~/ui/confetti";
import { ListRow } from "~/ui/list-row";
import { WithTooltip } from "~/ui/tooltip";
import { ScheduleLink } from "./calendar";
import { Composer } from "./composer";
import { Rows, type ViewProps } from "./todo-lists";

// Todo's sidebar (docs/V3.md §3.9), the workbench's one panel, as Chat's
// is: ELMS's line first (when it last synced, and its settings), then
// Add a task, what has no date, and the week on screen: how much of it is
// done, then each course, with a bar in its color that fills as you check
// things off (the owner, 2026-09-29: "it feels rewarding to check things
// off that way"), and confetti off its end when a check fills it
// (docs/decisions.md, "Confetti when a check finishes the week"). On a
// phone it's the drawer (./todo-drawer).

/**
 * The sidebar's panel, in the desktop's sidebar or the phone's drawer: the
 * skip link's target, which takes focus.
 */
export const TODO_SIDEBAR_PANEL_ID = "todo-sidebar-panel";

/** One course in the week: its identity, what's done, and whether it's hidden. */
export interface CourseRow extends CourseWeek {
  color: CourseColor | null;
  hidden: boolean;
  /** Its chat room's term, when it has a code and Chat is on. */
  chatTerm: TermId | null;
}

/** "3 of 5 done", or "All 5 done". */
export function doneOfWords({ done, total }: Progress): string {
  if (total > 0 && done === total)
    return total === 1 ? "Done" : `All ${total} done`;
  return `${done} of ${total} done`;
}

/** Confetti for a bar as it finishes (`~/ui/celebrate`). */
export interface BarConfetti {
  /** The week, or a course in the week: `2026-09-28` or `2026-09-28 CMSC216`. */
  identity: string;
  colors: readonly ConfettiColor[];
  size: ConfettiSize;
  /** Held back: a course's bar as the week's finishes with it. */
  quiet?: boolean;
}

/**
 * The week's confetti: each course's color (Todo's yellow for a course
 * without one) as much as it has due.
 */
export function weekConfetti(rows: readonly CourseRow[]): ConfettiColor[] {
  return rows
    .filter((r) => !r.hidden && r.total > 0)
    .map((r) => ({
      token: r.color ? courseColorTokens(r.color).dot : "product-todo",
      weight: r.total,
    }));
}

/** A course's confetti: its color, or Todo's yellow for one without. */
function courseConfetti(color: CourseColor | null): ConfettiColor[] {
  return [
    {
      token: color ? courseColorTokens(color).dot : "product-todo",
      weight: 1,
    },
  ];
}

/**
 * A bar that fills as things are checked off: the week's in ink, a
 * course's in its color over its tint. The fill slides on the sheets'
 * curve, and jumps under Reduce Motion. It's a `progressbar` with the
 * words as its value, so the words are never only in the picture. With
 * `confetti`, a check that fills it sends confetti off its end (the owner,
 * 2026-10-05: "shooting out the side that the bar is progressing into").
 */
export function ProgressBar({
  progress,
  label,
  color,
  confetti,
  className,
}: {
  progress: Progress;
  label: string;
  color?: CourseColor | null;
  confetti?: BarConfetti;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useCelebrate(ref, {
    identity: confetti?.identity ?? "",
    done: progress.done,
    total: progress.total,
    colors: confetti?.colors ?? [],
    size: confetti?.size ?? "small",
    quiet: !confetti || confetti.quiet,
  });
  const share = progress.total === 0 ? 0 : progress.done / progress.total;
  const tokens = color ? courseColorTokens(color) : null;
  const track: CSSProperties | undefined = tokens
    ? { backgroundColor: `var(--${tokens.bg})` }
    : undefined;
  const fill: CSSProperties = {
    width: `${share * 100}%`,
    ...(tokens ? { backgroundColor: `var(--${tokens.dot})` } : {}),
  };
  return (
    <div
      ref={ref}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={progress.total}
      aria-valuenow={progress.done}
      aria-valuetext={doneOfWords(progress)}
      style={track}
      className={cn("h-1.5 overflow-hidden", !tokens && "bg-hover", className)}
    >
      <div
        data-testid="progress-fill"
        style={fill}
        className={cn(
          "h-full transition-[width] duration-(--dur-sheet) ease-sheet motion-reduce:transition-none",
          !tokens && "bg-fg",
        )}
      />
    </div>
  );
}

/**
 * "2 of 5 done", with a check once it's all done. Finishing moves nothing
 * (the owner saw "a bit of layout shift when everything for a week is
 * checked"): both wordings share one grid cell, the one not showing
 * invisible, so the cell is always the wider of the two and one height.
 */
export function DoneCount({
  progress,
  line = "h-5",
}: {
  progress: Progress;
  /** Its line's height: a row's 20px, or the drawer strip's 16px. */
  line?: "h-5" | "h-4";
}) {
  const all = progress.total > 0 && progress.done === progress.total;
  const cell = cn(
    "col-start-1 row-start-1 flex items-center justify-end gap-1",
    line,
  );
  return (
    <span className="tnum grid shrink-0 text-sm">
      <span className={cn(cell, "emph-label", !all && "invisible")}>
        <Check size={13} strokeWidth={2.5} aria-hidden="true" />
        {doneOfWords({ done: progress.total, total: progress.total })}
      </span>
      <span className={cn(cell, "emph-meta", all && "invisible")}>
        {`${progress.done} of ${progress.total} done`}
      </span>
    </span>
  );
}

function CourseLine({
  row,
  onHide,
  weekFirst,
  weekDone,
}: {
  row: CourseRow;
  onHide: (row: CourseRow, hide: boolean) => void;
  weekFirst: IsoDate;
  /** The whole week's done: its bar has the confetti. */
  weekDone: boolean;
}) {
  const name = row.code ?? row.key;
  const dot = row.color ? courseColorTokens(row.color).dot : null;
  return (
    <ListRow
      as="li"
      align="start"
      aria-label={name}
      className={cn("py-2", row.hidden && "text-muted")}
    >
      <div className="flex min-h-7 min-w-0 items-center gap-3">
        <span
          aria-hidden="true"
          className={cn(
            "block size-3 shrink-0",
            (!dot || row.hidden) && "bg-hairline-strong",
          )}
          style={
            dot && !row.hidden
              ? { backgroundColor: `var(--${dot})` }
              : undefined
          }
        />
        <span
          data-private={row.code ? undefined : ""}
          className={cn(
            "min-w-0 flex-1 truncate font-medium text-sm",
            row.code && "ident",
            row.hidden && "line-through",
          )}
        >
          {name}
        </span>
        {row.hidden ? null : row.total === 0 ? (
          <span className="emph-meta shrink-0 text-sm">Nothing due</span>
        ) : (
          <DoneCount progress={row} />
        )}
        <span className="-mr-1.5 flex shrink-0 items-center">
          {row.chatTerm && row.code && !row.hidden ? (
            <WithTooltip
              label={`View chat: talk with the people in ${row.code}`}
            >
              <Button
                variant="ghost"
                size="icon-sm"
                render={
                  <Link
                    to="/chat/$course/$room"
                    params={{ course: row.code, room: EVERYONE_SLUG }}
                    aria-label={`View chat for ${row.code}`}
                    onClick={() => crossLinkClicked("todo", "chat")}
                  />
                }
              >
                <IntegrationLabel product="chat" iconOnly />
              </Button>
            </WithTooltip>
          ) : null}
          {row.key === NO_COURSE_KEY ? null : (
            <WithTooltip
              label={
                row.hidden
                  ? `Show ${name}'s items again`
                  : `Hide ${name}'s items everywhere in Todo`
              }
            >
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={row.hidden ? `Show ${name}` : `Hide ${name}`}
                aria-pressed={row.hidden}
                onClick={() => onHide(row, !row.hidden)}
              >
                {row.hidden ? (
                  <EyeOff aria-hidden="true" />
                ) : (
                  <Eye aria-hidden="true" />
                )}
              </Button>
            </WithTooltip>
          )}
        </span>
      </div>
      {row.hidden ? (
        <p className="emph-secondary pl-6 text-sm">Hidden everywhere in Todo</p>
      ) : row.total > 0 ? (
        <ProgressBar
          progress={row}
          color={row.color}
          label={`${name} this week`}
          confetti={{
            identity: `${weekFirst} ${row.key}`,
            colors: courseConfetti(row.color),
            size: "small",
            quiet: weekDone,
          }}
          className="mt-1 mb-1.5 ml-6"
        />
      ) : null}
    </ListRow>
  );
}

/** The week on screen: all of it, then each course. */
function WeekSection({
  rows,
  weekFirst,
  thisWeek,
  schedule,
  onHide,
  inDrawer,
}: {
  inDrawer: boolean;
  rows: readonly CourseRow[];
  weekFirst: IsoDate;
  thisWeek: boolean;
  schedule: SidebarSchedule | null;
  onHide: (row: CourseRow, hide: boolean) => void;
}) {
  const shown = rows.filter((r) => !r.hidden);
  const total = totalOf(shown);
  const title = thisWeek
    ? "This week"
    : `Week of ${formatShortDate(weekFirst)}`;
  return (
    <section aria-label={title}>
      <SectionHeader
        level={2}
        // A phone's drawer says the week in its strip, over this.
        title={inDrawer ? "By course" : title}
        right={
          schedule ? (
            <ScheduleLink
              term={schedule.term}
              planId={schedule.planId}
              label={schedule.label}
              onClick={() => crossLinkClicked("todo", "schedule")}
            />
          ) : null
        }
      />
      {rows.length === 0 ? (
        <p className="emph-secondary px-4 py-3 text-sm">
          Each course shows here once something's due, with a bar that fills as
          you check things off.
        </p>
      ) : (
        <>
          {/* A phone's drawer has the week's bar in its strip. */}
          <div
            hidden={inDrawer}
            className="flex flex-col gap-2 border-hairline border-b px-4 pt-3 pb-4"
          >
            <div className="flex h-5 items-center justify-between gap-2">
              <span className="emph-label text-sm">Everything</span>
              {total.total === 0 ? (
                <span className="emph-meta text-sm">Nothing due</span>
              ) : (
                <DoneCount progress={total} />
              )}
            </div>
            <ProgressBar
              progress={total}
              label={`${title}, every course`}
              confetti={{
                identity: weekFirst,
                colors: weekConfetti(rows),
                size: "large",
              }}
              className="h-2"
            />
          </div>
          <ul aria-label="Courses">
            {rows.map((row) => (
              <CourseLine
                key={row.key}
                row={row}
                onHide={onHide}
                weekFirst={weekFirst}
                weekDone={total.total > 0 && total.done === total.total}
              />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/** Your own tasks with no date: no day on the week holds them. */
function Undated({ props }: { props: ViewProps }) {
  const undated = props.items
    .filter((i) => i.dueDate === null && !props.done.has(i.uid))
    .sort(compareItems);
  if (undated.length === 0) return null;
  return (
    <section aria-label={NO_DATE}>
      <SectionHeader level={2} title={NO_DATE} count={undated.length} />
      <ul className="px-4">
        <Rows items={undated} done={false} props={props} />
      </ul>
    </section>
  );
}

/** The week's classes in Schedule: its term, and the main plan to open. */
export interface SidebarSchedule {
  term: TermId;
  planId?: string;
  /** Its tooltip: "Opens Plan A, your main plan for Fall 2026". */
  label: string;
}

export function TodoSidebar({
  props,
  rows,
  weekFirst,
  thisWeek,
  schedule,
  onHide,
  courses,
  colors,
  inDrawer = false,
}: {
  /** A phone's drawer, whose strip has the week's bar. */
  inDrawer?: boolean;
  /** The items and what's done with them, as the week has them. */
  props: ViewProps;
  rows: readonly CourseRow[];
  /** The Monday of the week on screen. */
  weekFirst: IsoDate;
  thisWeek: boolean;
  schedule: SidebarSchedule | null;
  onHide: (row: CourseRow, hide: boolean) => void;
  courses: readonly CourseCode[];
  colors: Readonly<Record<CourseCode, CourseColor>>;
}) {
  return (
    <div
      id={TODO_SIDEBAR_PANEL_ID}
      tabIndex={-1}
      className="flex min-h-0 flex-1 flex-col outline-none"
    >
      <PanelBody>
        {/* Connecting ELMS asks for reminders here (V2 §6.7); a phone
            asks over the week, where it's seen (./todo-page). */}
        {inDrawer ? null : (
          <PushAskCard moment="todo-connected" className="m-3" />
        )}
        <section aria-label="Add task">
          <SectionHeader level={2} title="Add task" />
          <Composer
            courses={courses}
            colors={colors}
            compact
            className="px-4 pt-3 pb-4"
          />
        </section>
        <Undated props={props} />
        <WeekSection
          rows={rows}
          weekFirst={weekFirst}
          thisWeek={thisWeek}
          schedule={schedule}
          onHide={onHide}
          inDrawer={inDrawer}
        />
      </PanelBody>
    </div>
  );
}
