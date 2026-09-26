import { Bookmark, Search as SearchIcon, X } from "lucide-react";
import {
  type KeyboardEvent,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { track } from "~/app/analytics";
import { TONE_TEXT } from "~/app/emphasis";
import { EmptyState, ListRow, MetaSep, useFocusRequest } from "~/app/panel";
import type { FitContext } from "~/core/fit";
import type { Course } from "~/core/schema";
import {
  isFiltering,
  NO_FILTERS,
  resultFitWords,
  resultSummary,
  type SearchFilters,
  sectionCountWords,
} from "~/core/search";
import { openCourse } from "~/features/courses/actions";
import { useActiveTerm, useCurrentPlan, useFitContext } from "~/state/hooks";
import { useUi } from "~/state/ui-store";
import { Kbd } from "~/ui/kbd";
import { Skeleton } from "~/ui/skeleton";
import { WithTooltip } from "~/ui/tooltip";
import { FilterChips, type FilterName } from "./filter-chips";
import { useSearchStore, useTermSearch } from "./search-store";
import { useCourseResults } from "./use-course-search";

// The Search tab (SPEC §3.5): a box, one line of filter chips, and a list of
// courses (never sections). Hovering a result shows its sections on the
// calendar; clicking opens its details.

/** Every result row has the same height, so the list can be windowed. */
export const ROW_HEIGHT = 72;
const OVERSCAN = 6;

export function SearchPanel() {
  const { termId } = useActiveTerm();
  const { query, filters } = useTermSearch(termId);
  const setQuery = useSearchStore((s) => s.setQuery);
  const setFilters = useSearchStore((s) => s.setFilters);
  const results = useCourseResults(termId, query, filters);
  const inputRef = useFocusRequest<HTMLInputElement>("search");
  const [active, setActive] = useState(-1);
  const courses = results.status === "ready" ? results.courses : NO_COURSES;

  useSearchAnalytics(query, filters, results);
  // A new query starts the keyboard cursor over.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on these inputs only
  useEffect(() => setActive(-1), [query, filters, termId]);
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

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (courses.length === 0) return;
      event.preventDefault();
      const next =
        event.key === "ArrowDown"
          ? Math.min(courses.length - 1, active + 1)
          : Math.max(0, active - 1);
      setActive(next);
      useUi.getState().setHoverCourse(courses[next]?.code ?? null);
    } else if (event.key === "Enter") {
      event.preventDefault();
      open(active >= 0 ? active : 0);
    }
  };

  if (!termId)
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <ResultsSkeleton />
      </div>
    );

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
        <div className="flex h-9 items-center gap-2 rounded-lg border border-hairline bg-raised px-2.5 focus-within:border-hairline-strong has-[input:focus-visible]:focus-outline">
          <SearchIcon size={14} className="shrink-0 text-muted" aria-hidden />
          <input
            ref={inputRef}
            type="search"
            role="combobox"
            aria-expanded={courses.length > 0}
            aria-controls="search-results"
            aria-activedescendant={
              active >= 0 ? `search-result-${active}` : undefined
            }
            aria-label="Search courses"
            placeholder="Course, title or instructor"
            // Course codes aren't words: no red squiggles or autocorrect.
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            value={query}
            onChange={(e) => setQuery(termId, e.target.value)}
            onKeyDown={onKeyDown}
            onBlur={() => useUi.getState().setHoverCourse(null)}
            className="h-full min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-faint [&::-webkit-search-cancel-button]:hidden"
          />
          {query ? (
            <WithTooltip label="Clear the search">
              <button
                type="button"
                aria-label="Clear the search"
                onClick={() => {
                  setQuery(termId, "");
                  inputRef.current?.focus();
                }}
                className="flex size-5 items-center justify-center rounded text-muted hover:bg-hover hover:text-fg"
              >
                <X size={12} aria-hidden="true" />
              </button>
            </WithTooltip>
          ) : (
            <WithTooltip label="Jump to search from anywhere" shortcut="/">
              <span>
                <Kbd>/</Kbd>
              </span>
            </WithTooltip>
          )}
        </div>
        <FilterChips
          filters={filters}
          onChange={(next) => setFilters(termId, next)}
        />
      </div>
      {results.status === "idle" ? (
        <SearchHints onPick={(q) => setQuery(termId, q)} />
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
          <div className="flex h-7 shrink-0 items-center justify-between gap-2 border-hairline border-b px-4 text-muted text-xs">
            <span className="tnum">
              {courses.length} {courses.length === 1 ? "course" : "courses"}
            </span>
            {isFiltering(filters) ? (
              <WithTooltip label="Turn every filter off">
                <button
                  type="button"
                  onClick={() => setFilters(termId, NO_FILTERS)}
                  className="-mr-1.5 flex h-6 items-center gap-1 rounded-md px-1.5 transition-colors hover:bg-hover hover:text-fg"
                >
                  <X size={11} aria-hidden="true" />
                  Clear filters
                </button>
              </WithTooltip>
            ) : null}
          </div>
          <ResultList
            courses={courses}
            active={active}
            onOpen={open}
            onHover={setActive}
          />
        </>
      )}
    </div>
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
  active,
  onOpen,
  onHover,
}: {
  courses: readonly Course[];
  active: number;
  onOpen: (index: number) => void;
  onHover: (index: number) => void;
}) {
  const fit = useFitContext();
  const plan = useCurrentPlan()?.plan;
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
  active,
  onOpen,
  onHover,
}: {
  index: number;
  course: Course;
  fit: FitContext | null;
  inPlan: "placed" | "bookmarked" | null;
  active: boolean;
  onOpen: () => void;
  onHover: () => void;
}) {
  const genEds = [
    ...new Set(course.genEds.flatMap((g) => g.map((o) => o.code))),
  ];
  const credits =
    course.credits.min === course.credits.max
      ? `${course.credits.min} cr`
      : `${course.credits.min}–${course.credits.max} cr`;
  // No tooltip: hovering a result already explains itself, with the course's
  // sections on the calendar and "Open it to pick one" above them. A tooltip
  // here would cover those ghosts.
  return (
    <ListRow
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
      // lab's open-results on iOS).
      onPointerEnter={(e) => {
        if (e.pointerType === "mouse") onHover();
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
    >
      <div className="flex items-baseline gap-2">
        <span className="ident font-semibold text-base">{course.code}</span>
        <span className="tnum text-muted text-sm">{credits}</span>
        {genEds.slice(0, 3).map((code) => (
          <span
            key={code}
            className="ident rounded border border-hairline px-1 text-2xs text-muted"
          >
            {code}
          </span>
        ))}
      </div>
      <div className="mt-0.5 truncate text-base">{course.title}</div>
      <ResultSummaryLine course={course} fit={fit} />
    </ListRow>
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
  const line = "tnum mt-0.5 truncate text-muted text-sm";
  switch (summary.kind) {
    case "none":
      return <div className={line}>No sections this term</div>;
    case "some":
      return (
        <div className={line}>
          {sectionCountWords(summary.sections, summary.fit)}
        </div>
      );
    case "one": {
      const words = summary.fit ? resultFitWords(summary.fit) : null;
      return (
        <div className={line}>
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
        </div>
      );
    }
  }
}

const EXAMPLES = ["cmsc 351", "statistics", "writing"] as const;

function SearchHints({ onPick }: { onPick: (query: string) => void }) {
  return (
    <EmptyState
      action={
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-faint text-xs">Try</span>
          {EXAMPLES.map((q) => (
            <WithTooltip key={q} label={`Search for "${q}"`}>
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
      Search by course code, title or instructor, or pick a filter to browse.{" "}
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
    </EmptyState>
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
