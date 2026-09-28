import { Check, Plus, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { create } from "zustand";
import { PanelNote } from "~/components/panel";
import { wildcardDetail, wildcardLabel } from "~/core/catalog/wildcard";
import {
  fourYearSearchInfo,
  searchFourYearCourses,
} from "~/core/four-year/search";
import { fourYearTermLabel } from "~/core/four-year/terms";
import { parsePlaceholder } from "~/core/four-year/wildcards";
import type { CourseSearchRow, Wildcard } from "~/core/schema";
import { type FourYearTerm, WILDCARD_CREDITS } from "~/core/schema/four-year";
import {
  isFiltering,
  NO_FILTERS,
  type SearchFilters,
} from "~/core/search/filters";
import { filterParams, filtersFromParams } from "~/core/search/url";
import { useCourseIndex } from "~/state/course-index-store";
import { useSearchEngine } from "~/state/search-engine";
import { Button } from "~/ui/button";
import {
  COURSE_SEARCH_TIP,
  CourseResultRow,
  CourseSearchField,
} from "~/ui/course-search";
import { FilterChips, type FilterName } from "~/ui/filter-chips";
import { InlineError } from "~/ui/inline-error";
import { ListRow } from "~/ui/list-row";
import { RowSkeleton } from "~/ui/skeleton";
import { WithTooltip } from "~/ui/tooltip";
import {
  addCourse,
  addPlaceholder,
  entryName,
  pickForPlaceholder,
} from "./actions";
import { useModel, usePlanNav } from "./model";
import { showPlanNote } from "./toasts";
import { PlanView } from "./views";
import { showAdded } from "./workbench-store";

// The Search tab (V3 §2.9, §2.13): every course in the course index, any
// term, on the same engine, box, chips and rows as the scheduler's Search
// (~/core/search, ~/ui/course-search). Typing CMSC4XX or "any DSHS", or
// one GenEd chip alone, offers a placeholder first. From a placeholder's
// "Pick a course", results are what can replace it; from the GenEd tab's
// "Find a course", its GenEd's chip is on.

export const SEARCH_INPUT_ID = "plan-search";

/** The chips the course index can answer: it has no sections. */
const PLAN_FILTERS: readonly FilterName[] = ["gen-eds", "credits", "level"];

/**
 * Asks the search box for focus: "Add a course", "Find a course", "Pick a
 * course" and `/` do, and so does opening the tab. Changing the semester
 * from the phone's strip doesn't, so the keyboard doesn't pop up for it.
 */
export const useSearchFocus = create<{
  asked: number;
  /**
   * The last request the box took. A request is taken once: coming back to
   * Search later (Back from Reviews) doesn't bring up a phone's keyboard,
   * and with it the drawer, over the semesters.
   */
  answered: number;
  /** Where Search was opened from, for `four_year_course_added`. */
  via: "search" | "column";
}>()(() => ({ asked: 0, answered: 0, via: "search" }));

export function focusSearch(via: "search" | "column" = "search"): void {
  useSearchFocus.setState((s) => ({ asked: s.asked + 1, via }));
}

/** Enter in the box acts on the highlighted result, else the top one. */
const ENTER = "↵";

const rowId = (index: number) => `plan-search-result-${index}`;

function ResultRow({
  index,
  row,
  action,
  actionLabel,
  onAct,
  addedTo = null,
  active,
  enter,
}: {
  index: number;
  row: CourseSearchRow;
  action: string;
  actionLabel: string;
  onAct: () => void;
  /** The semester it's already in, when that's the one you're adding to: no second copy. */
  addedTo?: FourYearTerm | null;
  /** Highlighted by the arrow keys. */
  active: boolean;
  /** Enter in the box would act on it. */
  enter: boolean;
}) {
  const nav = usePlanNav();
  const { doc } = useModel();
  const [code, title, min, max, genEds] = row;
  // "Added" already names the semester you're adding to.
  const where = doc.entries
    .filter((e) => e.kind === "course" && e.code === code && e.term !== addedTo)
    .map((e) => fourYearTermLabel(e.term));
  return (
    <CourseResultRow
      as="li"
      id={rowId(index)}
      code={code}
      title={title}
      credits={{ min, max }}
      genEds={genEds}
      note={where.length > 0 ? `In ${where.join(", ")}` : undefined}
      state={active ? "previewed" : undefined}
      className="relative hover:bg-hover"
      action={
        addedTo ? (
          <WithTooltip label={`Already in ${fourYearTermLabel(addedTo)}`}>
            <span
              data-testid="plan-search-added"
              className="flex items-center gap-1 text-muted text-sm"
            >
              <Check size={13} aria-hidden="true" />
              Added
              <span className="sr-only"> to {fourYearTermLabel(addedTo)}</span>
            </span>
          </WithTooltip>
        ) : (
          <WithTooltip label={actionLabel} shortcut={enter ? ENTER : undefined}>
            <Button
              variant="outline"
              size="row"
              aria-label={actionLabel}
              // Above the row's About button, which covers the whole row.
              className="relative z-10"
              onClick={onAct}
            >
              {action}
            </Button>
          </WithTooltip>
        )
      }
    >
      {(lines) => (
        <WithTooltip label={`About ${code}`}>
          <button
            type="button"
            onClick={() =>
              nav.go({ course: code, credit: undefined }, { drill: true })
            }
            className="block w-full min-w-0 text-left after:absolute after:inset-0"
          >
            {lines}
          </button>
        </WithTooltip>
      )}
    </CourseResultRow>
  );
}

export function SearchPanel() {
  const { doc, target } = useModel();
  const nav = usePlanNav();
  // The URL keeps the query (`?q=`, replaced as you type) so Back from a
  // course lands on the same results; this mirrors it so typing never waits.
  const urlQuery = nav.search.q ?? "";
  const [query, setQuery] = useState(urlQuery);
  const written = useRef(urlQuery);
  useEffect(() => {
    if (urlQuery === written.current) return;
    written.current = urlQuery;
    setQuery(urlQuery);
  }, [urlQuery]);
  const type = (next: string) => {
    setQuery(next);
    written.current = next;
    nav.go({ q: next === "" ? undefined : next }, { replace: true });
  };
  const { gened, credits, level } = nav.search;
  const filters = useMemo(
    () => filtersFromParams({ gened, credits, level }),
    [gened, credits, level],
  );
  // A chip is a place Back returns from, as in the scheduler's Search.
  const setFilters = (next: SearchFilters) => {
    const { gened, credits, level } = filterParams(next);
    nav.go({ gened, credits, level });
  };
  const input = useRef<HTMLInputElement>(null);
  const rows = useCourseIndex((s) => s.search);
  const state = useCourseIndex((s) => s.searchState);
  const ensure = useCourseIndex((s) => s.ensureSearch);
  const connected = useCourseIndex((s) => s.source !== null);
  const engine = useSearchEngine();
  const info = useMemo(() => (rows ? fourYearSearchInfo(rows) : null), [rows]);

  useEffect(() => {
    if (connected) void ensure();
  }, [connected, ensure]);

  const placeholderEntry = nav.search.wildcard
    ? doc.entries.find((e) => e.id === nav.search.wildcard)
    : undefined;
  const resolving =
    placeholderEntry?.kind === "wildcard" ? placeholderEntry : null;

  const asked = useSearchFocus((s) => s.asked);
  useEffect(() => {
    // On a phone the panel is in the drawer: focus raises it too.
    if (asked <= useSearchFocus.getState().answered) return;
    useSearchFocus.setState({ answered: asked });
    input.current?.focus();
  }, [asked]);

  const result = useMemo(
    () =>
      rows && engine
        ? searchFourYearCourses(engine, rows, query, filters, {
            wildcard: resolving?.wildcard ?? null,
          })
        : null,
    [rows, engine, query, filters, resolving],
  );
  const offer = resolving ? null : placeholderOffer(query, filters);
  const targetName = fourYearTermLabel(target);
  const inTarget = useMemo(
    () =>
      new Set(
        doc.entries.flatMap((e) =>
          e.kind === "course" && e.term === target ? [e.code] : [],
        ),
      ),
    [doc, target],
  );

  // The keyboard's row: the placeholder offer, then the courses.
  const [active, setActive] = useState(-1);
  const first = offer ? 1 : 0;
  const count = first + (result?.rows.length ?? 0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on these inputs only
  useEffect(() => setActive(-1), [query, filters, resolving]);
  useEffect(() => {
    if (active >= 0)
      document.getElementById(rowId(active))?.scrollIntoView?.({
        block: "nearest",
      });
  }, [active]);

  const addOffer = (wildcard: Wildcard) => {
    showAdded(addPlaceholder(doc, wildcard, target));
    type("");
    if (!query.trim()) setFilters(NO_FILTERS);
  };
  const pick = (code: string) => {
    if (!resolving) return;
    void pickForPlaceholder(resolving.id, code);
    nav.go({ wildcard: undefined, q: undefined });
  };
  const add = (code: string) => {
    if (inTarget.has(code))
      return showPlanNote(`${code}'s already in ${targetName}`);
    showAdded(addCourse(doc, code, target, useSearchFocus.getState().via));
  };
  /** Enter: what the row's button does. */
  const actOn = (index: number) => {
    if (offer && index === 0) return addOffer(offer);
    const code = result?.rows[index - first]?.[0];
    if (!code) return;
    if (resolving) return pick(code);
    add(code);
  };
  const enterRow = active >= 0 ? active : 0;
  const activeWords = describeRow(
    active,
    offer,
    result?.rows[active - first],
    resolving ? "picks it" : `adds it to ${targetName}`,
  );

  return (
    <div className="flex flex-col">
      <div className="space-y-2 border-hairline border-b px-4 py-3">
        <CourseSearchField
          inputRef={input}
          id={SEARCH_INPUT_ID}
          query={query}
          onQueryChange={type}
          tokens={
            info
              ? { info, filters, onFiltersChange: (next) => setFilters(next) }
              : undefined
          }
          count={count}
          active={active}
          onActiveChange={setActive}
          onPick={actOn}
          placeholder="Course, title, CMSC4XX or GenEd"
          tooltip={COURSE_SEARCH_TIP.withoutInstructors}
          shortcut={{
            key: "/",
            label: resolving
              ? "Search every course in Testudo from anywhere. Enter picks the top one"
              : "Search every course in Testudo from anywhere. Enter adds the top one",
          }}
        />
        <p className="sr-only" aria-live="polite" aria-atomic="true">
          {activeWords}
        </p>
        {resolving ? null : (
          <FilterChips
            filters={filters}
            onChange={(next) => setFilters(next)}
            show={PLAN_FILTERS}
          />
        )}
        <p className="flex min-h-6 items-center gap-2 text-muted text-sm">
          <span className="min-w-0 flex-1">
            {resolving ? (
              <>
                Picking a course for{" "}
                <span className="ident">{entryName(resolving)}</span> in{" "}
                {fourYearTermLabel(resolving.term)}
              </>
            ) : (
              <>
                Adding to <span className="text-fg">{targetName}</span>. Pick
                another semester's "Add a course" to change it.
              </>
            )}
          </span>
          {resolving ? (
            <WithTooltip label="Search every course">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Search every course"
                onClick={() => nav.go({ wildcard: undefined, q: undefined })}
              >
                <X aria-hidden="true" />
              </Button>
            </WithTooltip>
          ) : null}
        </p>
      </div>

      {offer ? (
        <ListRow
          id={rowId(0)}
          className="border-b"
          state={active === 0 ? "previewed" : undefined}
          action={
            <WithTooltip
              label={`Add it to ${targetName}`}
              shortcut={enterRow === 0 ? ENTER : undefined}
            >
              <Button
                size="row"
                aria-label={`Add ${offer.kind === "pattern" ? offer.pattern : wildcardLabel(offer)} to ${targetName}`}
                onClick={() => addOffer(offer)}
              >
                <Plus aria-hidden="true" />
                Add
              </Button>
            </WithTooltip>
          }
          secondary={
            <span className="block truncate">
              {offer.kind === "pattern"
                ? wildcardLabel(offer)
                : `Any ${wildcardDetail(offer) ?? offer.code} course`}
              , {WILDCARD_CREDITS.default} cr until you pick one
            </span>
          }
        >
          Add a placeholder:{" "}
          <span className="ident font-semibold">
            {offer.kind === "pattern" ? offer.pattern : offer.code}
          </span>
        </ListRow>
      ) : null}

      {state === "error" && !rows ? (
        <InlineError
          className="px-4"
          message="We couldn't load the course list. Check your connection and try again."
          onRetry={() => void ensure()}
          retryTooltip="Load the course list again"
        />
      ) : !result ? (
        <RowSkeleton rows={4} label="Loading the course list" />
      ) : result.total === 0 ? (
        <PanelNote>
          {query.trim() === "" && !resolving && !isFiltering(filters)
            ? "Type a course code or words from its title. CMSC4XX lists a department's 400-levels, and a GenEd like DSHS, a level like 400s or credits like 3cr turns into its filter."
            : resolving
              ? `Nothing in Testudo matches ${entryName(resolving)}${query.trim() ? ` and "${query.trim()}"` : ""}.`
              : offer
                ? null
                : query.trim()
                  ? `Nothing matches "${query.trim()}".`
                  : "Nothing matches these filters. Turn one off to see more."}
        </PanelNote>
      ) : (
        <>
          <div className="flex h-7 items-center gap-2 border-hairline border-b px-4 text-muted text-xs">
            <span className="tnum mr-auto">
              {result.total} {result.total === 1 ? "course" : "courses"}
            </span>
            {isFiltering(filters) && !resolving ? (
              <WithTooltip label="Turn every filter off">
                <button
                  type="button"
                  onClick={() => setFilters(NO_FILTERS)}
                  className="-mr-1.5 flex h-6 items-center gap-1 rounded-md px-1.5 transition-colors hover:bg-hover hover:text-fg"
                >
                  <X size={11} aria-hidden="true" />
                  Clear filters
                </button>
              </WithTooltip>
            ) : null}
          </div>
          <ul aria-label="Courses">
            {result.rows.map((row, i) => {
              const index = first + i;
              return resolving ? (
                <ResultRow
                  key={row[0]}
                  index={index}
                  row={row}
                  action="Pick"
                  actionLabel={`Use ${row[0]} for ${entryName(resolving)}`}
                  onAct={() => pick(row[0])}
                  active={active === index}
                  enter={enterRow === index}
                />
              ) : (
                <ResultRow
                  key={row[0]}
                  index={index}
                  row={row}
                  action="Add"
                  actionLabel={`Add ${row[0]} to ${targetName}`}
                  onAct={() => add(row[0])}
                  addedTo={inTarget.has(row[0]) ? target : null}
                  active={active === index}
                  enter={enterRow === index}
                />
              );
            })}
          </ul>
          {result.total > result.rows.length ? (
            <PanelNote className="tnum text-xs">
              Showing {result.rows.length} of {result.total}. Keep typing to
              narrow it down.
            </PanelNote>
          ) : null}
        </>
      )}
    </div>
  );
}

/**
 * The placeholder a search offers: what's typed ("CMSC4XX", "any DSHS"),
 * or, with nothing typed, one GenEd chip on its own (typing "DSHS " turns
 * it into the chip, and the offer stays).
 */
function placeholderOffer(
  query: string,
  filters: SearchFilters,
): Wildcard | null {
  const parsed = parsePlaceholder(query);
  if (parsed.kind === "wildcard") return parsed.wildcard;
  const [only, ...more] = filters.genEds;
  if (
    query.trim() === "" &&
    only &&
    more.length === 0 &&
    filters.credits.length === 0 &&
    filters.levels.length === 0
  )
    return { kind: "gen-ed", code: only };
  return null;
}

/** What the arrow keys landed on, said aloud: rows here aren't options. */
function describeRow(
  active: number,
  offer: Wildcard | null,
  row: CourseSearchRow | undefined,
  enterDoes: string,
): string {
  if (active < 0) return "";
  if (offer && active === 0)
    return `Placeholder ${offer.kind === "pattern" ? offer.pattern : offer.code}. Enter adds it.`;
  return row ? `${row[0]}, ${row[1]}. Enter ${enterDoes}.` : "";
}

/** The Search view, on its route (`/plan/search`). */
export function SearchView() {
  return (
    <PlanView tab="search">
      <SearchPanel />
    </PlanView>
  );
}
