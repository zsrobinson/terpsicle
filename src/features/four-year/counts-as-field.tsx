import { useId, useMemo, useState } from "react";
import {
  searchFourYearCourses,
  searchRowCredits,
} from "~/core/four-year/search";
import { fitsEquivalentPattern } from "~/core/four-year/transcript";
import type { CourseCode, CourseSearchRow } from "~/core/schema";
import { NO_FILTERS } from "~/core/search/filters";
import { useSearchEngine } from "~/state/search-engine";
import { Button } from "~/ui/button";
import { CourseResultRow, CourseSearchField } from "~/ui/course-search";
import { Skeleton } from "~/ui/skeleton";
import { WithTooltip } from "~/ui/tooltip";
import { useCourseSearch } from "./data";

// "Counts as" (V3 §2.8, §2.10): the UMD course a course Testudo can't match
// stands for, picked with the kit's course search (the box, keys, engine and
// rows every course search shares), so only a course Testudo lists can be
// picked. With a "CHEM 1XX" placeholder, its courses are offered first.

/** How many courses the field offers at a time. */
const SHOWN = 5;

function useSearchRows(): readonly CourseSearchRow[] | null {
  return useCourseSearch().rows;
}

export function CountsAsField({
  value,
  onChange,
  name,
  suggested,
  pattern,
}: {
  value: CourseCode | null;
  onChange: (next: CourseCode | null) => void;
  /** What counts as it, for the tooltips: "AP CHEMISTRY", "MATH241H". */
  name: string;
  /** Courses to offer before anything's typed (an honors code's base course). */
  suggested: readonly CourseCode[];
  /** Testudo's placeholder ("CHEM1XX"): its courses are offered first. */
  pattern: string | null;
}) {
  const id = useId();
  const listId = `${id}-courses`;
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(-1);
  const rows = useSearchRows();
  const engine = useSearchEngine();
  const byCode = useMemo(
    () => new Map((rows ?? []).map((r) => [r[0], r] as const)),
    [rows],
  );
  const results = useMemo(() => {
    if (!rows) return [];
    if (query.trim() !== "")
      return engine
        ? searchFourYearCourses(engine, rows, query, NO_FILTERS, {}, SHOWN).rows
        : [];
    const offered = suggested.flatMap((c) => {
      const row = byCode.get(c);
      return row ? [row] : [];
    });
    const fitting = pattern
      ? rows.filter((r) => fitsEquivalentPattern(r[0], pattern))
      : [];
    return [...offered, ...fitting].slice(0, SHOWN);
  }, [rows, engine, byCode, query, suggested, pattern]);

  const pick = (code: CourseCode | undefined) => {
    if (!code) return;
    onChange(code);
    setQuery("");
    setActive(-1);
  };

  if (value !== null) {
    const row = byCode.get(value);
    return (
      <div className="space-y-1">
        <p className="font-medium text-sm">Counts as</p>
        <div className="flex items-center gap-2 border border-hairline bg-raised px-2.5 py-1.5">
          <div className="min-w-0 flex-1">
            <span className="ident font-semibold">{value}</span>
            {row ? (
              <span className="block truncate text-muted text-sm">
                {row[1]}
              </span>
            ) : null}
          </div>
          <WithTooltip label={`Pick another course for ${name}, or none`}>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onChange(null)}
            >
              Change
            </Button>
          </WithTooltip>
        </div>
      </div>
    );
  }

  const searching = query.trim() !== "";
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block font-medium text-sm">
        Counts as
      </label>
      <CourseSearchField
        id={id}
        query={query}
        onQueryChange={(next) => {
          setQuery(next);
          setActive(-1);
        }}
        count={results.length}
        active={active}
        onActiveChange={setActive}
        onPick={(i) => pick(results[i]?.[0])}
        combobox={{ listId, optionId: (i) => `${listId}-${i}` }}
        label="Counts as"
        placeholder="A UMD course code or title"
        tooltip="Search by course code or title. Enter picks the top course"
        aria-describedby={`${id}-note`}
      />
      <p id={`${id}-note`} className="text-muted text-xs">
        Leave it empty if it doesn't count as a UMD course.
      </p>
      {rows === null || (searching && engine === null) ? (
        <Skeleton className="h-8 w-full" />
      ) : results.length > 0 ? (
        <div
          id={listId}
          role="listbox"
          aria-label="Courses it could count as"
          className="border border-hairline bg-raised"
        >
          {results.map((row, i) => (
            <CourseResultRow
              key={row[0]}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              tabIndex={-1}
              density="compact"
              code={row[0]}
              title={row[1]}
              meta={searchRowCredits(row)}
              state={i === active ? "previewed" : undefined}
              className="cursor-pointer hover:bg-hover"
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(row[0])}
            />
          ))}
        </div>
      ) : searching ? (
        <p className="text-muted text-sm">
          No course in Testudo matches that. Try its code, like CHEM131.
        </p>
      ) : null}
    </div>
  );
}
