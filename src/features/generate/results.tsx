import { cn } from "cn";
import { ArrowRight } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ListRow, SectionHeader } from "~/app/panel";
import { openDrill } from "~/app/schedule-nav";
import type { CatalogIndex } from "~/core/catalog";
import {
  chosenCourses,
  differencesFrom,
  freeWeekdays,
  hasChoices,
  type SectionDifference,
} from "~/core/generate/describe";
import {
  activePreferences,
  preferenceLevels,
  preferenceMark,
} from "~/core/generate/preferences";
import { changesFrom } from "~/core/generate/result-plan";
import type {
  CourseCode,
  CourseColor,
  GeneratedPlan,
  GenerateRequest,
  GenerateResult,
  Plan,
  RankFactor,
  SectionKey,
} from "~/core/schema";
import { type PlanPreview, useUi } from "~/state/ui-store";
import { Button } from "~/ui/button";
import { WithTooltip } from "~/ui/tooltip";
import { PREFERENCE_LABELS } from "./chips";
import {
  differenceLabel,
  differenceWhen,
  equivalentsTip,
  filledTip,
  freeDaysLabel,
  optionLabel,
  seatsLabel,
  seatsShortLabel,
  spanLabel,
  unfitWildcardNote,
  wildcardNote,
} from "./labels";
import { MiniWeek, type MiniWeekMark } from "./mini-week";
import { coursesOf, nextPlanNameIn } from "./save";
import { ScoreBar } from "./score-bar";

