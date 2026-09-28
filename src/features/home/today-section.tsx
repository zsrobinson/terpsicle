import { cn } from "cn";
import { Footprints } from "lucide-react";
import { termLabel } from "~/core/catalog/terms";
import {
  type ClassDay,
  classesLeft,
  classesOn,
  classPlaceWords,
  isUnderWay,
  type TodayClass,
  walkWords,
} from "~/core/home";
import { mainPlanFor } from "~/core/plans/main-plan";
import type { AcademicCalendar, Plan, TermId } from "~/core/schema";
import { formatTime, formatTimeRange, spokenTimeRange } from "~/core/time";
import { type CampusMap, EMPTY_CAMPUS } from "~/core/travel";
import { meetingKindWords } from "~/features/course-details/words";
import { ListRow } from "~/ui/list-row";
import type { HomeLocal } from "./local";
import { HomeNote, HomeSection, HomeSkeleton } from "./section";
import type { HomeClock } from "./use-home";

// "Today" (docs/V3.md §1.5): what's left of today in the main plan of the
// term in session (Now), each class with its room, and between two
// buildings the walk, as the Travel tab works it out. From the plan's own
// snapshots, so it shows at once, offline too; the walk fills in when the
// campus map loads.

export function TodaySection({
  clock,
  local,
  now,
  calendars,
  campus,
  signedIn,
}: {
  clock: HomeClock;
  local: HomeLocal | null;
  /** The term in session; null between terms. */
  now: TermId | null;
  calendars: readonly AcademicCalendar[];
  campus: CampusMap | null;
  /** Signed in, plans sync: "on this device" would undersell them. */
  signedIn: boolean;
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
        <HomeSkeleton rows={2} label="Loading today's classes" />
      ) : (
        <TodayBody
          clock={clock}
          plan={plan}
          now={now}
          calendar={calendars.find((c) => c.termId === now) ?? null}
          campus={campus}
          travel={local.travel}
          signedIn={signedIn}
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
}: {
  clock: HomeClock;
  plan: Plan | null;
  now: TermId | null;
  calendar: AcademicCalendar | null;
  campus: CampusMap | null;
  travel: HomeLocal["travel"];
  signedIn: boolean;
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
  const day: ClassDay = classesOn(
    plan,
    clock.today,
    calendar,
    travel,
    campus ?? EMPTY_CAMPUS,
  );
  if (day.kind === "break")
    return <HomeNote>No classes today: {day.name}.</HomeNote>;
  if (day.kind === "none") return <HomeNote>No classes today.</HomeNote>;
  const left = classesLeft(day.classes, clock.minutes);
  if (left.length === 0)
    return <HomeNote>That's all for today. Your classes are done.</HomeNote>;
  return (
    <ul aria-label="Today's classes">
      {left.map((c) => (
        <ClassRow
          key={`${c.sectionKey}:${c.start}`}
          c={c}
          underWay={isUnderWay(c, clock.minutes)}
          // A walk to a class that's already begun is behind you.
          showWalk={c.start > clock.minutes}
        />
      ))}
    </ul>
  );
}

function ClassRow({
  c,
  underWay,
  showWalk,
}: {
  c: TodayClass;
  underWay: boolean;
  showWalk: boolean;
}) {
  const place = classPlaceWords(c);
  const kind = meetingKindWords(c.kind);
  return (
    <ListRow
      as="li"
      align="start"
      className="px-0"
      lead={
        <span
          className={cn(
            "tnum block w-16 pt-px font-medium text-sm",
            underWay ? "text-fg" : "text-muted",
          )}
        >
          {underWay ? "Now" : formatTime(c.start)}
        </span>
      }
      secondary={
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="tnum">
            <span aria-hidden="true">{formatTimeRange(c.start, c.end)}</span>
            <span className="sr-only">{spokenTimeRange(c.start, c.end)}</span>
          </span>
          {c.walk && showWalk ? (
            <span className="flex items-center gap-1">
              <Footprints size={12} aria-hidden="true" />
              {walkWords(c.walk)}
            </span>
          ) : null}
        </span>
      }
      trail={place ? <span className="ident">{place}</span> : undefined}
    >
      <span className="ident font-semibold">{c.courseCode}</span>{" "}
      <span className="text-muted">{kind.long}</span>
    </ListRow>
  );
}
