import { useMemo, useState } from "react";
import { PanelLabel } from "~/app/panel";
import type { CatalogIndex } from "~/core/catalog";
import { changesFrom } from "~/core/generate";
import type {
  CourseCode,
  CourseColor,
  GeneratedPlan,
  GenerateRequest,
  GenerateResult,
  Plan,
  SectionKey,
} from "~/core/schema";
import { useUi } from "~/state/ui-store";
import { Button } from "~/ui/button";
import { WithTooltip } from "~/ui/tooltip";
import {
  changesLine,
  daysLine,
  equivalentsTip,
  optionLabel,
  qualityLine,
} from "./labels";
import { MiniWeek, type MiniWeekMark } from "./mini-week";
import { useGenerateRun } from "./run-store";
import { coursesOf, saveResults } from "./save";

// The ranked list (SPEC §3.9, prototype screenshot 08): a mini week, plain
// stats and changes from the open plan per result. Click one to preview it;
// tick several to save them at once.

const PAGE = 50;

export function Results({
  request,
  result,
  index,
  colors,
  plan,
}: {
  request: GenerateRequest;
  result: GenerateResult;
  index: CatalogIndex;
  colors: Readonly<Partial<Record<CourseCode, CourseColor>>>;
  plan: Plan | null;
}) {
  const [shown, setShown] = useState(PAGE);
  const selected = useGenerateRun((s) => s.selected);
  const toggle = useGenerateRun((s) => s.toggleSelected);
  const { results } = result;
  const more = results.length - shown;
  const capped = result.truncated || result.totalFound > results.length;

  const save = () => {
    const picked = results.filter((r) => selected.includes(r.id));
    saveResults(picked, request);
    useGenerateRun.getState().clearSelected();
  };

  return (
    <>
      <PanelLabel
        right={
          capped ? (
            <WithTooltip
              label={`Checked ${result.steps.toLocaleString()} combinations. Add must-haves to narrow it down.`}
            >
              <span className="tnum cursor-default">
                Showing the best {results.length}
              </span>
            </WithTooltip>
          ) : null
        }
      >
        <span className="tnum">
          {results.length === 1 ? "1 plan" : `${results.length} plans`}
        </span>
      </PanelLabel>
      <ul aria-label="Generated plans" className="border-hairline border-t">
        {results.slice(0, shown).map((r, i) => (
          <ResultRow
            key={r.id}
            rank={i + 1}
            result={r}
            request={request}
            index={index}
            colors={colors}
            plan={plan}
            selected={selected.includes(r.id)}
            onToggle={() => toggle(r.id)}
          />
        ))}
      </ul>
      {more > 0 ? (
        <div className="px-4 py-2">
          <WithTooltip label="The list is best first">
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-[12px]"
              onClick={() => setShown((n) => n + PAGE)}
            >
              Show {Math.min(more, PAGE)} more
            </Button>
          </WithTooltip>
        </div>
      ) : null}
      {selected.length > 0 ? (
        <div className="sticky bottom-0 flex items-center gap-2 border-hairline border-t bg-panel px-4 py-2">
          <WithTooltip label="Each becomes a new plan tab. You can undo.">
            <Button size="sm" className="text-[12.5px]" onClick={save}>
              Save{" "}
              {selected.length === 1 ? "1 plan" : `${selected.length} plans`}
            </Button>
          </WithTooltip>
          <WithTooltip label="Untick every plan">
            <Button
              variant="ghost"
              size="sm"
              className="text-[12px]"
              onClick={() => useGenerateRun.getState().clearSelected()}
            >
              Clear
            </Button>
          </WithTooltip>
        </div>
      ) : null}
    </>
  );
}

function ResultRow({
  rank,
  result,
  request,
  index,
  colors,
  plan,
  selected,
  onToggle,
}: {
  rank: number;
  result: GeneratedPlan;
  request: GenerateRequest;
  index: CatalogIndex;
  colors: Readonly<Partial<Record<CourseCode, CourseColor>>>;
  plan: Plan | null;
  selected: boolean;
  onToggle: () => void;
}) {
  const label = optionLabel(rank);
  const changes = useMemo(
    () => (plan ? changesFrom(plan, coursesOf(result, request)) : []),
    [plan, result, request],
  );
  const marks = useMemo(() => {
    const m = new Map<SectionKey, MiniWeekMark>();
    for (const c of changes)
      if (c.kind === "added" || c.kind === "switched" || c.kind === "placed")
        m.set(`${c.courseCode}-${c.to}`, "changed");
    return m;
  }, [changes]);
  const skippedOptional = result.skipped.filter((code) =>
    request.items.some(
      (item) => item.kind === "course" && item.courseCode === code,
    ),
  );

  return (
    <li className="flex items-start gap-2.5 border-hairline border-b py-2.5 pr-4 pl-3 hover:bg-hover">
      <WithTooltip label="Tick several to save them at once" side="right">
        <input
          type="checkbox"
          aria-label={`Select ${label}`}
          checked={selected}
          onChange={onToggle}
          className="mt-5 size-3.5 shrink-0 accent-accent"
        />
      </WithTooltip>
      <WithTooltip label="Preview on the calendar and see details" side="right">
        <button
          type="button"
          aria-label={`${label}: ${daysLine(result.stats)}`}
          onClick={() =>
            useUi
              .getState()
              .drill({ kind: "generated-plan", resultId: result.id })
          }
          className="flex min-w-0 flex-1 gap-3 text-left"
        >
          <div className="h-14 w-[76px] shrink-0">
            <MiniWeek
              sections={result.sections}
              index={index}
              colors={colors}
              marks={marks}
            />
          </div>
          <div className="tnum min-w-0 flex-1 text-[11.5px] leading-[1.45]">
            <div className="flex items-baseline gap-1.5">
              <span className="truncate font-medium text-[12px]">
                {daysLine(result.stats)}
              </span>
              {result.equivalents.count > 1 ? (
                <span
                  title={equivalentsTip(result.equivalents)}
                  className="ml-auto shrink-0 rounded-sm bg-accent-soft px-1 font-mono text-[10.5px] text-muted"
                >
                  ×{result.equivalents.count} equivalent
                </span>
              ) : null}
            </div>
            <div className="truncate text-muted">
              {qualityLine(result.stats)}
            </div>
            <div className="truncate">
              {plan ? changesLine(changes, plan.name) : null}
              {skippedOptional.length > 0 ? (
                <span className="text-muted">
                  {plan ? " · " : ""}leaves out{" "}
                  <span className="font-mono">
                    {skippedOptional.join(", ")}
                  </span>
                </span>
              ) : null}
            </div>
          </div>
        </button>
      </WithTooltip>
    </li>
  );
}
