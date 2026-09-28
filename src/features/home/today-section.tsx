import { cn } from "cn";
import { Footprints } from "lucide-react";
import { termLabel } from "~/core/catalog/terms";
import {
  type ClassDay,
  classesOn,
  classPlaceWords,
  isUnderWay,
  laterDayWords,
  nextClassDay,
  startsInWords,
  type TodayClass,
  walkWords,
} from "~/core/home";
import { mainPlanFor } from "~/core/plans/main-plan";
import type {
  AcademicCalendar,
  CourseCode,
  CourseColor,
  Plan,
  TermId,
} from "~/core/schema";
import { formatTime, formatTimeRange, spokenTimeRange } from "~/core/time";
import { type CampusMap, EMPTY_CAMPUS } from "~/core/travel";
import { meetingKindWords } from "~/features/course-details/words";
import { CourseTag } from "~/features/todo/todo-item";
import { ListRow } from "~/ui/list-row";
import type { HomeLocal } from "./local";
import { HomeNote, HomeSection, HomeSkeleton } from "./section";
import type { HomeClock } from "./use-home";

// "Today" (docs/V3.md §1.5): the day's classes in the main plan of the
// term in session (Now), each with its room and, between two buildings,
// the walk, as the Travel tab works it out. The class under way says
// "Now", the next one "Next" with how long until it starts; the ones that
// are over stay, quietly, so the day reads whole. Once they're all over
// (or on a day without classes), the next day with classes follows. From
// the plan's own snapshots, so it shows at once, offline too; the walk
// fills in when the campus map loads.

type Colors = Readonly<Record<CourseCode, CourseColor>>;

export function TodaySection({
  clock,
  local,
  now,
  calendars,
  campus,
  signedIn,
  colors,
}: {
  clock: HomeClock;
  local: HomeLocal | null;
  /** The term in session; null between terms. */
  now: TermId | null;
  calendars: readonly AcademicCalendar[];
  campus: CampusMap | null;
  /** Signed in, plans sync: "on this device" would undersell them. */
  signedIn: boolean;
  colors: Colors;
}) {
  const plan =
    local && now ? mainPlanFor(now, local.plans, local.mainPlans) : null;
  return (
    <HomeSection
      product="schedule"
      title="Today"
      to="/schedule"
      search={plan ? { term: plan.termId, planId: plan.id } : undefined}
      tooltip={plan ? `Open ${plan.name} in Schedule` : "Plan your classes"}
    >
      {local === null ? (
        <HomeSkeleton rows={3} label="Loading today's classes" />
      ) : (
        <TodayBody
          clock={clock}
          plan={plan}
          now={now}
          calendar={calendars.find((c) => c.termId === now) ?? null}
          campus={campus}
          travel={local.travel}
          signedIn={signedIn}
          colors={colors}
        />
      )}
    </HomeSection>
  );
}

function TodayBody({
  clock,
  plan,
  now,
  calendar,
  campus,
  travel,
  signedIn,
  colors,
}: {
  clock: HomeClock;
  plan: Plan | null;
  now: TermId | null;
  calendar: AcademicCalendar | null;
  campus: CampusMap | null;
  travel: HomeLocal["travel"];
  signedIn: boolean;
  colors: Colors;
}) {
  if (now === null)
    return <HomeNote>No classes today: it's between semesters.</HomeNote>;
  if (plan === null)
    return (
      <HomeNote>
        No schedule for {termLabel(now)} {signedIn ? "yet" : "on this device"}.
        Add your classes in Schedule to see them here.
      </HomeNote>
    );
  const map = campus ?? EMPTY_CAMPUS;
  const day: ClassDay = classesOn(plan, clock.today, calendar, travel, map);
  const over =
    day.kind === "classes" && day.classes.every((c) => c.end <= clock.minutes);
  if (day.kind === "classes" && !over)
    return <ClassList classes={day.classes} clock={clock} colors={colors} />;

  const note =
    day.kind === "break"
      ? `No classes today: ${day.name}.`
      : day.kind === "none"
        ? "No classes today."
        : "That's all for today. Your classes are done.";
  const later = nextClassDay(plan, clock.today, calendar, travel, map);
  return (
    <>
      <HomeNote>{note}</HomeNote>
      {later ? (
        <div className="flex flex-col">
          <h3 className="pt-1 font-medium text-muted text-sm">
            {laterDayWords(later.date, clock.today)}
          </h3>
          <ul
            aria-label={`${laterDayWords(later.date, clock.today)}'s classes`}
          >
            {later.classes.map((c) => (
              <ClassRow
                key={`${c.sectionKey}:${c.start}`}
                c={c}
                status="later"
                color={colors[c.courseCode] ?? null}
              />
            ))}
          </ul>
        </div>
      ) : null}
    </>
  );
}

