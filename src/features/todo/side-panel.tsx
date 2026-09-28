import { Link } from "@tanstack/react-router";
import { cn } from "cn";
import {
  ChevronDown,
  Eye,
  EyeOff,
  MessagesSquare,
  RefreshCw,
} from "lucide-react";
import type { ReactNode } from "react";
import { crossLinkClicked } from "~/app/cross-link";
import { SectionHeader } from "~/app/panel";
import type {
  CourseCode,
  CourseColor,
  IsoDate,
  TermId,
  TodoFeedState,
} from "~/core/schema";
import { formatShortDate } from "~/core/time";
import {
  type CourseWeeks,
  feedWords,
  type Progress,
  totalOf,
  type WeekStart,
} from "~/core/todo";
import { dotStyle } from "~/features/calendar/tint";
import { usePushAskCard } from "~/features/notifications/push-ask";
import { PushAskCard } from "~/features/notifications/push-ask-card";
import { Button } from "~/ui/button";
import { ListRow } from "~/ui/list-row";
import { SegmentedControl } from "~/ui/segmented-control";
import { WithTooltip } from "~/ui/tooltip";
import { Composer } from "./composer";
import { ConnectForm } from "./connect-form";
import { useTodo } from "./todo-store";

// Todo's side panel (docs/V3.md §3.9), where the scheduler and Plan keep
// theirs: adding a task, each course's week (its completion over the last
// four weeks, and hiding it), ELMS, and the day weeks start on. One column,
// no tabs: it's four short parts, and the composer stays in view.

export const TODO_CONNECT_PATH = "/todo/connect";

/** An inline link in running text. */
export const TEXT_LINK =
  "text-fg underline decoration-hairline-strong underline-offset-2 hover:decoration-fg";

/** One course in the panel: its identity, its weeks, and whether it's hidden. */
export interface CourseRow extends CourseWeeks {
  color: CourseColor | null;
  hidden: boolean;
  /** Its chat room's term, when it has a code and Chat is on. */
  chatTerm: TermId | null;
}

/** "3 of 5". */
function ofWords({ done, total }: Progress): string {
  return `${done} of ${total}`;
}

/**
 * A course's last four weeks as small columns: each week's share done, the
 * week shown in full color and the ones before it lighter. A week with
 * nothing due is a baseline tick. The words say it all (the tooltip and the
 * accessible name), so the columns are never the only way to read it.
 */
function WeekBars({ row }: { row: CourseRow }) {
  const words = row.weeks
    .map(
      (w) =>
        `week of ${formatShortDate(w.week)}: ${
          w.total === 0 ? "nothing due" : `${ofWords(w)} done`
        }`,
    )
    .join("; ");
  const name = row.code ?? row.key;
  return (
    <WithTooltip label={`${name}, ${words}`}>
      <span
        role="img"
        aria-label={`${name} by week: ${words}`}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: the tooltip needs a focus stop
        tabIndex={0}
        className="flex h-6 items-end gap-0.5"
      >
        {row.weeks.map((w, i) => {
          const last = i === row.weeks.length - 1;
          const share = w.total === 0 ? 0 : w.done / w.total;
          return (
            <span
              key={w.week}
              className={cn(
                "relative flex h-full w-1.5 items-end",
                w.total > 0 && "bg-hover",
              )}
            >
              {w.total === 0 ? (
                <span className="h-px w-full bg-hairline-strong" />
              ) : share > 0 ? (
                <span
                  className={cn(
                    "w-full rounded-t-[2px]",
                    !row.color && "bg-fg",
                    !last && "opacity-50",
                  )}
                  style={{
                    height: `${share * 100}%`,
                    ...(row.color ? dotStyle(row.color) : {}),
                  }}
                />
              ) : null}
            </span>
          );
        })}
      </span>
    </WithTooltip>
  );
}

