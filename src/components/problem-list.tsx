import { CircleCheck, CircleX, Info, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
// The schema's own module, not the barrel: Plan reads this without the
// scheduler's problem detection.
import { SEVERITY_ORDER, type Severity } from "~/core/schema/problems";
import { Button } from "~/ui/button";
import { ListRow } from "~/ui/list-row";
import { WithTooltip } from "~/ui/tooltip";
import { PanelNote, SectionHeader } from "./panel";

// One problem list for Schedule's Problems tab and Plan's Problems view
// (docs/COHESION.md, "same job, same look, same place, same word"). Most
// serious first, under the same three bands. Each row has its severity's
// mark, then its title, which opens what it's about. Under the title are the
// detail, anything the product adds (Plan's offering strip) and one line of
// row buttons: the fix first, then any other way to act. Calm on purpose:
// no banners and no red boxes (DESIGN §5). Errors and warnings are problems;
// info items are notes ("2 problems · 1 note", `problemCountWords`).

/** The bands' words, in both products: CONTEXT.md, "Problem". */
export const PROBLEM_GROUP_LABEL: Record<Severity, string> = {
  error: "Won't work as planned",
  warning: "Worth a look",
  info: "Good to know",
};

const MARK = {
  error: (
    <CircleX size={15} className="mt-px shrink-0 text-error" aria-hidden />
  ),
  warning: (
    <TriangleAlert size={15} className="mt-px shrink-0 text-warn" aria-hidden />
  ),
  info: <Info size={15} className="mt-px shrink-0 text-muted" aria-hidden />,
} as const satisfies Record<Severity, ReactNode>;

/**
 * The problems grouped by severity, a band over each group with its count.
 * `row` draws one problem as a `ProblemRow`.
 */
export function ProblemList<P extends { id: string; severity: Severity }>({
  problems,
  row,
}: {
  problems: readonly P[];
  row: (problem: P) => ReactNode;
}) {
  return SEVERITY_ORDER.map((severity) => {
    const group = problems.filter((p) => p.severity === severity);
    if (group.length === 0) return null;
    return (
      <section key={severity} aria-label={PROBLEM_GROUP_LABEL[severity]}>
        <SectionHeader
          sticky
          title={PROBLEM_GROUP_LABEL[severity]}
          count={group.length}
        />
        <ul>{group.map(row)}</ul>
      </section>
    );
  });
}

/**
 * One problem. The whole row opens it (the title button's ::after covers
 * the row); the detail's links and the actions sit above that.
 */
export function ProblemRow({
  severity,
  title,
  openLabel,
  onOpen,
  detail,
  extra,
  actions,
  testId,
}: {
  severity: Severity;
  /** Its title, as plain text (`MessageText`): it's inside a button. */
  title: ReactNode;
  /** The title's tooltip: what opening it shows ("Open CMSC351"). */
  openLabel: string;
  onOpen: () => void;
  detail?: ReactNode;
  /** Anything a product adds under the detail (Plan's offering strip). */
  extra?: ReactNode;
  /** `ProblemFixButton` first, then `ProblemAction`s or another row button. */
  actions?: ReactNode;
  testId?: string;
}) {
  return (
    <ListRow
      as="li"
      align="start"
      className="relative py-3 hover:bg-hover"
      data-testid={testId}
      lead={MARK[severity]}
    >
      <WithTooltip label={openLabel}>
        <button
          type="button"
          onClick={onOpen}
          className="block text-left font-medium text-base after:absolute after:inset-0"
        >
          {title}
        </button>
      </WithTooltip>
      {detail ? (
        <div className="emph-secondary mt-0.5 text-sm">{detail}</div>
      ) : null}
      {extra ? <div className="relative z-10 mt-1.5">{extra}</div> : null}
      {actions ? (
        <div className="relative z-10 mt-2 flex flex-wrap items-center gap-1.5">
          {actions}
        </div>
      ) : null}
    </ListRow>
  );
}

/** A problem's one-click fix ("Switch to 0205"), with Undo. */
export function ProblemFixButton({
  label,
  onApply,
}: {
  label: string;
  onApply: () => void;
}) {
  return (
    <ProblemAction tooltip={`${label}. You can undo this.`} onClick={onApply}>
      {label}
    </ProblemAction>
  );
}

/** Another way to act on a problem: "Add course info". */
export function ProblemAction({
  tooltip,
  onClick,
  children,
}: {
  tooltip: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <WithTooltip label={tooltip}>
      <Button variant="outline" size="row" onClick={onClick}>
        {children}
      </Button>
    </WithTooltip>
  );
}

/** What the list says with nothing in it: a check, and a line or two. */
export function ProblemsClear({ children }: { children: ReactNode }) {
  return (
    <PanelNote className="py-6">
      <span className="flex items-start gap-2">
        <CircleCheck size={15} className="mt-px shrink-0 text-ok" aria-hidden />
        <span>{children}</span>
      </span>
    </PanelNote>
  );
}
