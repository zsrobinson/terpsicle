import { makeMainPlan, openPlan } from "~/app/actions";
import { planLabel } from "~/app/plan-label";
import { termLabel } from "~/core/catalog/terms";
import { type CurrentPlan, useHasDrafts, useMainPlan } from "~/state/hooks";
import { Button } from "~/ui/button";
import { MainPlanMark } from "~/ui/term-tag";
import { WithTooltip } from "~/ui/tooltip";

// Which plan counts, said in the panel (V2 §5.5). With two or more plans in
// a term, the panel's title says "Main plan" (in Schedule's red) or
// "Draft", and a draft gets one quiet line naming the main plan, with a way
// to make this one main. No banner, and nothing at all with one plan.

/** Whether the plan on screen is one of your drafts, and the term's main plan. */
function useStanding(current: Pick<CurrentPlan, "source" | "plan"> | null) {
  const termId = current?.plan.termId ?? null;
  const main = useMainPlan(termId);
  const drafts = useHasDrafts(termId);
  if (current?.source !== "own" || !drafts || !main) return null;
  return { main, isMain: main.id === current.plan.id };
}

/** The panel's title: the plan's name, with "Main plan" or "Draft" beside it. */
export function PlanHeading({
  current,
}: {
  current: Pick<CurrentPlan, "source" | "plan">;
}) {
  const standing = useStanding(current);
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="truncate">{planLabel(current)}</span>
      {standing?.isMain ? (
        <span className="inline-flex h-[18px] shrink-0 items-center gap-1 border border-product-schedule-line px-1 font-normal text-product-schedule-text text-xs">
          <MainPlanMark className="size-1.5" />
          Main plan
        </span>
      ) : standing ? (
        <span className="inline-flex h-[18px] shrink-0 items-center border border-hairline-strong px-1 font-normal text-muted text-xs">
          Draft
        </span>
      ) : null}
    </span>
  );
}

/** On a draft: "Your main plan for Spring 2027 is Plan A", and Make Plan B main. */
export function DraftLine({
  current,
}: {
  current: Pick<CurrentPlan, "source" | "plan" | "readOnly">;
}) {
  const standing = useStanding(current);
  if (!standing || standing.isMain || current.readOnly) return null;
  const { main } = standing;
  const { plan } = current;
  const term = termLabel(plan.termId);
  return (
    <div
      data-testid="draft-line"
      className="space-y-2.5 border-hairline border-b bg-panel px-4 py-3 text-sm"
    >
      <p className="flex items-start gap-2">
        <MainPlanMark className="mt-1.5" />
        <span>
          Your main plan for {term} is{" "}
          <WithTooltip label={`Open ${main.name}`}>
            <button
              type="button"
              onClick={() => openPlan(plan.termId, main.id)}
              className="font-medium underline underline-offset-2 hover:no-underline"
            >
              {main.name}
            </button>
          </WithTooltip>
          . Chat, Plan, Todo and your calendar use that one.
        </span>
      </p>
      <WithTooltip
        label={`Chat, Plan, Todo and your calendar will use ${plan.name} for ${term}. You can undo this`}
      >
        <Button
          variant="outline"
          size="sm"
          onClick={() => makeMainPlan(plan.id, "panel")}
        >
          Make {plan.name} main
        </Button>
      </WithTooltip>
    </div>
  );
}
