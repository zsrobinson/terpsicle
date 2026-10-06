import { MessageText } from "~/components/message-text";
import {
  ProblemAction,
  ProblemFixButton,
  ProblemList,
  ProblemRow,
  ProblemsClear,
} from "~/components/problem-list";
import { problemCountWords } from "~/core/problems/count-words";
import type { FourYearProblem } from "~/core/schema/four-year";
import { track } from "~/lib/analytics";
import { applyFix } from "./actions";
import { useModel, usePlanNav, useProblemCounts } from "./model";
import { PlanView } from "./views";

// The Problems tab (V3 §2.8): prerequisites out of order, light semesters,
// repeats, codes Testudo doesn't know, courses not offered lately. All of it
// information: nothing blocks a move, nothing turns red. A fix is offered
// only when it makes no new problem, and Undo takes it back. The list, its
// bands and its rows are the scheduler's (~/components/problem-list).

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
    <ProblemRow
      severity={problem.severity}
      testId={`problem-${problem.kind}`}
      title={<MessageText message={problem.title} />}
      openLabel="Show it in your semesters"
      onOpen={() => {
        track("four_year_problem_opened", { kind: problem.kind });
        // The phone shows one semester: switch to the problem's.
        if (term !== undefined) nav.go({ semester: term });
        requestAnimationFrame(() => reveal(problem));
      }}
      detail={<MessageText message={problem.detail} />}
      actions={
        problem.fix || describe || credit ? (
          <>
            {problem.fix ? (
              <ProblemFixButton
                label={problem.fix.label}
                onApply={() => applyFix(doc, problem)}
              />
            ) : null}
            {describe ? (
              <ProblemAction
                tooltip={`Say what ${describe} was: its title, credits, GenEds and what it counts as`}
                onClick={() =>
                  nav.go(
                    { course: describe, credit: undefined },
                    { drill: true },
                  )
                }
              >
                Add course info
              </ProblemAction>
            ) : null}
            {credit ? (
              <ProblemAction
                tooltip={`Say which UMD course ${credit.title} counts as, if any`}
                onClick={() =>
                  nav.go(
                    { credit: credit.id, course: undefined },
                    { drill: true },
                  )
                }
              >
                Choose what it counts as
              </ProblemAction>
            ) : null}
          </>
        ) : null
      }
    />
  );
}

export function ProblemsPanel() {
  const { problems } = useModel();
  if (problems.length === 0)
    return (
      <ProblemsClear>
        Prerequisites out of order, light semesters, repeated courses, courses
        Testudo hasn't offered lately and transfer credit it didn't match show
        up here.
      </ProblemsClear>
    );
  return (
    <ProblemList
      problems={problems}
      row={(problem) => <Row key={problem.id} problem={problem} />}
    />
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
