import { CircleCheck, CircleX, Info, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { MessageText } from "~/app/message-text";
import { PanelBody, PanelHeader, PanelLabel } from "~/app/panel";
import {
  type Problem,
  parseSectionKey,
  SEVERITY_ORDER,
  type Severity,
  type Subject,
} from "~/core/schema";
import { useCurrentPlan, usePlanProblems, useTermCatalog } from "~/state/hooks";
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
  const catalog = useTermCatalog(current?.termId ?? null);
  const problems = usePlanProblems();
  const checking = !current || !catalog?.complete;
  const hasPlaced = current?.plan.courses.some((c) => c.sectionCode !== null);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelHeader
        title="Problems"
        sub={
          problems.length > 0
            ? "Everything in this plan that needs a look"
            : current
              ? current.plan.name
              : undefined
        }
      />
      <PanelBody>
        {checking && hasPlaced !== false ? (
          <Checking />
        ) : problems.length === 0 ? (
          <p className="flex items-center gap-2 px-4 py-6 text-[12.5px] text-muted">
            <CircleCheck size={15} className="shrink-0 text-ok" aria-hidden />
            {hasPlaced
              ? "Nothing to fix. This plan works."
              : "Nothing to check yet. Problems show up here as you add courses."}
          </p>
        ) : (
          SEVERITY_ORDER.map((severity) => {
            const group = problems.filter((p) => p.severity === severity);
            if (group.length === 0) return null;
            return (
              <section key={severity} aria-label={GROUP_LABEL[severity]}>
                <PanelLabel
                  right={<span className="tnum">{group.length}</span>}
                >
                  {GROUP_LABEL[severity]}
                </PanelLabel>
                <ul className="divide-y divide-hairline border-hairline border-y">
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
    <li
      className="relative flex gap-3 px-4 py-3 transition-colors hover:bg-hover"
      data-testid={`problem-${problem.kind}`}
    >
      {ICON[problem.severity]}
      <div className="min-w-0 flex-1">
        <WithTooltip label={openLabel(problem.subjects[0])}>
          <button
            type="button"
            onClick={() => openProblem(problem)}
            // The whole row opens the problem; links and the fix sit above it.
            className="block text-left font-medium text-[12.5px] leading-snug after:absolute after:inset-0"
          >
            <MessageText message={problem.title} />
          </button>
        </WithTooltip>
        {problem.detail.length > 0 ? (
          <LinkedMessage
            message={problem.detail}
            className="mt-0.5 block text-[12px] text-muted leading-snug"
          />
        ) : null}
        {fix && !readOnly ? (
          <WithTooltip label={`${fix.label}. You can undo this.`}>
            <Button
              variant="outline"
              size="sm"
              className="relative z-10 mt-2 font-normal text-[12px]"
              onClick={() => applyFix(problem, fix)}
            >
              {fix.label}
            </Button>
          </WithTooltip>
        ) : null}
      </div>
    </li>
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
