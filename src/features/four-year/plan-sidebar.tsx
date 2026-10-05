import { cn } from "cn";
import type { ReactNode } from "react";
import { DrillBackBar } from "~/components/workbench/back-bar";
import {
  CREDITS_GOAL,
  CREDITS_GOAL_TOOLTIP,
  creditsHeadline,
} from "~/core/four-year/credits";
import { displayTitle } from "~/core/four-year/display-title";
import { WithTooltip } from "~/ui/tooltip";
import { CoursePanel } from "./course-panel";
import { CreditPanel } from "./credit-panel";
import { CLOSE_DRILL, useModel, usePlanNav } from "./model";
import { planView } from "./views";

// Plan's sidebar (V3 §2.13), on the workbench: the open view's panel (its
// route), starting with its panel header as the scheduler's tabs do, then a
// foot with the credits and the note on what Plan doesn't do. A course
// opened from a block or a search result is a drill-in over the view, with
// one Back, as in the scheduler.

/** "What Terpsicle doesn't do", always and quietly (V3 §2.1). */
export const UACHIEVE_URL = "https://uachieve.umd.edu/";

/** The desktop sidebar, which its resize handle controls. */
export const PLAN_SIDEBAR_FRAME_ID = "plan-sidebar";

/** The sidebar's content, which the rail's open view controls. */
export const PLAN_SIDEBAR_ID = "plan-sidebar-panel";

/**
 * The plan's credits: a headline, a bar and what's earned, in progress and
 * planned. `page` heads a shared plan's page; `foot` sits quietly under the
 * sidebar's view, a step under its panel header (docs/DESIGN.md §7.8).
 */
export function CreditsSummary({ size = "page" }: { size?: "page" | "foot" }) {
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
          className={cn(
            "tnum w-fit",
            size === "page" ? "font-semibold text-lg" : "emph-label text-sm",
          )}
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
      <p
        className={cn(
          "tnum text-muted",
          size === "page" ? "text-sm" : "text-xs",
        )}
      >
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
  const { doc } = useModel();
  const { course, credit } = nav.search;
  const creditEntry = credit
    ? doc.entries.find((e) => e.kind === "credit" && e.id === credit)
    : undefined;
  const back = { label: planView(nav.search.tab).label, mono: false };
  return (
    <div
      id={PLAN_SIDEBAR_ID}
      // The skip link lands here.
      tabIndex={-1}
      className="flex min-h-0 flex-1 flex-col outline-none"
    >
      {course ? (
        <section
          aria-label={`About ${course}`}
          className="flex min-h-0 flex-1 flex-col"
        >
          <DrillBackBar
            back={back}
            name={course}
            mono
            onBack={() => nav.back(CLOSE_DRILL)}
          />
          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
            <CoursePanel code={course} />
          </div>
        </section>
      ) : credit ? (
        <section
          aria-label={
            creditEntry?.kind === "credit"
              ? displayTitle(creditEntry.title)
              : "Credit"
          }
          className="flex min-h-0 flex-1 flex-col"
        >
          <DrillBackBar
            back={back}
            name={
              creditEntry?.kind === "credit"
                ? displayTitle(creditEntry.title)
                : "Credit"
            }
            onBack={() => nav.back(CLOSE_DRILL)}
          />
          <div className="scroll-thin min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
            <CreditPanel entryId={credit} />
          </div>
        </section>
      ) : (
        view
      )}
      {compact ? null : (
        // Under the view, not over it: the view's panel header is the
        // sidebar's one header (QA5: "104 of 120 credits" over "GenEd").
        <div className="shrink-0 space-y-2 border-hairline border-t px-4 py-2">
          <CreditsSummary size="foot" />
          <DegreeAuditNote />
        </div>
      )}
    </div>
  );
}
