import { Link } from "@tanstack/react-router";
import { BellRing } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { termLabel } from "~/core/catalog/terms";
import {
  type OpenWatch,
  openWatches,
  planLine,
  seatsOpenWords,
} from "~/core/home";
import { mainPlanFor } from "~/core/plans/main-plan";
import {
  countBySeverity,
  planProblems,
  problemCountWords,
  withWatches,
} from "~/core/problems";
import type { Plan, SeatWatch, TermId } from "~/core/schema";
import { type CampusMap, EMPTY_CAMPUS } from "~/core/travel";
import { useAccount } from "~/features/auth/account-store";
import { api } from "~/server/fns/api";
import { ListRow } from "~/ui/list-row";
import { Skeleton } from "~/ui/skeleton";
import { TermTag } from "~/ui/term-tag";
import { WithTooltip } from "~/ui/tooltip";
import { loadPlanCatalog, type PlanCatalog } from "./data";
import type { HomeLocal } from "./local";
import {
  HomeNote,
  HomeSection,
  HomeSkeleton,
  homeLinkClicked,
  ROW_LINK,
} from "./section";

// "Schedule" (docs/V3.md §1.5): the term you're registering for (Next), its
// main plan in a line, its problems as the scheduler counts them, and your
// seat watches there that have a seat open now. The plan shows at once;
// the count fills in once the plan's departments and the seats load.

export function ScheduleSection({
  local,
  next,
  campus,
}: {
  local: HomeLocal | null;
  next: TermId | null;
  campus: CampusMap | null;
}) {
  const plan =
    local && next ? mainPlanFor(next, local.plans, local.mainPlans) : null;
  return (
    <HomeSection
      product="schedule"
      title={next ? termLabel(next) : "Next semester"}
      to="/schedule"
      search={plan ? { term: plan.termId, planId: plan.id } : undefined}
      tooltip={plan ? `Open ${plan.name} in Schedule` : "Plan your classes"}
    >
      {local === null ? (
        <HomeSkeleton rows={1} label="Loading your plan" />
      ) : next === null ? (
        <HomeNote>Next semester's classes aren't listed yet.</HomeNote>
      ) : plan === null ? (
        <HomeNote>
          No plan for {termLabel(next)} yet. Start one in Schedule when you're
          ready to register.
        </HomeNote>
      ) : (
        <PlanRows plan={plan} local={local} campus={campus} />
      )}
    </HomeSection>
  );
}

function PlanRows({
  plan,
  local,
  campus,
}: {
  plan: Plan;
  local: HomeLocal;
  campus: CampusMap | null;
}) {
  const catalog = usePlanCatalog(plan);
  const watches = useSeatWatches(plan.termId);
  const words = useMemo(() => {
    if (!catalog) return null;
    const problems = planProblems({
      plan,
      index: catalog.index,
      blocks: local.blocks.filter((b) => b.termId === plan.termId),
      travel: local.travel,
      campus: campus ?? EMPTY_CAMPUS,
      seats: catalog.seats?.seats ?? null,
      changes: catalog.changes?.changes ?? [],
      pendingDepts: catalog.pendingDepts,
    });
    const watched = new Set((watches ?? []).map((w) => w.sectionKey));
    return problemCountWords(countBySeverity(withWatches(problems, watched)));
  }, [catalog, plan, local, campus, watches]);
  const opened = useMemo(
    () =>
      catalog && watches
        ? openWatches(watches, plan.termId, catalog.seats?.seats ?? null)
        : [],
    [catalog, watches, plan.termId],
  );

  return (
    <ul aria-label={`${plan.name}, ${termLabel(plan.termId)}`}>
      <ListRow
        as="li"
        className="relative px-0 hover:bg-hover"
        secondary={planLine(plan)}
        trail={
          catalog === undefined ? (
            <Skeleton className="h-3 w-20" />
          ) : words ? (
            <span className="text-fg">{words}</span>
          ) : null
        }
      >
        <WithTooltip label={`See ${plan.name}'s problems`}>
          <Link
            to="/schedule/problems"
            search={{ term: plan.termId, planId: plan.id }}
            onClick={() => homeLinkClicked("schedule")}
            className={ROW_LINK}
          >
            <span className="flex items-center gap-1.5 font-medium">
              {plan.name}
              <TermTag tag="next" />
            </span>
          </Link>
        </WithTooltip>
      </ListRow>
      {opened.map((w) => (
        <OpenWatchRow key={`${w.courseCode}-${w.sectionCode}`} w={w} />
      ))}
    </ul>
  );
}

function OpenWatchRow({ w }: { w: OpenWatch }) {
  return (
    <ListRow
      as="li"
      className="relative px-0 hover:bg-hover"
      lead={<BellRing size={14} aria-hidden="true" className="text-muted" />}
      trail={<span className="text-fg">{seatsOpenWords(w.open)}</span>}
    >
      <WithTooltip label={`Open ${w.courseCode} in Schedule`}>
        <Link
          to="/schedule/course/$code"
          params={{ code: w.courseCode }}
          search={{ term: w.termId }}
          onClick={() => homeLinkClicked("schedule")}
          className={ROW_LINK}
        >
          <span className="ident font-semibold">{w.courseCode}</span>{" "}
          <span className="ident">{w.sectionCode}</span>
          <span className="sr-only">: a section you're watching</span>
        </Link>
      </WithTooltip>
    </ListRow>
  );
}

/** undefined while loading, null when it can't be read. */
function usePlanCatalog(plan: Plan): PlanCatalog | null | undefined {
  const [catalog, setCatalog] = useState<PlanCatalog | null | undefined>();
  const depts = [...new Set(plan.courses.map((c) => c.courseCode))]
    .sort()
    .join(",");
  // biome-ignore lint/correctness/useExhaustiveDependencies: the plan's courses (`depts`) and term decide what loads, not the object
  useEffect(() => {
    let live = true;
    void loadPlanCatalog(plan.termId, plan)
      .catch(() => null)
      .then((next) => {
        if (live) setCatalog(next);
      });
    return () => {
      live = false;
    };
  }, [plan.termId, depts]);
  return catalog;
}

/** Your seat watches in a term, signed in and while seat alerts are on; null otherwise. */
function useSeatWatches(termId: TermId): readonly SeatWatch[] | null {
  const on = useAccount((s) => s.status === "signed-in" && s.flags.seatAlerts);
  const [watches, setWatches] = useState<readonly SeatWatch[] | null>(null);
  useEffect(() => {
    if (!on) return;
    let live = true;
    api.alerts
      .list({ termId })
      .then((result) => {
        if (live && result.status === "ok") setWatches(result.watches);
      })
      .catch(() => {
        // Offline: the plan's line stands without them.
      });
    return () => {
      live = false;
    };
  }, [on, termId]);
  return on ? watches : null;
}
