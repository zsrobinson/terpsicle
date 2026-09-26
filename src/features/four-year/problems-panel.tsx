import { track } from "~/app/analytics";
import { MessageText } from "~/app/message-text";
import type { FourYearProblem } from "~/core/schema/four-year";
import { Button } from "~/ui/button";
import { WithTooltip } from "~/ui/tooltip";
import { applyFix } from "./actions";
import { useModel, usePlanNav } from "./model";

// The Problems tab (V3 §2.8): prerequisites out of order, light semesters,
// repeats, codes Testudo doesn't know, courses not offered lately. All of it
// information: nothing blocks a move, nothing turns red. A fix is offered
// only when it makes no new problem, and Undo takes it back.

/** Brings a problem's first subject into view: its block, or its semester. */
function reveal(problem: FourYearProblem) {
  const [subject] = problem.subjects;
  if (!subject) return;
  const selector =
    subject.kind === "entry"
      ? `[data-entry-id="${subject.entryId}"]`
      : `[data-term="${subject.term}"]`;
  const element = document.querySelector<HTMLElement>(selector);
  element?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  element?.querySelector<HTMLElement>("button")?.focus({ preventScroll: true });
}

function Row({ problem }: { problem: FourYearProblem }) {
  const { doc } = useModel();
  const nav = usePlanNav();
  const [subject] = problem.subjects;
  const term =
    subject?.kind === "term"
      ? subject.term
      : doc.entries.find((e) => e.id === subject?.entryId)?.term;
  return (
    <li className="space-y-1 border-hairline border-b px-4 py-2">
      <WithTooltip label="Show it in the plan">
        <button
          type="button"
          onClick={() => {
            track("four_year_problem_opened", { kind: problem.kind });
            // The phone shows one semester: switch to the problem's.
            if (term !== undefined)
              nav.go({ semester: term }, { replace: true });
            requestAnimationFrame(() => reveal(problem));
          }}
          className="flex w-full items-start gap-2 text-left font-medium hover:underline"
        >
          {problem.severity === "warning" ? (
            <span
              aria-hidden="true"
              className="mt-1.5 size-1.5 shrink-0 bg-warn"
            />
          ) : null}
          <span>
            <MessageText message={problem.title} />
          </span>
        </button>
      </WithTooltip>
      <p className="text-muted text-sm">
        <MessageText message={problem.detail} />
      </p>
      {problem.fix ? (
        <WithTooltip label="Undo takes it back">
          <Button
            variant="outline"
            size="row"
            className="h-11 md:h-6"
            onClick={() => applyFix(doc, problem)}
          >
            {problem.fix.label}
          </Button>
        </WithTooltip>
      ) : null}
    </li>
  );
}

export function ProblemsPanel() {
  const { problems } = useModel();
  if (problems.length === 0)
    return (
      <div className="space-y-1 px-4 py-4">
        <p>No problems.</p>
        <p className="text-muted text-sm">
          Prerequisites out of order, light semesters, repeated courses and
          courses Testudo hasn't offered lately show up here.
        </p>
      </div>
    );
  return (
    <ul aria-label="Problems">
      {problems.map((problem) => (
        <Row key={problem.id} problem={problem} />
      ))}
    </ul>
  );
}