/** Where a class stands at this minute. */
type Status =
  | "over"
  | "now"
  | { next: string | null }
  | "later"
  /** Later today, after the next one. */
  | "today";

function ClassList({
  classes,
  clock,
  colors,
}: {
  classes: readonly TodayClass[];
  clock: HomeClock;
  colors: Colors;
}) {
  const nextIndex = classes.findIndex((c) => c.start > clock.minutes);
  return (
    <ul aria-label="Today's classes">
      {classes.map((c, i) => {
        const status: Status = isUnderWay(c, clock.minutes)
          ? "now"
          : c.end <= clock.minutes
            ? "over"
            : i === nextIndex
              ? { next: startsInWords(c.start, clock.minutes) }
              : "today";
        return (
          <ClassRow
            key={`${c.sectionKey}:${c.start}`}
            c={c}
            status={status}
            color={colors[c.courseCode] ?? null}
          />
        );
      })}
    </ul>
  );
}

function ClassRow({
  c,
  status,
  color,
}: {
  c: TodayClass;
  status: Status;
  color: CourseColor | null;
}) {
  const place = classPlaceWords(c);
  const kind = meetingKindWords(c.kind);
  const over = status === "over";
  const soon = status === "now" || typeof status === "object";
  // The walk is worth saying before a class starts, not once it has.
  const walk = c.walk && (status === "today" || typeof status === "object");
  return (
    <ListRow
      as="li"
      align="start"
      className="px-0"
      data-class-status={typeof status === "object" ? "next" : status}
      lead={
        <span
          className={cn(
            "tnum block w-14 pt-px text-sm",
            soon ? "font-semibold text-fg" : "text-muted",
          )}
        >
          {formatTime(c.start)}
        </span>
      }
      secondary={
        over ? undefined : (
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="tnum">
              <span aria-hidden="true">{formatTimeRange(c.start, c.end)}</span>
              <span className="sr-only">{spokenTimeRange(c.start, c.end)}</span>
            </span>
            {walk && c.walk ? (
              <span className="flex items-center gap-1">
                <Footprints size={12} aria-hidden="true" />
                {walkWords(c.walk)}
              </span>
            ) : null}
          </span>
        )
      }
      trail={<StatusTag status={status} />}
    >
      <p
        className={cn(
          "flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5",
          over && "opacity-60",
        )}
      >
        <CourseTag code={c.courseCode} label={null} color={color} />
        {place ? <span className="ident text-fg">{place}</span> : null}
        <span className="text-muted">{kind.long}</span>
      </p>
    </ListRow>
  );
}

/** "Now", "Next · in 40 min" or "Done": the one word a glance needs. */
function StatusTag({ status }: { status: Status }) {
  if (status === "over") return <span className="text-muted">Done</span>;
  if (status === "now")
    return (
      <span className="inline-flex h-[18px] items-center border border-fg px-1 text-fg text-xs">
        Now
      </span>
    );
  if (typeof status === "object")
    return (
      <span className="inline-flex h-[18px] items-center bg-accent-soft px-1.5 font-medium text-fg text-xs">
        {status.next ? `Next · ${status.next}` : "Next"}
      </span>
    );
  return null;
}
