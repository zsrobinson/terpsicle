import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import type { FourYearCourses } from "~/core/four-year/course-lookup";
import { creditsHeadline, creditTotals } from "~/core/four-year/credits";
import { allocateGenEds } from "~/core/four-year/gen-ed";
import { statusResolver } from "~/core/four-year/status";
import { genEdsCovered } from "~/core/home";
import type { AcademicCalendar, IsoDate } from "~/core/schema";
import type { FourYearDoc } from "~/core/schema/four-year";
import { ListRow } from "~/ui/list-row";
import { Skeleton } from "~/ui/skeleton";
import { WithTooltip } from "~/ui/tooltip";
import { loadFourYearCourses } from "./data";
import { HomeSection, homeLinkClicked, ROW_LINK } from "./section";

// "Plan" (docs/V3.md §1.5): the four-year plan's credits and GenEds in one
// line, counted as Plan counts them. Only when there's a four-year plan on
// this device: Home shows what you have, it doesn't sell a product.

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
              <span className="text-fg">{line.credits}</span>
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

/** The course index's departments the plan uses; null while they load. */
function useFourYearCourses(doc: FourYearDoc): FourYearCourses | null {
  const [lookup, setLookup] = useState<FourYearCourses | null>(null);
  useEffect(() => {
    let live = true;
    void loadFourYearCourses(doc)
      .catch(() => null)
      .then((next) => {
        // Unreadable: count what's known, as Plan does before files load.
        if (live)
          setLookup(next ?? { courses: new Map(), loadedDepts: new Set() });
      });
    return () => {
      live = false;
    };
  }, [doc]);
  return lookup;
}
