import { Plus, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { create } from "zustand";
import { wildcardDetail, wildcardLabel } from "~/core/catalog/wildcard";
import {
  searchFourYearCourses,
  searchRowCredits,
} from "~/core/four-year/search";
import { fourYearTermLabel } from "~/core/four-year/terms";
import { parsePlaceholder } from "~/core/four-year/wildcards";
import { type CourseSearchRow, GEN_ED_LABELS } from "~/core/schema";
import { WILDCARD_CREDITS } from "~/core/schema/four-year";
import { useCourseIndex } from "~/state/course-index-store";
import { Button } from "~/ui/button";
import { Skeleton } from "~/ui/skeleton";
import { WithTooltip } from "~/ui/tooltip";
import {
  addCourse,
  addPlaceholder,
  entryName,
  pickForPlaceholder,
} from "./actions";
import { useModel, usePlanNav } from "./model";

// The Search tab (V3 §2.9, §2.13): every course in the course index, any
// term. Typing CMSC4XX or "any DSHS" offers a placeholder first. From a
// placeholder's "Pick a course", results are what can replace it; from the
// GenEd tab's "Find a course", what counts for that GenEd.

export const SEARCH_INPUT_ID = "plan-search";

/**
 * Asks the search box for focus: "Add a course", "Find a course", "Pick a
 * course" and `/` do, and so does opening the tab. Changing the semester
 * from the phone's strip doesn't, so the keyboard doesn't pop up for it.
 */
export const useSearchFocus = create<{ asked: number }>()(() => ({
  asked: 0,
}));

export function focusSearch(): void {
  useSearchFocus.setState((s) => ({ asked: s.asked + 1 }));
}

function ResultRow({
  row,
  action,
  actionLabel,
  onAct,
}: {
  row: CourseSearchRow;
  action: string;
  actionLabel: string;
  onAct: () => void;
}) {
  const nav = usePlanNav();
  const { doc } = useModel();
  const [code, title, , , genEds] = row;
  const where = doc.entries
    .filter((e) => e.kind === "course" && e.code === code)
    .map((e) => fourYearTermLabel(e.term));
  return (
    <li className="flex items-center gap-1 border-hairline border-b pr-2">
      <WithTooltip label={`About ${code}`}>
        <button
          type="button"
          onClick={() => nav.go({ course: code })}
          className="min-w-0 flex-1 px-4 py-1.5 text-left hover:bg-hover"
        >
          <span className="flex items-baseline gap-2">
            <span className="font-mono font-semibold">{code}</span>
            <span className="tnum text-muted text-xs">
              {searchRowCredits(row)}
            </span>
            {where.length > 0 ? (
              <span className="ml-auto truncate text-muted text-xs">
                In {where.join(", ")}
              </span>
            ) : null}
          </span>
          <span className="block truncate text-muted text-sm">{title}</span>
          {genEds.length > 0 ? (
            <span className="block truncate font-mono text-2xs text-muted">
              {genEds.join(" · ")}
            </span>
          ) : null}
        </button>
      </WithTooltip>
      <WithTooltip label={actionLabel}>
        <Button
          variant="outline"
          size="row"
          aria-label={actionLabel}
          className="h-11 md:h-6"
          onClick={onAct}
        >
          {action}
        </Button>
      </WithTooltip>
    </li>
  );
}

export function SearchPanel() {
  const { doc, target } = useModel();
  const nav = usePlanNav();
  const [query, setQuery] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const rows = useCourseIndex((s) => s.search);
  const state = useCourseIndex((s) => s.searchState);
  const ensure = useCourseIndex((s) => s.ensureSearch);
  const connected = useCourseIndex((s) => s.source !== null);

  useEffect(() => {
    if (connected) void ensure();
  }, [connected, ensure]);

  const placeholderEntry = nav.search.wildcard
    ? doc.entries.find((e) => e.id === nav.search.wildcard)
    : undefined;
  const resolving =
    placeholderEntry?.kind === "wildcard" ? placeholderEntry : null;
  const genEd = resolving ? null : (nav.search.gened ?? null);

  // A new scope starts a new search.
  const scope = `${nav.search.semester}|${resolving?.id}|${genEd}`;
  useEffect(() => {
    void scope;
    setQuery("");
  }, [scope]);

  const asked = useSearchFocus((s) => s.asked);
  useEffect(() => {
    // On a phone the panel is under the semesters: focus brings it up too.
    if (asked > 0) input.current?.focus();
  }, [asked]);

  const result = useMemo(
    () =>
      rows
        ? searchFourYearCourses(rows, query, {
            genEd,
            wildcard: resolving?.wildcard ?? null,
          })
        : null,
    [rows, query, genEd, resolving],
  );
  const parsed = resolving ? null : parsePlaceholder(query);
  const offer = parsed?.kind === "wildcard" ? parsed.wildcard : null;
  const targetName = fourYearTermLabel(target);

  const scopeLine = resolving ? (
    <>
      Picking a course for{" "}
      <span className="font-mono">{entryName(resolving)}</span> in{" "}
      {fourYearTermLabel(resolving.term)}
    </>
  ) : genEd ? (
    <>
      Courses that count for <span className="font-mono">{genEd}</span>
      {GEN_ED_LABELS[genEd] ? ` (${GEN_ED_LABELS[genEd]})` : ""}
    </>
  ) : null;

  return (
    <div className="flex flex-col">
      <div className="space-y-2 border-hairline border-b px-4 py-3">
        <label htmlFor={SEARCH_INPUT_ID} className="sr-only">
          Search courses
        </label>
        <input
          ref={input}
          id={SEARCH_INPUT_ID}
          type="search"
          autoComplete="off"
          spellCheck={false}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="CMSC351, a title, CMSC4XX or DSHS"
          className="h-11 w-full border border-hairline-strong bg-raised px-2.5 text-base outline-none placeholder:text-faint focus-visible:border-fg md:h-8"
        />
        <p className="flex min-h-6 items-center gap-2 text-muted text-sm">
          <span className="min-w-0 flex-1">
            {scopeLine ?? (
              <>
                Adding to <span className="text-fg">{targetName}</span>. Pick
                another semester's "Add a course" to change it.
              </>
            )}
          </span>
          {scopeLine ? (
            <WithTooltip label="Search every course">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Search every course"
                className="size-11 md:size-6"
                onClick={() =>
                  nav.go(
                    { wildcard: undefined, gened: undefined },
                    { replace: true },
                  )
                }
              >
                <X aria-hidden="true" />
              </Button>
            </WithTooltip>
          ) : null}
        </p>
      </div>

      {offer ? (
        <div className="flex items-center gap-2 border-hairline border-b bg-panel py-1.5 pr-2 pl-4">
          <span className="min-w-0 flex-1">
            <span className="block">
              Add a placeholder:{" "}
              <span className="font-mono font-semibold">
                {offer.kind === "pattern" ? offer.pattern : offer.code}
              </span>
            </span>
            <span className="block truncate text-muted text-sm">
              {offer.kind === "pattern"
                ? wildcardLabel(offer)
                : `Any ${wildcardDetail(offer) ?? offer.code} course`}
              , {WILDCARD_CREDITS.default} cr until you pick one
            </span>
          </span>
          <WithTooltip label={`Add it to ${targetName}`}>
            <Button
              size="row"
              aria-label={`Add ${offer.kind === "pattern" ? offer.pattern : wildcardLabel(offer)} to ${targetName}`}
              className="h-11 md:h-6"
              onClick={() => {
                addPlaceholder(doc, offer, target);
                setQuery("");
              }}
            >
              <Plus aria-hidden="true" />
              Add
            </Button>
          </WithTooltip>
        </div>
      ) : null}

      {state === "error" && !rows ? (
        <div className="space-y-2 px-4 py-4">
          <p>
            We couldn't load the course list. Check your connection and try
            again.
          </p>
          <WithTooltip label="Load the course list again">
            <Button variant="outline" size="sm" onClick={() => void ensure()}>
              Try again
            </Button>
          </WithTooltip>
        </div>
      ) : !result ? (
        <div className="space-y-2 px-4 py-3" data-testid="plan-search-loading">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : result.total === 0 ? (
        <p className="px-4 py-4 text-muted text-sm">
          {query.trim() === "" && !scopeLine
            ? "Type a course code, part of a title, a pattern like CMSC4XX or a GenEd code like DSHS."
            : resolving
              ? `Nothing in Testudo matches ${entryName(resolving)}${query.trim() ? ` and "${query.trim()}"` : ""}.`
              : offer
                ? null
                : `Nothing matches "${query.trim()}".`}
        </p>
      ) : (
        <>
          <ul aria-label="Courses">
            {result.rows.map((row) =>
              resolving ? (
                <ResultRow
                  key={row[0]}
                  row={row}
                  action="Pick"
                  actionLabel={`Use ${row[0]} for ${entryName(resolving)}`}
                  onAct={() => {
                    void pickForPlaceholder(resolving.id, row[0]);
                    nav.go({ wildcard: undefined }, { replace: true });
                  }}
                />
              ) : (
                <ResultRow
                  key={row[0]}
                  row={row}
                  action="Add"
                  actionLabel={`Add ${row[0]} to ${targetName}`}
                  onAct={() =>
                    addCourse(
                      doc,
                      row[0],
                      target,
                      nav.search.semester ? "column" : "search",
                    )
                  }
                />
              ),
            )}
          </ul>
          {result.total > result.rows.length ? (
            <p className="tnum px-4 py-3 text-muted text-xs">
              Showing {result.rows.length} of {result.total}. Keep typing to
              narrow it down.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
