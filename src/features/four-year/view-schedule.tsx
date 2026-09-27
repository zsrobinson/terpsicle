import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { termLabel } from "~/core/catalog/terms";
import {
  fourYearColumnFor,
  placedInPlan,
  placedLine,
} from "~/core/four-year/handoff";
import type { TermId } from "~/core/schema";
import { readLinkedSchedulePlan, useLiveQuery } from "~/state/four-year-link";
import { WithTooltip } from "~/ui/tooltip";
import { fourYearDb, useFourYearFacts } from "./data";
import { useModel } from "./model";

// The next semester's foot (docs/V3.md §2.12): "From Plan A: 4 of 5 placed"
// when the scheduler has a plan for the term, and "View schedule", which
// makes or opens that plan. Read live from IndexedDB, so placing a section in
// the scheduler in another tab updates the count here.

export function ViewSchedule({ termId }: { termId: TermId }) {
  const { doc } = useModel();
  const db = fourYearDb();
  const linked = useLiveQuery(db ? termId : null, () =>
    db ? readLinkedSchedulePlan(db, termId) : Promise.resolve(null),
  );
  const latestTermId = useFourYearFacts((s) => s.latestTermId);
  const { courses } = fourYearColumnFor(doc, termId);
  const term = termLabel(termId);
  // Until Testudo lists the term, there are no sections to pick.
  const listed = latestTermId === null || termId <= latestTermId;
  return (
    <div className="flex min-h-9 items-center gap-2 border-hairline border-t px-2 py-1.5 text-xs">
      <span className="tnum min-w-0 truncate text-muted">
        {linked && courses.length > 0
          ? placedLine(linked.name, placedInPlan(courses, linked))
          : null}
      </span>
      {listed ? (
        <WithTooltip
          label={
            linked
              ? `Open ${linked.name} for ${term} in Schedule`
              : `Start a ${term} schedule with this semester's courses`
          }
        >
          <Link
            to="/schedule/courses"
            search={{ term: termId, from: "plan" }}
            className="ml-auto inline-flex h-11 shrink-0 items-center gap-1 font-medium text-fg underline-offset-2 hover:underline md:h-7"
          >
            View schedule
            <ArrowRight aria-hidden="true" className="size-3.5" />
          </Link>
        </WithTooltip>
      ) : (
        <span className="ml-auto shrink-0 text-muted">Not on Testudo yet</span>
      )}
    </div>
  );
}
