import { Link } from "@tanstack/react-router";
import { crossLinkClicked, viewWords } from "~/app/cross-link";
import { termLabel } from "~/core/catalog/terms";
import {
  missingFromPlan,
  missingLine,
  placeholderLine,
} from "~/core/four-year/handoff";
import type { Plan } from "~/core/schema";
import { useAccount } from "~/features/auth/account-store";
import {
  fourYearLinkDb,
  readFourYearColumn,
  useLiveQuery,
} from "~/state/four-year-link";
import { useActiveTerm } from "~/state/hooks";
import { WithTooltip } from "~/ui/tooltip";
import { addFromFourYear } from "./handoff";

// The Courses tab's quiet line about the four-year plan (docs/V3.md §1.2,
// §2.12): what the term's column has that this plan doesn't, with one "Add
// them"; its placeholders, which can't be bookmarked; and "View plan". Only
// for someone with a four-year plan in this browser, or once Plan is listed.

export function FourYearLine({ plan }: { plan: Plan }) {
  const { termId } = plan;
  const column = useLiveQuery(termId, () =>
    readFourYearColumn(fourYearLinkDb(), termId),
  );
  const planListed = useAccount((s) => s.flags.plan);
  // A term Testudo has dropped is history: the plan is what happened, so
  // there's nothing to add, only the way back to Plan.
  const archived = useActiveTerm().term?.status === "archived";
  if (!column || (!column.hasDoc && !planListed)) return null;
  const missing = archived ? [] : missingFromPlan(column.courses, plan);
  const placeholders = archived ? [] : column.placeholders;
  const term = termLabel(termId);
  return (
    <div
      data-testid="four-year-line"
      className="space-y-1.5 border-hairline border-t px-4 py-3 text-muted text-sm"
    >
      {missing.length > 0 ? (
        <p>
          {missingLine(missing)}{" "}
          <WithTooltip
            label={`Bookmark ${missing.length === 1 ? "it" : "them"} in ${plan.name}. You can undo this`}
          >
            <button
              type="button"
              onClick={() => addFromFourYear(plan.id, missing)}
              className="font-medium text-fg underline underline-offset-2 hover:no-underline"
            >
              {missing.length === 1 ? "Add it" : "Add them"}
            </button>
          </WithTooltip>
        </p>
      ) : null}
      {placeholders.length > 0 ? <p>{placeholderLine(placeholders)}</p> : null}
      <p>
        <WithTooltip label={`${term} in your four-year plan`}>
          <Link
            to="/plan"
            search={{ semester: termId }}
            onClick={() => crossLinkClicked("schedule", "plan")}
            className="inline-flex min-h-11 items-center text-muted underline underline-offset-2 hover:text-fg md:min-h-0"
          >
            {viewWords("plan")}
          </Link>
        </WithTooltip>
      </p>
    </div>
  );
}
