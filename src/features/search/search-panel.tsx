import { Bookmark, ChevronDown, X } from "lucide-react";
import {
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { MetaSep, PanelNote } from "~/components/panel";
import type { FitContext } from "~/core/fit";
import type { Course, DeptCode, TermId } from "~/core/schema";
// Not the ~/core/search barrel: it carries the text index, which loads
// on its own (~/state/search-engine).
import {
  isFiltering,
  NO_FILTERS,
  type SearchFilters,
} from "~/core/search/filters";
import {
  bestInstructorRating,
  openSeatTotal,
  ratedDepartments,
  type SearchSort,
} from "~/core/search/sort";
import {
  resultFitWords,
  resultSummary,
  sectionCountWords,
} from "~/core/search/summary";
import { readFilterToken, withFilterToken } from "~/core/search/tokens";
import { openCourse } from "~/features/courses/actions";
import { useFocusRequest } from "~/features/schedule/focus-request";
import { track } from "~/lib/analytics";
import { TONE_TEXT } from "~/lib/emphasis";
import { useLoadedPlanetTerp } from "~/state/data-hooks";

import {
  useActiveTerm,
  useCurrentPlan,
  useFitContext,
  useTermCatalog,
} from "~/state/hooks";
import { useUi } from "~/state/ui-store";
import {
  COURSE_SEARCH_TIP,
  CourseResultRow,
  CourseSearchField,
} from "~/ui/course-search";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItemText,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "~/ui/dropdown-menu";
import { FilterChips, type FilterName, TOKEN_CHIP } from "~/ui/filter-chips";
import { Skeleton } from "~/ui/skeleton";
import { WithTooltip } from "~/ui/tooltip";
import { useTermSearch } from "./search-store";
import {
  pickFilters,
  pickSort,
  typeQuery,
  useSearchFromUrl,
} from "./search-url";
import { useCourseResults, useSearchInfo } from "./use-course-search";

// The Search tab (SPEC §3.5): a box, one line of filter chips, and a list of
// courses (never sections). Hovering a result shows its sections on the
// calendar; clicking opens its details. The box and rows are the kit's
// course search (~/ui/course-search), the same as Plan's and Generate's.

/** Every result row has the same height, so the list can be windowed. */
export const ROW_HEIGHT = 72;
const OVERSCAN = 6;

export function SearchPanel() {
  const { termId } = useActiveTerm();
  useSearchFromUrl(termId);
  const { query, filters, sort } = useTermSearch(termId);
  const setQuery = typeQuery;
  const setFilters = pickFilters;
  const results = useCourseResults(termId, query, filters, sort);
  const info = useSearchInfo(termId);
  const inputRef = useFocusRequest<HTMLInputElement>("search");
  const [active, setActive] = useState(-1);
  const courses = results.status === "ready" ? results.courses : NO_COURSES;

  useSearchAnalytics(query, filters, results);
  // A new query starts the keyboard cursor over.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on these inputs only
  useEffect(() => setActive(-1), [query, filters, sort, termId]);
  // The hovered result's ghosts shouldn't outlive the panel being on screen.
  useEffect(() => () => useUi.getState().setHoverCourse(null), []);
  // Nor the result: typing narrows the list under a resting pointer, and the
  // row it was over is gone without a pointerleave.
  useEffect(() => {
    const { hoverCourse, setHoverCourse } = useUi.getState();
    if (hoverCourse && !courses.some((c) => c.code === hoverCourse))
      setHoverCourse(null);
  }, [courses]);

  const open = (index: number) => {
    const course = courses[index];
    if (!course) return;
    useUi.getState().setHoverCourse(null);
    track("search_result_opened", { position: index });
    openCourse(course.code);
  };

  if (!termId)
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <ResultsSkeleton />
      </div>
    );

  const changeFilters = (
    next: SearchFilters,
    filter: FilterName | null,
    via: "chip" | "typed",
  ) => {
    if (filter) track("search_filter_changed", { filter, via });
    setFilters(termId, next);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* The box is the header here (as in the prototype); screen readers still get a title. */}
      <h2 className="sr-only">Search</h2>
      <ResultCount
        count={
          results.status === "ready" && courses.length > 0
            ? courses.length
            : null
        }
      />
      <div className="flex shrink-0 flex-col gap-2 border-hairline border-b px-4 py-3">
        <CourseSearchField
          inputRef={inputRef}
          query={query}
          onQueryChange={(next) => setQuery(termId, next)}
          tokens={
            info
              ? {
                  info,
                  filters,
                  onFiltersChange: (next, kind) =>
                    changeFilters(
                      next,
                      kind ? TOKEN_CHIP[kind] : null,
                      "typed",
                    ),
                }
              : undefined
          }
          count={courses.length}
          active={active}
          onActiveChange={(next) => {
            setActive(next);
            useUi.getState().setHoverCourse(courses[next]?.code ?? null);
          }}
          onPick={open}
          combobox={{
            listId: "search-results",
            optionId: (i) => `search-result-${i}`,
          }}
          placeholder="Course, title, instructor or GenEd"
          tooltip={COURSE_SEARCH_TIP.withInstructors}
          shortcut={{ key: "/", label: "Jump to search from anywhere" }}
          onBlur={() => useUi.getState().setHoverCourse(null)}
        />
        <FilterChips
          filters={filters}
          onChange={(next, name) => changeFilters(next, name, "chip")}
        />
      </div>
      {results.status === "idle" ? (
        <SearchHints
          onPick={(q) => {
            // "DSNS" is a filter: it goes on as its chip, as if typed.
            const token = info ? readFilterToken(q, info) : null;
            if (token)
              changeFilters(
                withFilterToken(filters, token),
                TOKEN_CHIP[token.kind],
                "typed",
              );
            else setQuery(termId, q);
          }}
        />
      ) : results.status === "loading" ? (
        <ResultsSkeleton />
      ) : courses.length === 0 ? (
        <NoResults
          query={query}
          filters={filters}
          onClearFilter={(next) => setFilters(termId, next)}
        />
      ) : (
        <>
          {/* Always there with results, so the list never jumps when a filter goes on. */}
          <div className="flex h-7 shrink-0 items-center gap-2 border-hairline border-b px-4 text-muted text-xs">
            <span className="tnum mr-auto">
              {courses.length} {courses.length === 1 ? "course" : "courses"}
            </span>
            {isFiltering(filters) ? (
              <WithTooltip label="Turn every filter off">
                <button
                  type="button"
                  onClick={() => setFilters(termId, NO_FILTERS)}
                  className="flex h-6 items-center gap-1 rounded-md px-1.5 transition-colors hover:bg-hover hover:text-fg"
                >
                  <X size={11} aria-hidden="true" />
                  Clear filters
                </button>
              </WithTooltip>
            ) : null}
            <SortMenu
              termId={termId}
              sort={sort}
              courses={courses}
              onSort={(next) => {
                track("search_sorted", { sort: next });
                pickSort(termId, next);
              }}
            />
          </div>
          <ResultList
            courses={courses}
            sort={sort}
            active={active}
            onOpen={open}
            onHover={setActive}
          />
        </>
      )}
    </div>
  );
}

