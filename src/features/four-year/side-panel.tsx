import { cn } from "cn";
import { useMediaQuery } from "~/app/use-media-query";
import {
  CREDITS_GOAL,
  CREDITS_GOAL_TOOLTIP,
  creditsHeadline,
} from "~/core/four-year/credits";
import type { PlanTab } from "~/core/schema";
import { WithTooltip } from "~/ui/tooltip";
import { CoursePanel } from "./course-panel";
import { GenEdPanel } from "./gen-ed-panel";
import { ImportPanel } from "./import-panel";
import { PLAN_WIDE_QUERY, useModel, usePlanNav } from "./model";
import { ProblemsPanel } from "./problems-panel";
import { focusSearch, SearchPanel } from "./search-panel";
import { TemplatePanel } from "./template-panel";

// The side panel (V3 §2.13): credits on top, then the tabs. A course opened
// from a block or a search result replaces the tab's content, with Back.

/** "What Terpsicle doesn't do", always and quietly (V3 §2.1). */
export const UACHIEVE_URL = "https://uachieve.umd.edu/";

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

const TABS: readonly { tab: PlanTab; label: string; tip: string }[] = [
  { tab: "gened", label: "GenEd", tip: "GenEd progress" },
  { tab: "problems", label: "Problems", tip: "Prerequisites and credits" },
  { tab: "search", label: "Search", tip: "Find a course to add" },
  { tab: "templates", label: "Samples", tip: "Start from a sample plan" },
  { tab: "import", label: "Import", tip: "Import your transcript" },
];

export function SidePanel({
  className,
  credits = true,
}: {
  className?: string;
  /** The phone shows credits above the semesters instead. */
  credits?: boolean;
}) {
  const { problems } = useModel();
  const nav = usePlanNav();
  const tab = nav.search.tab ?? "gened";
  const wide = useMediaQuery(PLAN_WIDE_QUERY);
  const course = nav.search.course;
  return (
    <aside
      aria-label="Plan tools"
      className={cn(
        "flex min-h-0 flex-col border border-hairline bg-raised",
        className,
      )}
    >
      {credits ? (
        <div className="border-hairline border-b px-4 py-3">
          <CreditsSummary />
        </div>
      ) : null}
      {/* Plain buttons, not ARIA tabs: each is its own URL state (`?tab=`), a
          stop for Tab like any link, and marked current like one. */}
      <nav aria-label="Panel" className="flex border-hairline border-b">
        {TABS.map((t) => (
          <WithTooltip
            key={t.tab}
            label={t.tip}
            shortcut={t.tab === "search" ? "/" : undefined}
          >
            <button
              type="button"
              aria-current={tab === t.tab && !course ? "true" : undefined}
              onClick={() => {
                nav.go({
                  tab: t.tab === "gened" ? undefined : t.tab,
                  course: undefined,
                });
                if (t.tab === "search") focusSearch();
              }}
              className={cn(
                "-mb-px flex h-11 flex-1 items-center justify-center gap-1.5 border-b-2 text-sm transition-colors md:h-9",
                tab === t.tab && !course
                  ? "border-fg font-medium text-fg"
                  : "border-transparent text-muted hover:text-fg",
              )}
            >
              {t.label}
              {t.tab === "problems" && problems.length > 0 ? (
                <span className="tnum text-muted text-xs">
                  {problems.length}
                </span>
              ) : null}
            </button>
          </WithTooltip>
        ))}
      </nav>
      {/* It scrolls on desktop, and a tab may have nothing focusable to
          scroll to (a GenEd tab with every category covered). On a phone
          the page scrolls instead. */}
      <section
        aria-label={
          course ? `About ${course}` : TABS.find((t) => t.tab === tab)?.tip
        }
        tabIndex={wide ? 0 : undefined}
        className="scroll-thin min-h-0 flex-1 overflow-y-auto outline-none focus-visible:outline-2 focus-visible:outline-fg focus-visible:-outline-offset-2"
      >
        {course ? (
          <CoursePanel code={course} />
        ) : tab === "search" ? (
          <SearchPanel />
        ) : tab === "problems" ? (
          <ProblemsPanel />
        ) : tab === "templates" ? (
          <TemplatePanel />
        ) : tab === "import" ? (
          <ImportPanel />
        ) : (
          <GenEdPanel />
        )}
      </section>
      <p className="border-hairline border-t px-4 py-2 text-muted text-xs">
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
    </aside>
  );
}
