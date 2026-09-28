import { cn } from "cn";
import { type Ref, useId, useMemo, useState } from "react";
import {
  type CatalogIndex,
  noMatchesMessage,
  wildcardCourses,
  wildcardDetail,
  wildcardId,
  wildcardLabel,
} from "~/core/catalog";
import type { Course, CourseCode, Wildcard } from "~/core/schema";
import {
  type CourseSearch,
  courseFilter,
  createCourseSearch,
  NO_FILTERS,
  parseCourseQuery,
  queryCourses,
  queryFilters,
  suggestWildcards,
  type WildcardSearchInfo,
  wildcardSearchInfo,
} from "~/core/search";
import { CourseResultRow, CourseSearchField } from "~/ui/course-search";
import { ListRow } from "~/ui/list-row";

// Type a code or title words, pick from the suggestions: the kit's course
// search box and rows (~/ui/course-search), with the engine every course
// search uses, so "intro psych", "cmsc4xx" and "DSHS" find what they find
// in Search. Generate has no filter chips, so a GenEd stays in the box and
// narrows the courses, as it does before it becomes a chip elsewhere. The
// search index is built once per catalog, the first time someone types
// here. Where the field takes wildcards, "CMSC4XX" or "DSHS" suggests
// itself first, and a department ("CMSC", "CMSC4") suggests its pattern
// last.

const searches = new WeakMap<CatalogIndex, CourseSearch>();
function searchFor(index: CatalogIndex): CourseSearch {
  let search = searches.get(index);
  if (!search) {
    search = createCourseSearch(index.courses.values());
    searches.set(index, search);
  }
  return search;
}

const infos = new WeakMap<CatalogIndex, WildcardSearchInfo>();
function infoFor(index: CatalogIndex): WildcardSearchInfo {
  let info = infos.get(index);
  if (!info) {
    info = wildcardSearchInfo(index.courses.values());
    infos.set(index, info);
  }
  return info;
}

const MAX_SUGGESTIONS = 6;

type Suggestion =
  | { kind: "course"; key: string; course: Course }
  | {
      kind: "wildcard";
      key: string;
      wildcard: Wildcard;
      /** "History and Social Sciences · 16 courses", or why it can't be added. */
      detail: string | null;
      /** The whole term has loaded and nothing matches. */
      empty: boolean;
    };

const courses = (n: number) => (n === 1 ? "1 course" : `${n} courses`);

export type WildcardSupport = {
  onAdd: (wildcard: Wildcard) => void;
  /** The whole term has loaded, so counts are real. */
  complete: boolean;
  termName: string;
};