const SORT_NAMES: Record<SearchSort, string> = {
  relevance: "Best match",
  code: "Course code",
  rating: "Instructor rating",
  seats: "Open seats",
};

/** Ratings by department, from whatever PlanetTerp files are loaded. */
function usePlanetTerp() {
  const loaded = useLoadedPlanetTerp();
  return useMemo(() => (dept: DeptCode) => loaded.get(dept), [loaded]);
}

/**
 * The results' order. Only data already here: the seats file, and ratings
 * for departments whose PlanetTerp file is loaded (it loads when you open
 * one of their courses). Each option says when it's missing some, in words
 * rather than a tooltip: menu options have none (decisions.md), and a
 * phone can't hover.
 */
function SortMenu({
  termId,
  sort,
  courses,
  onSort,
}: {
  termId: TermId;
  sort: SearchSort;
  courses: readonly Course[];
  onSort: (sort: SearchSort) => void;
}) {
  const planetTerp = usePlanetTerp();
  const seatsLoaded = useTermCatalog(termId)?.seats != null;
  const rated = ratedDepartments(courses, planetTerp);
  const ratingHint =
    rated.total === 0 || rated.loaded === rated.total
      ? null
      : rated.loaded === 0
        ? "Ratings load as you open courses"
        : `Ratings for ${rated.loaded} of ${rated.total} departments so far`;
  const hints: Record<SearchSort, string | null> = {
    relevance: null,
    code: null,
    rating: ratingHint,
    seats: seatsLoaded ? null : "Seats are still loading",
  };
  return (
    <DropdownMenu>
      <WithTooltip label="Sort the results">
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Sort: ${SORT_NAMES[sort]}`}
            className="-mr-1.5 flex h-6 items-center gap-1 rounded-md px-1.5 transition-colors hover:bg-hover hover:text-fg data-[state=open]:bg-hover data-[state=open]:text-fg"
          >
            Sort: {SORT_NAMES[sort]}
            <ChevronDown size={10} aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
      </WithTooltip>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Sort by</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={sort}
          onValueChange={(v) => onSort(v as SearchSort)}
        >
          {(Object.keys(SORT_NAMES) as SearchSort[]).map((s) => (
            <DropdownMenuRadioItem key={s} value={s}>
              <DropdownMenuItemText
                label={SORT_NAMES[s]}
                hint={hints[s] ?? undefined}
              />
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
const NO_COURSES: readonly Course[] = [];

/**
 * "12 courses", said politely once typing settles, for screen readers (no
 * results has its own message). Always mounted, so the live region exists
 * before its text changes.
 */
function ResultCount({ count }: { count: number | null }) {
  const [said, setSaid] = useState("");
  useEffect(() => {
    const text =
      count === null ? "" : `${count} ${count === 1 ? "course" : "courses"}`;
    const timer = setTimeout(() => setSaid(text), 600);
    return () => clearTimeout(timer);
  }, [count]);
  return (
    <p className="sr-only" aria-live="polite" aria-atomic="true">
      {said}
    </p>
  );
}

/** `search_performed` once typing settles; the query's length only. */
function useSearchAnalytics(
  query: string,
  filters: SearchFilters,
  results: ReturnType<typeof useCourseResults>,
) {
  const count = results.status === "ready" ? results.courses.length : null;
  useEffect(() => {
    if (count === null) return;
    const timer = setTimeout(
      () =>
        track("search_performed", {
          queryLength: query.trim().length,
          results: count,
          filtered: isFiltering(filters),
        }),
      800,
    );
    return () => clearTimeout(timer);
  }, [query, filters, count]);
}

function ResultList({
  courses,
  sort,
  active,
  onOpen,
  onHover,
}: {
  courses: readonly Course[];
  sort: SearchSort;
  active: number;
  onOpen: (index: number) => void;
  onHover: (index: number) => void;
}) {
  const fit = useFitContext();
  const plan = useCurrentPlan()?.plan;
  const planetTerp = usePlanetTerp();
  const seats = useTermCatalog(useActiveTerm().termId)?.seats?.seats ?? null;
  /** Sorted by rating or seats, each row says its number. */
  const sortNote = (course: Course): ReactNode => {
    if (sort === "rating") {
      const rating = bestInstructorRating(course, planetTerp);
      return rating === null ? null : `★ ${rating.toFixed(1)}`;
    }
    if (sort === "seats") {
      const open = openSeatTotal(course, seats);
      return open === null ? null : `${open} open`;
    }
    return null;
  };
  // Placed or bookmarked, by course: what each result's trail says.
  const inPlan = useMemo(
    () =>
      new Map(
        plan?.courses.map((c) => [
          c.courseCode,
          c.sectionCode === null
            ? ("bookmarked" as const)
            : ("placed" as const),
        ]) ?? [],
      ),
    [plan],
  );
  const ref = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ top: 0, height: 800 });
  const setHoverCourse = useUi((s) => s.setHoverCourse);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () =>
      setView({ top: el.scrollTop, height: el.clientHeight || 800 });
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Keep the keyboard's row on screen.
  useEffect(() => {
    const el = ref.current;
    if (!el || active < 0) return;
    const top = active * ROW_HEIGHT;
    if (top < el.scrollTop) el.scrollTop = top;
    else if (top + ROW_HEIGHT > el.scrollTop + el.clientHeight)
      el.scrollTop = top + ROW_HEIGHT - el.clientHeight;
  }, [active]);

  const first = Math.max(0, Math.floor(view.top / ROW_HEIGHT) - OVERSCAN);
  const last = Math.min(
    courses.length,
    Math.ceil((view.top + view.height) / ROW_HEIGHT) + OVERSCAN,
  );

  return (
    <div
      ref={ref}
      id="search-results"
      role="listbox"
      aria-label={`${courses.length} ${courses.length === 1 ? "course" : "courses"}`}
      className="scroll-thin relative min-h-0 flex-1 overflow-y-auto overscroll-y-contain"
      onScroll={(e) =>
        setView({
          top: e.currentTarget.scrollTop,
          height: e.currentTarget.clientHeight || 800,
        })
      }
      onPointerLeave={() => setHoverCourse(null)}
    >
      <div style={{ height: courses.length * ROW_HEIGHT }} className="relative">
        {courses.slice(first, last).map((course, i) => {
          const index = first + i;
          return (
            <ResultRow
              key={course.code}
              index={index}
              course={course}
              fit={fit}
              inPlan={inPlan.get(course.code) ?? null}
              sortNote={sortNote(course)}
              active={index === active}
              onOpen={() => onOpen(index)}
              onHover={() => {
                onHover(index);
                setHoverCourse(course.code);
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

function ResultRow({
  index,
  course,
  fit,
  inPlan,
  sortNote,
  active,
  onOpen,
  onHover,
}: {
  index: number;
  course: Course;
  fit: FitContext | null;
  inPlan: "placed" | "bookmarked" | null;
  /** What the list is sorted by, for this course ("★ 4.6", "12 open"). */
  sortNote: ReactNode;
  active: boolean;
  onOpen: () => void;
  onHover: () => void;
}) {
  const genEds = [
    ...new Set(course.genEds.flatMap((g) => g.map((o) => o.code))),
  ];
  // No tooltip: hovering a result already explains itself, with the course's
  // sections on the calendar and "Open it to pick one" above them. A tooltip
  // here would cover those ghosts.
  return (
    <CourseResultRow
      code={course.code}
      title={course.title}
      credits={course.credits}
      genEds={genEds}
      note={sortNote}
      meta={<ResultSummaryLine course={course} fit={fit} />}
      id={`search-result-${index}`}
      role="option"
      aria-selected={active}
      tabIndex={-1}
      data-course-result={course.code}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen();
      }}
      // Only a mouse previews. A finger's tap would preview too, on touch
      // down, and iOS Safari takes content that appears under a tap for a
      // hover menu and drops the click: the result didn't open (the mobile
      // lab's open-results on iOS). And only a mouse that moves: results
      // appearing under a resting pointer (where "Search for a course"
      // was) would otherwise take the cursor, and Enter would open that row
      // instead of the top one (QA2).
      onPointerMove={(e) => {
        if (e.pointerType === "mouse" && !active) onHover();
      }}
      state={active ? "previewed" : undefined}
      className="absolute inset-x-0 cursor-pointer hover:bg-hover"
      style={{ top: index * ROW_HEIGHT, height: ROW_HEIGHT }}
      trail={
        inPlan === "placed" ? (
          <span className="text-muted text-xs">In plan</span>
        ) : inPlan === "bookmarked" ? (
          <span className="flex items-center gap-1 text-muted text-xs">
            <Bookmark size={11} fill="currentColor" aria-hidden />
            Bookmarked
          </span>
        ) : undefined
      }
    />
  );
}

/**
 * The third line, by section count (DESIGN §5): one section is the class,
 * so say when it meets and whether it fits; more say how many fit.
 */
function ResultSummaryLine({
  course,
  fit,
}: {
  course: Course;
  fit: FitContext | null;
}) {
  const summary = resultSummary(course, fit);
  switch (summary.kind) {
    case "none":
      return "No sections this term";
    case "some":
      return sectionCountWords(summary.sections, summary.fit);
    case "one": {
      const words = summary.fit ? resultFitWords(summary.fit) : null;
      return (
        <>
          {summary.when}
          {words && summary.fit ? (
            <>
              <MetaSep />
              <span
                className={
                  summary.fit.kind === "fits" ? TONE_TEXT.ok : TONE_TEXT.warn
                }
              >
                {words}
              </span>
            </>
          ) : null}
        </>
      );
    }
  }
}

const EXAMPLES = ["cmsc 351", "statistics", "cmsc4xx", "DSNS"] as const;

function SearchHints({ onPick }: { onPick: (query: string) => void }) {
  return (
    <PanelNote
      action={
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-faint text-xs">Try</span>
          {EXAMPLES.map((q) => (
            <WithTooltip
              key={q}
              label={
                q === "DSNS"
                  ? "Only courses that count for DSNS (Natural Sciences)"
                  : `Search for "${q}"`
              }
            >
              <button
                type="button"
                onClick={() => onPick(q)}
                className="rounded-md border border-hairline px-1.5 py-0.5 text-fg text-sm transition-colors hover:bg-hover"
              >
                {q}
              </button>
            </WithTooltip>
          ))}
        </div>
      }
    >
      Search by course code, title or instructor, or pick a filter to browse.
      CMSC4XX lists a department's 400-levels, and a GenEd like DSNS, a level
      like 400s or credits like 3cr turns into its filter.{" "}
      {/* Only a mouse previews (#48): a finger's tap opens the course. */}
      <span className="pointer-coarse:hidden" data-testid="search-hint-hover">
        Hover a result to see its sections on the calendar.
      </span>
      <span
        className="hidden pointer-coarse:inline"
        data-testid="search-hint-tap"
      >
        Tap a result to open it and see its sections.
      </span>
    </PanelNote>
  );
}

const FILTER_WORDS: Record<FilterName, string> = {
  "gen-eds": "the Gen-eds filter",
  credits: "the Credits filter",
  fits: "Fits my plan",
  "open-seats": "Open seats",
  level: "the Level filter",
};

function activeFilters(filters: SearchFilters): FilterName[] {
  const on: FilterName[] = [];
  if (filters.genEds.length) on.push("gen-eds");
  if (filters.credits.length) on.push("credits");
  if (filters.fitsMyPlan) on.push("fits");
  if (filters.openSeats) on.push("open-seats");
  if (filters.levels.length) on.push("level");
  return on;
}

function without(filters: SearchFilters, name: FilterName): SearchFilters {
  switch (name) {
    case "gen-eds":
      return { ...filters, genEds: [] };
    case "credits":
      return { ...filters, credits: [] };
    case "fits":
      return { ...filters, fitsMyPlan: false };
    case "open-seats":
      return { ...filters, openSeats: false };
    case "level":
      return { ...filters, levels: [] };
  }
}

/** Says what to change: "No courses match "xyz" with Fits my plan on. Turn it off?" */
function NoResults({
  query,
  filters,
  onClearFilter,
}: {
  query: string;
  filters: SearchFilters;
  onClearFilter: (next: SearchFilters) => void;
}) {
  const on = activeFilters(filters);
  const q = query.trim();
  const what = q ? `No courses match "${q}"` : "No courses match these filters";
  const only = on.length === 1 ? on[0] : undefined;
  return (
    <div className="px-4 py-3 text-base" role="status">
      <p>
        {what}
        {q && only ? ` with ${FILTER_WORDS[only]} on.` : "."}
      </p>
      {only && q ? (
        <WithTooltip label={`Search again without ${FILTER_WORDS[only]}`}>
          <button
            type="button"
            onClick={() => onClearFilter(without(filters, only))}
            className="mt-1 text-muted text-sm underline underline-offset-2 hover:text-fg"
          >
            Turn it off
          </button>
        </WithTooltip>
      ) : on.length > 1 && q ? (
        <WithTooltip label="Search again with every filter off">
          <button
            type="button"
            onClick={() => onClearFilter(NO_FILTERS)}
            className="mt-1 text-muted text-sm underline underline-offset-2 hover:text-fg"
          >
            Turn the filters off
          </button>
        </WithTooltip>
      ) : (
        <p className="mt-1 text-muted text-sm">
          {q
            ? "Check the spelling, or try the course code (like CMSC351) or an instructor's last name."
            : "Turn a filter off to see more."}
        </p>
      )}
    </div>
  );
}

function ResultsSkeleton() {
  return (
    <div className="flex flex-col" data-testid="search-loading">
      {[0.62, 0.74, 0.55].map((w) => (
        <div
          key={w}
          className="flex flex-col gap-2 border-hairline border-b px-4 py-3"
        >
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3" style={{ width: `${w * 100}%` }} />
          <Skeleton className="h-2.5 w-1/3" />
        </div>
      ))}
    </div>
  );
}
