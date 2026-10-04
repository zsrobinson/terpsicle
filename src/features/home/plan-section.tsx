import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import type { FourYearCourses } from "~/core/four-year/course-lookup";
import {
  CREDITS_GOAL,
  creditsHeadline,
  creditTotals,
} from "~/core/four-year/credits";
import { allocateGenEds } from "~/core/four-year/gen-ed";
import { statusResolver } from "~/core/four-year/status";
import { fourYearDepts, genEdsCovered } from "~/core/home";
import type { AcademicCalendar, IsoDate } from "~/core/schema";
import type { FourYearDoc } from "~/core/schema/four-year";
import { ListRow } from "~/ui/list-row";
import { Skeleton } from "~/ui/skeleton";
import { WithTooltip } from "~/ui/tooltip";
import { HomeMeter } from "./meter";
import { fourYearCoursesQuery } from "./queries";
import { HomeSection, homeLinkClicked, ROW_LINK } from "./section";

// "Plan" (docs/V3.md §1.5): the four-year plan's credits and GenEds in one
// line, counted as Plan counts them, the credits with a bar toward 120.
// Only when there's a four-year plan on this device; without one, Plan's
// callout may stand in its place (./callouts).

export function PlanSection({
  doc,
  today,
  calendars,
}: {
  doc: FourYearDoc;
  today: IsoDate;
  calendars: readonly AcademicCalendar[];
}) {
  const lookup = useFourYearCourses(doc);
  const line = useMemo(() => {
    if (!lookup) return null;
    const statusOf = statusResolver(today, calendars);
    const totals = creditTotals(doc, lookup, statusOf);
    const genEds = genEdsCovered(
      allocateGenEds(doc, lookup, statusOf).progress,
    );
    return {
      total: totals.total,
      credits: creditsHeadline(totals),
      genEds: `${genEds.covered} of ${genEds.of} GenEds covered`,
    };
  }, [doc, lookup, today, calendars]);

  return (
    <HomeSection
      product="plan"
      title="Four-year plan"
      to="/plan"
      tooltip={`Open ${doc.name} in Plan`}
    >
      <ul aria-label={doc.name}>
        <ListRow
          as="li"
          className="relative px-0 hover:bg-hover"
          secondary={
            line ? (
              <span className="tnum">{line.genEds}</span>
            ) : (
              <Skeleton className="mt-1 h-3 w-40" />
            )
          }
          trail={
            line ? (
              <HomeMeter
                value={line.total}
                max={CREDITS_GOAL}
                words={line.credits}
                className="text-fg"
              />
            ) : (
              <Skeleton className="h-3 w-24" />
            )
          }
        >
          <WithTooltip label={`Open ${doc.name} in Plan`}>
            <Link
              to="/plan"
              onClick={() => homeLinkClicked("plan")}
              className={ROW_LINK}
            >
              <span className="font-medium">{doc.name}</span>
            </Link>
          </WithTooltip>
        </ListRow>
      </ul>
    </HomeSection>
  );
}

/**
 * The course index's departments the plan uses; null while they load. A
 * plan that needs another department keeps what's shown until it loads.
 */
function useFourYearCourses(doc: FourYearDoc): FourYearCourses | null {
  const query = useQuery({
    ...fourYearCoursesQuery(fourYearDepts(doc)),
    placeholderData: keepPreviousData,
  });
  if (query.isPending) return null;
  // Unreadable: count what's known, as Plan does before files load.
  return query.data ?? NOTHING_LOADED;
}

const NOTHING_LOADED: FourYearCourses = {
  courses: new Map(),
  loadedDepts: new Set(),
};
