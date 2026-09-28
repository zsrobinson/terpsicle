import { cn } from "cn";
import { track } from "~/app/analytics";
import { MessageText } from "~/app/message-text";
import { PanelNote } from "~/app/panel";
import { problemCountWords } from "~/core/problems/count-words";
import type { FourYearProblem } from "~/core/schema/four-year";
import { Button } from "~/ui/button";
import { ListRow } from "~/ui/list-row";
import { WithTooltip } from "~/ui/tooltip";
import { applyFix } from "./actions";
import { useModel, usePlanNav, useProblemCounts } from "./model";
import { PlanView } from "./views";

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
  const entry =
    subject?.kind === "entry"
      ? doc.entries.find((e) => e.id === subject.entryId)
      : undefined;
  const term = subject?.kind === "term" ? subject.term : entry?.term;
  // A code Testudo dropped: its course info is in the course's drill-in.
  const describe =
    problem.kind === "unknown-course" && entry?.kind === "course"
      ? entry.code
      : null;
  // Credit Testudo gave as "CHEM 1XX": what it counts as is in its drill-in.
  const credit =
    problem.kind === "unmatched-credit" && entry?.kind === "credit"
      ? entry
      : null;
  return (
    <ListRow
      as="li"
      align="start"
      // The whole row shows the problem (the title's ::after covers it), as
      // the scheduler's does; the fix sits above that.
      className="relative hover:bg-hover"
      lead={
        // A warning's dot; a note has none (nothing turns red, V3 §2.8).
        <span
          aria-hidden="true"
          className={cn(
            "mt-1.5 block size-1.5",
            problem.severity === "warning" && "bg-warn",
          )}
        />
      }
      secondary={
        <>
          <MessageText message={problem.detail} />
          {problem.fix || describe || credit ? (
            <span className="mt-1.5 flex flex-wrap gap-1.5">
              {problem.fix ? (
                <WithTooltip label="Undo takes it back">
                  <Button
                    variant="outline"
                    size="row"
                    className="relative z-10"
                    onClick={() => applyFix(doc, problem)}
                  >
                    {problem.fix.label}
                  </Button>
                </WithTooltip>
              ) : null}
              {describe ? (
                <WithTooltip
                  label={`Say what ${describe} was: its title, credits, GenEds and what it counts as`}
                >
                  <Button
                    variant={problem.fix ? "ghost" : "outline"}
                    size="row"
                    className="relative z-10"
                    onClick={() =>
                      nav.go(
                        { course: describe, credit: undefined },
                        { drill: true },
                      )
                    }
                  >
                    Add course info
                  </Button>
                </WithTooltip>
              ) : null}
              {credit ? (
                <WithTooltip
                  label={`Say which UMD course ${credit.title} counts as, if any`}
                >
                  <Button
                    variant="outline"
                    size="row"
                    className="relative z-10"
                    onClick={() =>
                      nav.go(
                        { credit: credit.id, course: undefined },
                        { drill: true },
                      )
                    }
                  >
                    Choose what it counts as
                  </Button>
                </WithTooltip>
              ) : null}
            </span>
          ) : null}
        </>
      }
    >
      <WithTooltip label="Show it in your semesters">
        <button
          type="button"
          onClick={() => {
            track("four_year_problem_opened", { kind: problem.kind });
            // The phone shows one semester: switch to the problem's.
            if (term !== undefined) nav.go({ semester: term });
            requestAnimationFrame(() => reveal(problem));
          }}
          className="text-left font-medium after:absolute after:inset-0"
        >
          <MessageText message={problem.title} />
        </button>
      </WithTooltip>
    </ListRow>
  );
}

export function ProblemsPanel() {
  const { problems } = useModel();
  if (problems.length === 0)
    return (
      <PanelNote>
        Prerequisites out of order, light semesters, repeated courses, courses
        Testudo hasn't offered lately and transfer credit it didn't match show
        up here.
      </PanelNote>
    );
  return (
    <ul aria-label="Problems">
      {problems.map((problem) => (
        <Row key={problem.id} problem={problem} />
      ))}
    </ul>
  );
}

/** "1 problem · 2 notes", for the view's header: the bar's words. */
function ProblemsStatusLine() {
  return <>{problemCountWords(useProblemCounts())}</>;
}

/** The Problems view, on its route (`/plan/problems`). */
export function ProblemsView() {
  return (
    <PlanView tab="problems" status={<ProblemsStatusLine />}>
      <ProblemsPanel />
    </PlanView>
  );
}
