import { CircleCheck, CircleX, Info, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { MessageText } from "~/app/message-text";
import {
  EmptyState,
  ListRow,
  PanelBody,
  PanelHeader,
  SectionHeader,
} from "~/app/panel";
import { planLabel } from "~/app/plan-label";
import { countBySeverity, problemCountWords } from "~/core/problems";
import {
  type Problem,
  parseSectionKey,
  SEVERITY_ORDER,
  type Severity,
  type Subject,
} from "~/core/schema";
import { useCurrentPlan, usePlanProblemsState } from "~/state/hooks";
import { Button } from "~/ui/button";
import { Skeleton } from "~/ui/skeleton";
import { WithTooltip } from "~/ui/tooltip";
import { applyFix, openProblem } from "./actions";
import { LinkedMessage } from "./linked-message";

// The Problems tab (SPEC §3.6): everything in the plan that needs a look,
// most serious first. Calm on purpose: no banners, no red boxes. Someone
// weighing two overlapping courses should be able to read this without
// feeling scolded (DESIGN §5).

const GROUP_LABEL: Record<Severity, string> = {
  error: "Won't work as planned",
  warning: "Worth a look",
  info: "Good to know",
};

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
          <EmptyState className="py-6">
            <span className="flex items-center gap-2">
              <CircleCheck size={15} className="shrink-0 text-ok" aria-hidden />
              {hasPlaced
                ? "Nothing to fix. This plan works."
                : "Nothing to check yet. Problems show up here as you add courses."}
            </span>
          </EmptyState>
        ) : (
          SEVERITY_ORDER.map((severity) => {
            const group = problems.filter((p) => p.severity === severity);
            if (group.length === 0) return null;
            const first = severity === problems[0]?.severity;
            return (
              <section key={severity} aria-label={GROUP_LABEL[severity]}>
                <SectionHeader
                  sticky
                  title={GROUP_LABEL[severity]}
                  count={group.length}
                  // The panel header's hairline is right above the first bar.
                  className={first ? "border-t-0" : undefined}
                />
                <ul>
                  {group.map((p) => (
                    <ProblemRow
                      key={p.id}
                      problem={p}
                      readOnly={current?.readOnly ?? true}
                    />
                  ))}
                </ul>
              </section>
            );
          })
        )}
      </PanelBody>
    </div>
  );
}

const ICON = {
  error: (
    <CircleX size={15} className="mt-px shrink-0 text-error" aria-hidden />
  ),
  warning: (
    <TriangleAlert size={15} className="mt-px shrink-0 text-warn" aria-hidden />
  ),
  info: <Info size={15} className="mt-px shrink-0 text-muted" aria-hidden />,
} as const satisfies Record<Severity, ReactNode>;

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

function ProblemRow({
  problem,
  readOnly,
}: {
  problem: Problem;
  readOnly: boolean;
}) {
  const { fix } = problem;
  return (
    <ListRow
      as="li"
      // The whole row opens the problem (the button's ::after covers it);
      // links and the fix sit above that.
      className="relative items-start py-3 hover:bg-hover"
      data-testid={`problem-${problem.kind}`}
      lead={ICON[problem.severity]}
    >
      <WithTooltip label={openLabel(problem.subjects[0])}>
        <button
          type="button"
          onClick={() => openProblem(problem)}
          className="block text-left font-medium text-base after:absolute after:inset-0"
        >
          <MessageText message={problem.title} />
        </button>
      </WithTooltip>
      {problem.detail.length > 0 ? (
        <LinkedMessage
          message={problem.detail}
          className="mt-0.5 block text-muted text-sm"
        />
      ) : null}
      {fix && !readOnly ? (
        <WithTooltip label={`${fix.label}. You can undo this.`}>
          <Button
            variant="outline"
            size="row"
            className="relative z-10 mt-2"
            onClick={() => applyFix(problem, fix)}
          >
            {fix.label}
          </Button>
        </WithTooltip>
      ) : null}
    </ListRow>
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
