import { cn } from "cn";
import type { ReactNode } from "react";
import { DrillBackBar } from "~/app/workbench/back-bar";
import {
  CREDITS_GOAL,
  CREDITS_GOAL_TOOLTIP,
  creditsHeadline,
} from "~/core/four-year/credits";
import { WithTooltip } from "~/ui/tooltip";
import { CoursePanel } from "./course-panel";
import { useModel, usePlanNav } from "./model";
import { planView } from "./views";

// Plan's sidebar (V3 §2.13), on the workbench: credits on top, then the
// open view's panel (its route), and the note on what Plan doesn't do. A
// course opened from a block or a search result is a drill-in over the
// view, with one Back, as in the scheduler.

/** "What Terpsicle doesn't do", always and quietly (V3 §2.1). */
export const UACHIEVE_URL = "https://uachieve.umd.edu/";

/** The sidebar's content, which the rail's open view controls. */
export const PLAN_SIDEBAR_ID = "plan-sidebar-panel";

export function CreditsSummary() {
  const { totals } = useModel();
  const segments = [
    { key: "earned", value: totals.earned, className: "bg-product-plan" },
    {
      key: "in progress",
      value: totals.inProgress,
      className: "bg-product-plan/60",
    },
    {
      key: "planned",
      value: totals.planned,
      className: "bg-product-plan-soft border border-product-plan/50",
    },
  ];
  const scale = Math.max(CREDITS_GOAL, totals.total);
  return (
    <div className="space-y-1.5">
      <WithTooltip label={CREDITS_GOAL_TOOLTIP}>
        {/* A tooltip on a heading: keyboard people reach it by its tabIndex. */}
        <p
          // biome-ignore lint/a11y/noNoninteractiveTabindex: the tooltip needs a focus stop
          tabIndex={0}
          className="tnum w-fit font-semibold text-lg"
        >
          {creditsHeadline(totals)}
        </p>
      </WithTooltip>
      <div
        aria-hidden="true"
        className="flex h-1.5 w-full overflow-hidden bg-hover"
      >
        {segments.map((s) =>
          s.value > 0 ? (
            <span
              key={s.key}
              className={s.className}
              style={{ width: `${(s.value / scale) * 100}%` }}
            />
          ) : null,
        )}
      </div>
      <p className="tnum text-muted text-sm">
        {totals.earned} earned · {totals.inProgress} in progress ·{" "}
        {totals.planned} planned
      </p>
    </div>
  );
}

/** "What Terpsicle doesn't do": under the sidebar, or the semesters on a phone. */
export function DegreeAuditNote({ className }: { className?: string }) {
  return (
    <p className={cn("text-muted text-xs", className)}>
      Terpsicle doesn't check your major's requirements.{" "}
      <WithTooltip label="UMD's degree audit, in a new tab">
        <a
          href={UACHIEVE_URL}
          target="_blank"
          rel="noreferrer"
          className="text-fg underline underline-offset-2"
        >
          Your degree audit does.
        </a>
      </WithTooltip>
    </p>
  );
}

/**
 * What the sidebar (or the phone drawer) holds. `view` is the open view's
 * route, which a course replaces while it's open. A phone's drawer has no
 * room to pin more than the panel: it shows the credits and the note on
 * the semesters instead (`compact`).
 */
export function PlanSidebarContent({
  view,
  compact = false,
}: {
  view: ReactNode;
  compact?: boolean;
}) {
  const nav = usePlanNav();
  const course = nav.search.course;
  return (
    <div id={PLAN_SIDEBAR_ID} className="flex min-h-0 flex-1 flex-col">
      {compact ? null : (
        <div className="shrink-0 border-hairline border-b px-4 py-3">
          <CreditsSummary />
        </div>
      )}
      {course ? (
        <section
          aria-label={`About ${course}`}
          className="flex min-h-0 flex-1 flex-col"
        >
          <DrillBackBar
            back={{ label: planView(nav.search.tab).label, mono: false }}
            name={course}
            mono
            onBack={() => nav.back({ course: undefined })}
          />
          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
            <CoursePanel code={course} />
          </div>
        </section>
      ) : (
        view
      )}
      {compact ? null : (
        <DegreeAuditNote className="shrink-0 border-hairline border-t px-4 py-2" />
      )}
    </div>
  );
}
