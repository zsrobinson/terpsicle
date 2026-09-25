import { cn } from "cn";
import { useMemo, useState } from "react";
import { PanelLabel } from "~/app/panel";
import type { CatalogIndex } from "~/core/catalog";
import {
  changesFrom,
  chosenCourses,
  differencesFrom,
  freeWeekdays,
  hasChoices,
  type SectionDifference,
} from "~/core/generate";
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
  differenceLabel,
  equivalentsTip,
  freeDaysLabel,
  optionLabel,
  seatsLabel,
  spanLabel,
} from "./labels";
import { MiniWeek, type MiniWeekMark } from "./mini-week";
import { useGenerateRun } from "./run-store";
import { coursesOf, saveResults } from "./save";

// The ranked list (SPEC §3.9, prototype screenshot 08). Neighbors often look
// alike, so each row leads with what sets it apart: free days and hours, the
// pick-N and optional courses it includes, and the sections where it differs
// from Option 1. Stats sit in aligned columns underneath, like a Linear list.

const PAGE = 50;
/** Sections named per row before "+2 more". */
const DIFFS_SHOWN = 1;
const NONE = "none";

type Row = {
  result: GeneratedPlan;
  rank: number;
  chosen: CourseCode[];
  /** The filter this row falls under: its chosen courses, or NONE. */
  choiceKey: string;
};

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
  const [filter, setFilter] = useState<string | null>(null);
  const selected = useGenerateRun((s) => s.selected);
  const toggle = useGenerateRun((s) => s.toggleSelected);
  const { results } = result;
  const top = results[0];

  const rows = useMemo(
    (): Row[] =>
      results.map((r, i) => {
        const chosen = chosenCourses(r, request.items);
        return {
          result: r,
          rank: i + 1,
          chosen,
          choiceKey: chosen.length ? chosen.join(" + ") : NONE,
        };
      }),
    [results, request.items],
  );
  // "Includes" filters: one per combination of pick-N and optional courses
  // the results take, when there's more than one.
  const choices = useMemo(() => {
    if (!hasChoices(request.items)) return [];
    const counts = new Map<string, number>();
    for (const row of rows)
      counts.set(row.choiceKey, (counts.get(row.choiceKey) ?? 0) + 1);
    return counts.size > 1 ? [...counts] : [];
  }, [rows, request.items]);
  const visible =
    filter === null ? rows : rows.filter((r) => r.choiceKey === filter);
  const more = visible.length - shown;

  const save = () => {
    const picked = results.filter((r) => selected.includes(r.id));
    saveResults(picked, request);
    useGenerateRun.getState().clearSelected();
  };

  return (
    <>
      <PanelLabel
        right={
          result.capped || result.truncated ? (
            <WithTooltip
              label={`${result.totalFound.toLocaleString()} combinations fit${result.truncated ? " before the search stopped" : ""}. Add must-haves to narrow them down.`}
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
      {choices.length > 0 ? (
        <div
          role="toolbar"
          aria-label="Filter by included courses"
          className="flex flex-wrap items-center gap-1 px-4 pb-2"
        >
          <span className="mr-0.5 text-[11px] text-faint">Includes</span>
          <FilterChip
            label="All"
            count={rows.length}
            active={filter === null}
            tip="Show every plan"
            onClick={() => setFilter(null)}
          />
          {choices.map(([key, count]) => (
            <FilterChip
              key={key}
              label={key === NONE ? "None" : key}
              mono={key !== NONE}
              count={count}
              active={filter === key}
              tip={
                key === NONE
                  ? "Only plans without the optional courses"
                  : `Only plans with ${key}`
              }
              onClick={() => setFilter(filter === key ? null : key)}
            />
          ))}
        </div>
      ) : null}
      <ul aria-label="Generated plans" className="border-hairline border-t">
        {visible.slice(0, shown).map((row, i, all) => (
          <ResultRow
            key={row.result.id}
            row={row}
            top={top}
            prev={all[i - 1]?.result}
            showChoices={hasChoices(request.items)}
            request={request}
            index={index}
            colors={colors}
            plan={plan}
            selected={selected.includes(row.result.id)}
            onToggle={() => toggle(row.result.id)}
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
        <div className="sticky bottom-0 z-10 flex items-center gap-2 border-hairline border-t bg-bg px-4 py-2">
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

/** Differences the row above doesn't share first, so neighbors read apart. */
function byNeighbor(
  diffs: SectionDifference[],
  prev: GeneratedPlan | undefined,
): SectionDifference[] {
  if (!prev) return diffs;
  const shared = (d: SectionDifference) =>
    prev.sections.includes(`${d.courseCode}-${d.sectionCode}`) ? 1 : 0;
  return [...diffs].sort((a, b) => shared(a) - shared(b));
}

function FilterChip({
  label,
  count,
  active,
  mono,
  tip,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  mono?: boolean;
  tip: string;
  onClick: () => void;
}) {
  return (
    <WithTooltip label={tip}>
      <button
        type="button"
        aria-pressed={active}
        onClick={onClick}
        className={cn(
          "flex h-6 items-center gap-1.5 rounded-md border px-2 text-[11.5px]",
          active
            ? "border-transparent bg-accent text-accent-fg"
            : "border-hairline-strong text-muted hover:bg-hover hover:text-fg",
        )}
      >
        <span className={cn(mono && "font-mono")}>{label}</span>
        <span className={cn("tnum", active ? "opacity-70" : "text-faint")}>
          {count}
        </span>
      </button>
    </WithTooltip>
  );
}

function ResultRow({
  row,
  top,
  prev,
  showChoices,
  request,
  index,
  colors,
  plan,
  selected,
  onToggle,
}: {
  row: Row;
  top: GeneratedPlan | undefined;
  /** The row above, whose differences come last: they don't tell the two apart. */
  prev: GeneratedPlan | undefined;
  showChoices: boolean;
  request: GenerateRequest;
  index: CatalogIndex;
  colors: Readonly<Partial<Record<CourseCode, CourseColor>>>;
  plan: Plan | null;
  selected: boolean;
  onToggle: () => void;
}) {
  const { result, rank, chosen } = row;
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
  const free = freeWeekdays(result, index);
  const diffs =
    top && rank > 1
      ? byNeighbor(differencesFrom(result, top, index), prev)
      : [];
  const seats = seatsLabel(result.stats);
  const summary = `${freeDaysLabel(free, result.stats)} · ${spanLabel(result.stats)}`;

  return (
    <li
      data-testid="generated-plan"
      className="flex items-start gap-2.5 border-hairline border-b py-2 pr-4 pl-3 hover:bg-hover"
    >
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
          aria-label={`${label}: ${summary}`}
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
                {summary}
              </span>
              <span className="ml-auto flex shrink-0 items-baseline gap-1.5">
                {result.equivalents.count > 1 ? (
                  <span
                    title={equivalentsTip(result.equivalents)}
                    className="rounded-sm bg-accent-soft px-1 font-mono text-[10.5px] text-muted"
                  >
                    ×{result.equivalents.count}
                  </span>
                ) : null}
                <span className="text-[10.5px] text-faint">{rank}</span>
              </span>
            </div>
            {showChoices ? (
              <div className="truncate">
                {chosen.length ? (
                  <>
                    <span className="text-muted">with </span>
                    <span className="font-mono text-[11px]">
                      {chosen.join(" + ")}
                    </span>
                  </>
                ) : (
                  <span className="text-muted">No optional courses</span>
                )}
              </div>
            ) : null}
            <div className="truncate font-mono text-[11px] text-muted">
              {rank === 1 ? (
                <span className="font-sans text-[11.5px]">Best match</span>
              ) : diffs.length > 0 ? (
                <>
                  {diffs.slice(0, DIFFS_SHOWN).map(differenceLabel).join(", ")}
                  {diffs.length > DIFFS_SHOWN ? (
                    <span className="text-faint">
                      {" "}
                      +{diffs.length - DIFFS_SHOWN}
                    </span>
                  ) : null}
                </>
              ) : (
                <span className="font-sans text-[11.5px]">
                  Otherwise as Option 1
                </span>
              )}
            </div>
            <div className="grid grid-cols-[2.25rem_3.5rem_1fr] gap-x-1.5 text-[11px] text-muted">
              <span>
                {result.stats.avgRating !== null
                  ? `★ ${result.stats.avgRating.toFixed(1)}`
                  : "★ –"}
              </span>
              <span>
                {result.stats.avgGpa !== null
                  ? `${result.stats.avgGpa.toFixed(2)} GPA`
                  : "– GPA"}
              </span>
              <span
                className={cn(
                  "truncate",
                  result.stats.fewestOpenSeats === 0 && "text-warn",
                )}
              >
                {seats ?? `${result.stats.credits} credits`}
              </span>
            </div>
          </div>
        </button>
      </WithTooltip>
    </li>
  );
}