// The ranked list (SPEC §3.9, prototype screenshot 08). Neighbors often look
// alike, so each row leads with what sets it apart: free days and hours, the
// pick-N and optional courses it includes, and the sections where it differs
// from Option 1. Under that, a mark per preference that's on says why it
// ranks where it does; with none on, stats sit in aligned columns, like a
// Linear list. The arrow opens its details, where it's added as a plan.

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
  termName,
  refreshing = false,
}: {
  request: GenerateRequest;
  result: GenerateResult;
  index: CatalogIndex;
  colors: Readonly<Partial<Record<CourseCode, CourseColor>>>;
  plan: Plan | null;
  termName: string;
  /** A chip changed: these are about to be replaced. */
  refreshing?: boolean;
}) {
  const [shown, setShown] = useState(PAGE);
  const [filter, setFilter] = useState<string | null>(null);
  const { results } = result;
  const top = results[0];
  // The ranking these came from, not the chips' latest: the marks explain
  // this order until the new one lands.
  const ranked = useMemo(
    () => activePreferences(preferenceLevels(request.rankBy)),
    [request.rankBy],
  );
  const nextName = nextPlanNameIn(request.termId);

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
  // Courses the person offered as choices that no plan could fit, so their
  // absence from the filters isn't a mystery.
  const unfit = useMemo(() => {
    const placed = new Set(
      results.flatMap((r) => r.sections.map((k) => k.split("-")[0])),
    );
    return request.items.flatMap((item) =>
      item.kind === "pick"
        ? item.courses
            .map((c) => c.courseCode)
            .filter((code) => !placed.has(code))
        : [],
    );
  }, [results, request.items]);
  // What each wildcard had to choose from, when that needs saying.
  const notes = useMemo(() => {
    const filled = new Set(
      results.flatMap((r) => r.filled.map((f) => f.wildcard)),
    );
    return result.wildcards.flatMap((report) => {
      const note =
        wildcardNote(report, termName) ??
        (filled.has(report.wildcard) ? null : unfitWildcardNote(report));
      return note ? [{ id: report.wildcard, note }] : [];
    });
  }, [results, result.wildcards, termName]);
  const visible =
    filter === null ? rows : rows.filter((r) => r.choiceKey === filter);
  const more = visible.length - shown;

  return (
    <>
      <SectionHeader
        sticky
        title={results.length === 1 ? "1 plan" : `${results.length} plans`}
        right={
          // Only when there were more: the kept best are merged by week, so
          // the count above can be under the cap and "best 200" would jar.
          result.capped || result.truncated ? (
            <WithTooltip
              label={`These are the best ${request.limits.maxResults} of ${result.totalFound.toLocaleString()} combinations${result.truncated ? " found before the search stopped" : ""}, with the same weeks merged. Add filters to narrow them down.`}
            >
              <span className="tnum cursor-default text-muted text-xs">
                Best of {result.totalFound.toLocaleString()}
                {result.truncated ? "+" : ""} combinations
              </span>
            </WithTooltip>
          ) : null
        }
      />
      {choices.length > 0 ? (
        <div
          role="toolbar"
          aria-label="Filter by included courses"
          className="flex flex-wrap items-center gap-1 px-4 pt-2 pb-2"
        >
          <span className="mr-0.5 text-xs text-faint">Includes</span>
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
      {unfit.length > 0 ? (
        <p className="px-4 pt-2 pb-2 text-muted text-sm">
          No plan fits <span className="ident">{unfit.join(", ")}</span> with
          the rest of your courses.
        </p>
      ) : null}
      {notes.map(({ id, note }) => (
        <p
          key={id}
          data-testid="wildcard-note"
          className="px-4 pt-2 pb-2 text-muted text-sm"
        >
          {note}
        </p>
      ))}
      <ul
        aria-label="Generated plans"
        aria-busy={refreshing}
        className={cn(
          "transition-opacity",
          // The last results stay put, dimmed, while a chip's run finishes:
          // the list never blinks empty.
          refreshing && "opacity-60",
          // The bar's own hairline closes it when nothing sits between.
          (choices.length > 0 || unfit.length > 0 || notes.length > 0) &&
            "border-hairline border-t",
        )}
      >
        {visible.slice(0, shown).map((row, i, all) => (
          <ResultRow
            key={row.result.id}
            row={row}
            top={top}
            prev={all[i - 1]?.result}
            showChoices={
              hasChoices(request.items) || result.wildcards.length > 0
            }
            request={request}
            index={index}
            colors={colors}
            plan={plan}
            ranked={ranked}
            nextName={nextName}
          />
        ))}
      </ul>
      {more > 0 ? (
        <div className="px-4 py-2">
          <WithTooltip label="The list is best first">
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-sm"
              onClick={() => setShown((n) => n + PAGE)}
            >
              Show {Math.min(more, PAGE)} more
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
          "flex h-6 items-center gap-1.5 rounded-md border px-2 text-sm",
          active
            ? "border-transparent bg-accent text-accent-fg"
            : "border-hairline-strong text-muted hover:bg-hover hover:text-fg",
        )}
      >
        <span className={cn(mono && "ident")}>{label}</span>
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
  ranked,
  nextName,
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
  /** The preferences the list is ranked by, double ones first. */
  ranked: readonly RankFactor[];
  /** What adding it would name it: "Plan C". */
  nextName: string;
}) {
  const { result, rank, chosen } = row;
  // What the person left open: the pick-N and optional courses it takes,
  // then the course each wildcard took.
  const included = [...chosen, ...result.filled.map((f) => f.courseCode)];
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
  const seats = seatsShortLabel(result.stats);
  const summary = `${freeDaysLabel(free, result.stats)} · ${spanLabel(result.stats)}`;
  const why = ranked.map((f) => ({
    factor: f,
    ...preferenceMark(f, result.breakdown, result.stats),
  }));
  const preview = usePreview(plan, result, request, label);

  return (
    <ListRow
      as="li"
      data-testid="generated-plan"
      // The arrow's click area covers the row (its `after:`), so the whole
      // row opens the details with one button and one tab stop.
      className="relative hover:bg-hover"
      // Like Search (#48): only a mouse previews. A finger's tap opens the
      // result, which previews it anyway.
      onPointerEnter={(e) => {
        if (e.pointerType === "mouse") preview.show();
      }}
      onPointerLeave={preview.hide}
      trail={
        <div className="flex items-center gap-1.5">
          <div className="flex flex-col items-end gap-1">
            <span className="text-faint text-xs">{rank}</span>
            {result.equivalents.count > 1 ? (
              <WithTooltip
                label={equivalentsTip(result.equivalents)}
                side="left"
              >
                <span className="relative z-10 cursor-default rounded-sm bg-accent-soft px-1 text-2xs text-muted">
                  ×{result.equivalents.count}
                </span>
              </WithTooltip>
            ) : null}
          </div>
          {/* Above, not beside: beside it would cover the preview. */}
          <WithTooltip
            label={`See every course and section, then add it as ${nextName}`}
            side="top"
          >
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`${label}: ${summary}${why.length > 0 ? `. ${why.map((w) => `${PREFERENCE_LABELS[w.factor]}: ${w.words}`).join(". ")}` : ""}`}
              onClick={() =>
                openDrill({ kind: "generated-plan", resultId: result.id })
              }
              className="after:absolute after:inset-0 after:content-['']"
            >
              <ArrowRight aria-hidden="true" />
            </Button>
          </WithTooltip>
        </div>
      }
    >
      <div className="grid w-full min-w-0 grid-cols-[76px_minmax(0,1fr)] gap-x-3 text-left">
        <div className="h-14">
          <MiniWeek
            sections={result.sections}
            index={index}
            colors={colors}
            marks={marks}
          />
        </div>
        <div className="tnum min-w-0 text-sm">
          <div className="truncate font-medium text-base">{summary}</div>
          {showChoices ? (
            <div
              className="truncate text-muted"
              title={
                result.filled.length > 0 ? filledTip(result.filled) : undefined
              }
            >
              {included.length ? (
                <>
                  with{" "}
                  <span className="ident text-fg">{included.join(" + ")}</span>
                </>
              ) : (
                "No optional courses"
              )}
            </div>
          ) : null}
          <div
            className="truncate text-muted"
            title={diffs.map(differenceLabel).join(", ") || undefined}
          >
            {rank === 1 ? (
              "Best match"
            ) : diffs.length > 0 ? (
              <>
                {diffs.slice(0, DIFFS_SHOWN).map((d, i) => (
                  <span key={`${d.courseCode}-${d.sectionCode}`}>
                    {i > 0 ? ", " : null}
                    <span className="ident">
                      {d.courseCode} {d.sectionCode}
                    </span>{" "}
                    {differenceWhen(d)}
                  </span>
                ))}
                {diffs.length > DIFFS_SHOWN ? (
                  <span className="text-faint">
                    {" "}
                    +{diffs.length - DIFFS_SHOWN}
                  </span>
                ) : null}
              </>
            ) : (
              "Otherwise as Option 1"
            )}
          </div>
          {why.length > 0 ? (
            // Why it ranks here: a mark per preference, its score as a bar.
            <div
              data-testid="rank-marks"
              className="flex flex-wrap gap-x-3 gap-y-0.5 text-muted text-xs"
            >
              {why.map((w) => (
                <span
                  key={w.factor}
                  title={PREFERENCE_LABELS[w.factor]}
                  className="flex min-w-0 items-center gap-1"
                >
                  <ScoreBar score={w.score} />
                  <span className="truncate">{w.words}</span>
                </span>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-[2rem_3.25rem_minmax(0,1fr)] gap-x-2 text-muted text-xs">
              {/* No reviews or grades: the cell stays empty (and the columns
                  aligned) rather than saying "– GPA". */}
              <span>
                {result.stats.avgRating !== null
                  ? `★ ${result.stats.avgRating.toFixed(1)}`
                  : null}
              </span>
              <span>
                {result.stats.avgGpa !== null
                  ? `${result.stats.avgGpa.toFixed(2)} GPA`
                  : null}
              </span>
              <span
                title={seatsLabel(result.stats) ?? undefined}
                className={cn(
                  "truncate",
                  result.stats.fewestOpenSeats === 0 && "text-warn",
                )}
              >
                {seats ?? `${result.stats.credits} credits`}
              </span>
            </div>
          )}
        </div>
      </div>
    </ListRow>
  );
}

/**
 * A result on the calendar while the mouse is over it (QA S2), as Search
 * previews a course's sections: the same preview its details show, gone
 * when the pointer leaves. It only clears its own, so the details opened by
 * a click keep theirs. Not on focus: Esc from the details hands focus back
 * to the row, and the preview should go away with them.
 */
function usePreview(
  plan: Plan | null,
  result: GeneratedPlan,
  request: GenerateRequest,
  label: string,
) {
  const shown = useRef<PlanPreview | null>(null);
  const hide = () => {
    if (shown.current && useUi.getState().previewPlan === shown.current)
      useUi.getState().setPreviewPlan(null);
    shown.current = null;
  };
  const show = () => {
    if (!plan) return;
    const next: PlanPreview = {
      plan: { ...plan, courses: coursesOf(result, request), name: label },
      label,
    };
    shown.current = next;
    useUi.getState().setPreviewPlan(next);
  };
  // A row that goes away while previewed (Edit, a filter) takes it along.
  // biome-ignore lint/correctness/useExhaustiveDependencies: unmount only
  useEffect(() => hide, []);
  return { show, hide };
}