function CourseLine({
  row,
  onHide,
}: {
  row: CourseRow;
  onHide: (row: CourseRow, hide: boolean) => void;
}) {
  const name = row.code ?? row.key;
  const week = row.weeks.at(-1) ?? { done: 0, total: 0 };
  return (
    <ListRow
      as="li"
      density="compact"
      aria-label={name}
      className={cn("px-4", row.hidden && "text-muted")}
      lead={
        <span
          aria-hidden="true"
          className={cn("block size-2.5 shrink-0", !row.color && "bg-muted")}
          style={row.color && !row.hidden ? dotStyle(row.color) : undefined}
        />
      }
      secondary={
        row.hidden
          ? "Hidden everywhere in Todo"
          : week.total === 0
            ? "Nothing due this week"
            : `${ofWords(week)} done this week`
      }
      trail={row.hidden ? undefined : <WeekBars row={row} />}
      action={
        <span className="flex items-center">
          {row.chatTerm && row.code && !row.hidden ? (
            <WithTooltip
              label={`View chat: talk with the people in ${row.code}`}
            >
              <Button variant="ghost" size="icon-sm" asChild>
                <Link
                  to="/chat"
                  search={{ term: row.chatTerm, course: row.code }}
                  aria-label={`View chat for ${row.code}`}
                  onClick={() => crossLinkClicked("todo", "chat")}
                >
                  <MessagesSquare aria-hidden="true" />
                </Link>
              </Button>
            </WithTooltip>
          ) : null}
          {row.key === "Other" ? null : (
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
      }
    >
      <span
        data-private={row.code ? undefined : ""}
        className={cn(
          "block truncate font-medium",
          row.code && "ident",
          row.hidden && "line-through",
        )}
      >
        {name}
      </span>
    </ListRow>
  );
}

/** "This week": everything's done of what's due, then each course. */
function WeekSection({
  rows,
  lastWeek,
  isThisWeek,
  onHide,
}: {
  rows: readonly CourseRow[];
  lastWeek: IsoDate;
  isThisWeek: boolean;
  onHide: (row: CourseRow, hide: boolean) => void;
}) {
  const shown = rows.filter((r) => !r.hidden);
  const total = totalOf(shown, (shown[0]?.weeks.length ?? 1) - 1);
  const title = isThisWeek
    ? "This week"
    : `Week of ${formatShortDate(lastWeek)}`;
  return (
    <section aria-label={title}>
      <SectionHeader
        level={2}
        title={title}
        count={total.total === 0 ? undefined : `${ofWords(total)} done`}
      />
      {rows.length === 0 ? (
        <p className="px-4 py-3 text-muted text-sm">
          Your courses show here once something's due, with how much you've done
          each week.
        </p>
      ) : (
        <>
          {total.total > 0 ? (
            <div
              aria-hidden="true"
              className="mx-4 mt-3 flex h-1.5 overflow-hidden bg-hover"
            >
              <span
                className="bg-fg"
                style={{ width: `${(total.done / total.total) * 100}%` }}
              />
            </div>
          ) : null}
          <ul aria-label="Courses" className="py-1">
            {rows.map((row) => (
              <CourseLine key={row.key} row={row} onHide={onHide} />
            ))}
          </ul>
          <p className="px-4 pb-3 text-muted text-xs">
            Columns show each of the last four weeks, this one darkest.
          </p>
        </>
      )}
    </section>
  );
}

function RefreshButton() {
  const refresh = useTodo((s) => s.refresh);
  const refreshing = useTodo((s) => s.refreshing);
  return (
    <WithTooltip label="Check ELMS now">
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Check ELMS now"
        disabled={refreshing}
        onClick={() => void refresh()}
      >
        <RefreshCw aria-hidden="true" className="size-3.5" />
      </Button>
    </WithTooltip>
  );
}

const TOO_SOON = "ELMS was checked in the last 5 minutes.";
const NO_ANSWER = "ELMS didn't answer. We'll try again in 20 minutes.";

/** ELMS: connected and fresh, stale, broken, or not connected (with the paste). */
function ElmsSection({
  feed,
  now,
  hasFileItems,
}: {
  feed: TodoFeedState | null;
  now: number;
  hasFileItems: boolean;
}) {
  const refreshing = useTodo((s) => s.refreshing);
  const refreshNote = useTodo((s) => s.refreshNote);
  // Connecting here asks for reminders here (V2 §6.7): the section holds the
  // card's place from before the paste, as the connected rows replace it.
  usePushAskCard("todo-connected");
  const words = feedWords(feed, now);
  const manage = (
    <WithTooltip label="Connect, check or disconnect ELMS, or add a file">
      <Link to={TODO_CONNECT_PATH} className={cn(TEXT_LINK, "max-md:py-3")}>
        {feed ? "ELMS link" : "How to find the link"}
      </Link>
    </WithTooltip>
  );
  return (
    <section aria-label="ELMS">
      <SectionHeader
        level={2}
        title="ELMS"
        right={feed && feed.status !== "broken" ? <RefreshButton /> : null}
      />
      <div className="flex flex-col gap-2 px-4 py-3 text-sm">
        {!feed ? (
          <>
            <p className="text-muted">
              {hasFileItems
                ? "Some deadlines came from a file. Connect ELMS to keep them up to date."
                : "Connect ELMS and your assignments and quizzes show up on their due dates."}
            </p>
            <ConnectForm stacked />
            <p>{manage}</p>
          </>
        ) : feed.status === "broken" ? (
          <>
            <p className="text-fg">{words.problem}</p>
            <p>
              <WithTooltip label="Paste the link from Calendar Feed again">
                <Link to={TODO_CONNECT_PATH} className={TEXT_LINK}>
                  Paste a new link
                </Link>
              </WithTooltip>
            </p>
          </>
        ) : (
          <>
            <p className="text-fg" role="status">
              {refreshing
                ? "Checking ELMS…"
                : (words.checked ?? "Connected. We haven't read it yet.")}
            </p>
            {words.problem ? (
              <p className="text-muted">{words.problem}</p>
            ) : refreshNote === "failed" ? (
              <p className="text-muted">{NO_ANSWER}</p>
            ) : refreshNote === "too-soon" ? (
              <p className="text-muted">{TOO_SOON}</p>
            ) : null}
            <PushAskCard moment="todo-connected" />
            <p>{manage}</p>
          </>
        )}
      </div>
    </section>
  );
}

/** The day weeks start on, which follows the account like the other prefs. */
function WeekStartSection({
  weekStart,
  onWeekStart,
}: {
  weekStart: WeekStart;
  onWeekStart: (start: WeekStart) => void;
}) {
  return (
    <section aria-label="Calendar">
      <SectionHeader level={2} title="Weeks start on" />
      <div className="px-4 py-3">
        <SegmentedControl
          label="Weeks start on"
          value={weekStart}
          onValueChange={onWeekStart}
          options={[
            {
              value: "monday",
              label: "Monday",
              hint: "Weeks run Monday to Sunday, so Sunday-night deadlines end the week",
            },
            {
              value: "sunday",
              label: "Sunday",
              hint: "Weeks run Sunday to Saturday",
            },
          ]}
        />
      </div>
    </section>
  );
}

export function SidePanel({
  courses,
  colors,
  weekStart,
  onWeekStart,
  rows,
  lastWeek,
  isThisWeek,
  onHide,
  feed,
  now,
  hasFileItems,
  fold,
  className,
}: {
  courses: readonly CourseCode[];
  colors: Readonly<Record<CourseCode, CourseColor>>;
  weekStart: WeekStart;
  onWeekStart: (start: WeekStart) => void;
  rows: readonly CourseRow[];
  lastWeek: IsoDate;
  isThisWeek: boolean;
  onHide: (row: CourseRow, hide: boolean) => void;
  feed: TodoFeedState | null;
  now: number;
  hasFileItems: boolean;
  /** A phone: everything under the composer folds away, above the calendar. */
  fold?: { open: boolean; onOpenChange: (open: boolean) => void };
  className?: string;
}) {
  const shown = rows.filter((r) => !r.hidden);
  const total = totalOf(shown, (shown[0]?.weeks.length ?? 1) - 1);
  const rest = (
    <>
      <WeekSection
        rows={rows}
        lastWeek={lastWeek}
        isThisWeek={isThisWeek}
        onHide={onHide}
      />
      <ElmsSection feed={feed} now={now} hasFileItems={hasFileItems} />
      <WeekStartSection weekStart={weekStart} onWeekStart={onWeekStart} />
    </>
  );
  return (
    <div className={cn("flex flex-col", className)}>
      <section aria-label="Add a task">
        {fold ? null : (
          <SectionHeader level={2} title="Add a task" className="border-t-0" />
        )}
        <Composer
          courses={courses}
          colors={colors}
          weekStart={weekStart}
          compact={fold !== undefined}
          className={fold ? "py-3" : "px-4 py-3"}
        />
      </section>
      {fold ? (
        <Fold
          summary={
            total.total > 0
              ? `${isThisWeek ? "This week" : "That week"}: ${ofWords(total)} done`
              : feed
                ? ""
                : "ELMS isn't connected"
          }
          open={fold.open}
          onOpenChange={fold.onOpenChange}
        >
          {rest}
        </Fold>
      ) : (
        rest
      )}
    </div>
  );
}

/** A phone's fold for everything under the composer: closed, it says the week in a line. */
function Fold({
  summary,
  open,
  onOpenChange,
  children,
}: {
  summary: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  return (
    <div className="-mx-4">
      <WithTooltip
        label={
          open ? "Hide courses and ELMS" : "Show your courses' weeks and ELMS"
        }
      >
        <button
          type="button"
          aria-expanded={open}
          onClick={() => onOpenChange(!open)}
          className={cn(
            "flex h-11 w-full items-center gap-2 border-hairline border-t px-4 text-left text-sm hover:bg-hover",
            !open && "border-b",
          )}
        >
          <ChevronDown
            size={14}
            aria-hidden="true"
            className={cn(
              "shrink-0 text-muted transition-transform",
              !open && "-rotate-90",
            )}
          />
          <span className="font-medium">Courses and ELMS</span>
          <span className="tnum min-w-0 truncate text-muted">{summary}</span>
        </button>
      </WithTooltip>
      {open ? children : null}
    </div>
  );
}
