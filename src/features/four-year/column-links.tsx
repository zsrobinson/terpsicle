import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { crossLinkClicked, viewWords } from "~/app/cross-link";
import { termLabel } from "~/core/catalog/terms";
import {
  fourYearColumnFor,
  placedInPlan,
  placedLine,
} from "~/core/four-year/handoff";
import type { TermId } from "~/core/schema";
import { useAccount } from "~/features/auth/account-store";
import { readMainPlan, useLiveQuery } from "~/state/four-year-link";
import { MainPlanMark } from "~/ui/term-tag";
import { WithTooltip } from "~/ui/tooltip";
import { fourYearDb, useFourYearFacts } from "./data";
import { useModel } from "./model";

// The links at the foot of two columns (docs/V3.md §1.2). The next
// semester's (§2.12): "From Plan A: 4 of 5 placed" when the scheduler has a
// plan for the term ("From Plan A, main · …" with the red square when it
// has drafts too; V2 §5.5), and "View schedule", which makes or opens its
// main plan; read live from IndexedDB, so placing a section in the scheduler
// in another tab updates the count here. The semester in progress: "View
// todos".

const FOOT =
  "flex min-h-9 items-center gap-2 border-hairline border-t px-2 py-1.5 text-xs";
const LINK =
  "ml-auto inline-flex h-7 shrink-0 items-center gap-1 font-medium text-fg underline-offset-2 hover:underline max-md:h-11";

export function ViewSchedule({ termId }: { termId: TermId }) {
  const { doc } = useModel();
  const db = fourYearDb();
  const main = useLiveQuery(db ? termId : null, () =>
    db ? readMainPlan(db, termId) : Promise.resolve(null),
  );
  const linked = main?.plan ?? null;
  const latestTermId = useFourYearFacts((s) => s.latestTermId);
  const { courses } = fourYearColumnFor(doc, termId);
  const term = termLabel(termId);
  // Until Testudo lists the term, there are no sections to pick.
  const listed = latestTermId === null || termId <= latestTermId;
  return (
    <div className={FOOT}>
      {/* Wraps rather than truncating: "From Plan B: 0 of 2 pla…" hid the
          words that say what it counts (QA P3). */}
      <span
        data-testid="linked-plan-count"
        className="tnum flex min-w-0 items-center gap-1.5 text-balance text-muted"
      >
        {main && linked && courses.length > 0 ? (
          <>
            {main.drafts ? <MainPlanMark className="size-1.5" /> : null}
            {placedLine(
              linked.name,
              placedInPlan(courses, linked),
              main.drafts,
            )}
          </>
        ) : null}
      </span>
      {listed ? (
        <WithTooltip
          label={
            linked
              ? `Open ${linked.name}, your main plan for ${term}, in Schedule`
              : `Start a ${term} schedule with this semester's courses`
          }
        >
          <Link
            to="/schedule/courses"
            search={{ term: termId, from: "plan" }}
            onClick={() => crossLinkClicked("plan", "schedule")}
            className={LINK}
          >
            {viewWords("schedule")}
            <ArrowRight aria-hidden="true" className="size-3.5" />
          </Link>
        </WithTooltip>
      ) : (
        <span className="ml-auto shrink-0 text-muted">Not on Testudo yet</span>
      )}
    </div>
  );
}

/** The semester in progress: its deadlines, while Todo is on. */
export function ViewTodos() {
  const todoOn = useAccount((s) => s.flags.todo);
  if (!todoOn) return null;
  return (
    <div className={FOOT}>
      <WithTooltip label="What's due, from ELMS">
        <Link
          to="/todo"
          onClick={() => crossLinkClicked("plan", "todo")}
          className={LINK}
        >
          {viewWords("todo")}
          <ArrowRight aria-hidden="true" className="size-3.5" />
        </Link>
      </WithTooltip>
    </div>
  );
}
