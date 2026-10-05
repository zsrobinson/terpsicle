import { MessageText } from "~/components/message-text";
import { PanelBody, PanelHeader } from "~/components/panel";
import {
  ProblemFixButton,
  ProblemList,
  ProblemRow,
  ProblemsClear,
} from "~/components/problem-list";
import { countBySeverity, problemCountWords } from "~/core/problems";
import {
  type Problem,
  type ProblemFix,
  parseSectionKey,
  type Subject,
  type TermId,
} from "~/core/schema";
import { SeatBell } from "~/features/course-details/seat-bell";
import { planLabel } from "~/features/schedule/plan-label";
import { useCurrentPlan, usePlanProblemsState } from "~/state/hooks";
import { Skeleton } from "~/ui/skeleton";
import { applyFix, openProblem } from "./actions";
import { LinkedMessage } from "./linked-message";

// The Problems tab (SPEC §3.6): everything in the plan that needs a look,
// most serious first, in the list Plan's Problems view shares
// (~/components/problem-list). Calm on purpose: no banners, no red boxes.
// Someone weighing two overlapping courses should be able to read this
// without feeling scolded (DESIGN §5).

export function ProblemsPanel() {
  const current = useCurrentPlan();
  const { problems, checking } = usePlanProblemsState();
  const hasPlaced = current?.plan.courses.some((c) => c.sectionCode !== null);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelHeader
        title="Problems"
        sub={
          // The top bar's words exactly: "2 problems · 1 note".
          problems.length > 0
            ? problemCountWords(countBySeverity(problems))
            : current
              ? planLabel(current)
              : undefined
        }
      />
      <PanelBody>
        {(checking || !current) && hasPlaced !== false ? (
          <Checking />
        ) : problems.length === 0 ? (
          <ProblemsClear>
            {hasPlaced
              ? "Nothing to fix. This plan works."
              : "Nothing to check yet. Problems show up here as you add courses."}
          </ProblemsClear>
        ) : (
          <ProblemList
            problems={problems}
            row={(p) => (
              <Row
                key={p.id}
                problem={p}
                termId={current?.termId ?? null}
                readOnly={current?.readOnly ?? true}
              />
            )}
          />
        )}
      </PanelBody>
    </div>
  );
}

function openLabel(subject: Subject | undefined): string {
  switch (subject?.kind) {
    case "course":
      return `Open ${subject.courseCode}`;
    case "section":
      return `Open ${parseSectionKey(subject.sectionKey)?.courseCode ?? "the course"}`;
    case "connection":
      return "Open this connection";
    case "block":
      return "Open Blocks";
    default:
      return "Open";
  }
}

function Row({
  problem,
  termId,
  readOnly,
}: {
  problem: Problem;
  termId: TermId | null;
  readOnly: boolean;
}) {
  const { fix } = problem;
  return (
    <ProblemRow
      severity={problem.severity}
      testId={`problem-${problem.kind}`}
      title={<MessageText message={problem.title} />}
      openLabel={openLabel(problem.subjects[0])}
      onOpen={() => openProblem(problem)}
      detail={
        problem.detail.length > 0 ? (
          <LinkedMessage message={problem.detail} />
        ) : null
      }
      actions={
        fix && !readOnly ? (
          <FixButton problem={problem} fix={fix} termId={termId} />
        ) : null
      }
    />
  );
}

/**
 * A problem's one-click fix. A full section's is the seat watch itself:
 * "Watch for a seat", then "Watching" with a filled bell, the same bell as
 * on its row in course details.
 */
function FixButton({
  problem,
  fix,
  termId,
}: {
  problem: Problem;
  fix: ProblemFix;
  termId: TermId | null;
}) {
  if (fix.kind === "watch")
    return termId ? (
      <SeatBell termId={termId} sectionKey={fix.sectionKey} variant="button" />
    ) : null;
  return (
    <ProblemFixButton
      label={fix.label}
      onApply={() => applyFix(problem, fix)}
    />
  );
}

function Checking() {
  return (
    <div
      role="status"
      aria-label="Checking your plan"
      className="flex flex-col"
    >
      {[0.7, 0.55].map((w) => (
        <div key={w} className="flex gap-3 border-hairline border-b px-4 py-3">
          <Skeleton className="size-4 rounded-full" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-3" style={{ width: `${w * 100}%` }} />
            <Skeleton className="h-2.5 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}