export function CourseField({
  index,
  exclude,
  onAdd,
  wildcards,
  placeholder,
  label,
  inputRef,
}: {
  index: CatalogIndex | undefined;
  /** Courses already listed; not suggested again. */
  exclude: ReadonlySet<CourseCode>;
  onAdd: (courseCode: CourseCode) => void;
  /** Offer wildcards too ("CMSC4XX", "DSHS"). */
  wildcards?: WildcardSupport;
  placeholder: string;
  label: string;
  inputRef?: Ref<HTMLInputElement>;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const listId = useId();
  const takesWildcards = wildcards !== undefined;
  const complete = wildcards?.complete ?? false;
  const termName = wildcards?.termName ?? "This term";

  const { suggestions, hint } = useMemo((): {
    suggestions: Suggestion[];
    hint: string | null;
  } => {
    if (!index || query.trim() === "") return { suggestions: [], hint: null };
    const info = infoFor(index);
    const found = takesWildcards
      ? suggestWildcards(query, info)
      : { exact: null, related: null, hint: null };
    const wildcardRow = (wildcard: Wildcard): Suggestion => {
      const n = wildcardCourses(index.courses.values(), wildcard, {
        exclude,
      }).length;
      // Until the whole term loads, a count would be too low.
      const empty = complete && n === 0;
      const detail = empty
        ? noMatchesMessage(wildcard, termName)
        : [wildcardDetail(wildcard), complete ? courses(n) : null]
            .filter(Boolean)
            .join(" · ") || null;
      return {
        kind: "wildcard",
        key: wildcardId(wildcard),
        wildcard,
        detail,
        empty,
      };
    };
    const room =
      MAX_SUGGESTIONS - (found.exact ? 1 : 0) - (found.related ? 1 : 0);
    const parsed = parseCourseQuery(query, info);
    const keep = courseFilter(queryFilters(NO_FILTERS, parsed), {
      seats: null,
      fit: null,
    });
    const matches = queryCourses(
      searchFor(index),
      parsed,
      (code) => index.courses.get(code),
      (course) => !exclude.has(course.code) && keep(course),
    )
      .slice(0, room)
      .map(
        (course): Suggestion => ({ kind: "course", key: course.code, course }),
      );
    return {
      suggestions: [
        ...(found.exact ? [wildcardRow(found.exact)] : []),
        ...matches,
        ...(found.related ? [wildcardRow(found.related)] : []),
      ],
      hint: found.hint,
    };
  }, [index, query, exclude, takesWildcards, complete, termName]);

  const add = (s: Suggestion | undefined): boolean => {
    if (!s) return false;
    if (s.kind === "course") onAdd(s.course.code);
    else if (s.empty || !wildcards) return false;
    else wildcards.onAdd(s.wildcard);
    setQuery("");
    setActive(0);
    return true;
  };
  const showList = open && suggestions.length > 0;
  const showHint = open && hint !== null && suggestions.length === 0;

  return (
    <div className="relative">
      <CourseSearchField
        inputRef={inputRef}
        query={query}
        onQueryChange={(next) => {
          setQuery(next);
          setActive(0);
          setOpen(true);
        }}
        count={showList ? suggestions.length : 0}
        active={active}
        onActiveChange={(next) => {
          setOpen(true);
          setActive(next);
        }}
        onPick={(i) => add(suggestions[i])}
        combobox={{ listId, optionId: (i) => `${listId}-${i}` }}
        label={label}
        placeholder={placeholder}
        tooltip={
          wildcards
            ? "Type a code, title words, a pattern like CMSC4XX, or a GenEd like DSHS"
            : "Type a course code or words from its title"
        }
        aria-describedby={showHint ? `${listId}-hint` : undefined}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      />
      {showList ? (
        <div
          id={listId}
          role="listbox"
          aria-label="Suggested courses"
          className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden border border-keyline bg-raised py-1 shadow-pop"
        >
          {suggestions.map((s, i) => {
            const shared = {
              id: `${listId}-${i}`,
              role: "option",
              tabIndex: -1,
              "aria-selected": i === active,
              onMouseDown: (e: { preventDefault: () => void }) =>
                e.preventDefault(),
              onMouseEnter: () => setActive(i),
              onClick: () => add(s),
              onKeyDown: () => {},
              state: i === active ? ("previewed" as const) : undefined,
              className: "cursor-default border-b-0",
            };
            return s.kind === "course" ? (
              <CourseResultRow
                key={s.key}
                {...shared}
                density="compact"
                code={s.course.code}
                title={s.course.title}
              />
            ) : (
              <ListRow
                key={s.key}
                {...shared}
                density="compact"
                aria-disabled={s.empty ? true : undefined}
                className={cn(shared.className, "px-2")}
              >
                <span className="flex min-w-0 items-baseline gap-2 text-sm">
                  <span
                    className={cn(
                      "shrink-0 font-semibold",
                      s.empty && "text-faint",
                    )}
                  >
                    {wildcardLabel(s.wildcard)}
                  </span>
                  {s.detail ? (
                    <span className="truncate text-muted">{s.detail}</span>
                  ) : null}
                </span>
              </ListRow>
            );
          })}
        </div>
      ) : null}
      {showHint ? (
        <p
          id={`${listId}-hint`}
          role="status"
          className="absolute inset-x-0 top-full z-20 mt-1 rounded-md border border-hairline bg-raised px-2 py-1.5 text-muted text-sm shadow-pop"
        >
          {hint}
        </p>
      ) : null}
    </div>
  );
}
