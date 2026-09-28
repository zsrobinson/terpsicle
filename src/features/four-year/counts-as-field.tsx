import { type KeyboardEvent, useEffect, useId, useMemo, useState } from "react";
import {
  searchFourYearCourses,
  searchRowCredits,
} from "~/core/four-year/search";
import { fitsEquivalentPattern } from "~/core/four-year/transcript";
import type { CourseCode, CourseSearchRow } from "~/core/schema";
import { useCourseIndex } from "~/state/course-index-store";
import { Button } from "~/ui/button";
import { SearchField } from "~/ui/input";
import { ListRow } from "~/ui/list-row";
import { Skeleton } from "~/ui/skeleton";
import { WithTooltip } from "~/ui/tooltip";

// "Counts as" (V3 §2.8, §2.10): the UMD course a course Testudo can't match
// stands for. It's picked from Plan's course search over the course index,
// so only a course Testudo lists can be picked; with a "CHEM 1XX"
// placeholder, the department's courses at that level come first.

/** How many courses the field suggests at a time. */
const SHOWN = 5;

function useSearchRows(): readonly CourseSearchRow[] | null {
  const rows = useCourseIndex((s) => s.search);
  const ensure = useCourseIndex((s) => s.ensureSearch);
  const connected = useCourseIndex((s) => s.source !== null);
  useEffect(() => {
    if (connected) void ensure();
  }, [connected, ensure]);
  return rows;
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
  const [query, setQuery] = useState("");
  const rows = useSearchRows();
  const byCode = useMemo(
    () => new Map((rows ?? []).map((r) => [r[0], r] as const)),
    [rows],
  );
  const results = useMemo(() => {
    if (!rows) return [];
    if (query.trim() !== "")
      return searchFourYearCourses(rows, query, {}, SHOWN).rows;
    const offered = suggested.flatMap((c) => {
      const row = byCode.get(c);
      return row ? [row] : [];
    });
    const fitting = pattern
      ? rows.filter((r) => fitsEquivalentPattern(r[0], pattern))
      : [];
    return [...offered, ...fitting].slice(0, SHOWN);
  }, [rows, byCode, query, suggested, pattern]);

  const pick = (code: CourseCode) => {
    onChange(code);
    setQuery("");
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

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    // Enter picks the top course, as in Plan's Search; never submits the form.
    event.preventDefault();
    const top = results[0];
    if (top) pick(top[0]);
  };

  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block font-medium text-sm">
        Counts as
      </label>
      <WithTooltip label="Search by course code or title. Enter picks the top course.">
        <SearchField
          id={id}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onClear={() => setQuery("")}
          onKeyDown={onKeyDown}
          placeholder="A UMD course code or title"
          autoComplete="off"
          spellCheck={false}
          aria-describedby={`${id}-note`}
        />
      </WithTooltip>
      <p id={`${id}-note`} className="text-muted text-xs">
        Leave it empty if it doesn't count as a UMD course.
      </p>
      {rows === null ? (
        <Skeleton className="h-8 w-full" />
      ) : results.length > 0 ? (
        <ul
          aria-label="Courses it could count as"
          className="border border-hairline"
        >
          {results.map((row) => (
            <ListRow
              key={row[0]}
              as="li"
              density="compact"
              className="relative hover:bg-hover"
              trail={
                <span className="tnum text-muted text-xs">
                  {searchRowCredits(row)}
                </span>
              }
            >
              <WithTooltip label={`Count ${name} as ${row[0]}`}>
                <button
                  type="button"
                  onClick={() => pick(row[0])}
                  className="flex w-full min-w-0 items-baseline gap-2 text-left after:absolute after:inset-0"
                >
                  <span className="ident shrink-0 font-semibold">{row[0]}</span>
                  <span className="min-w-0 truncate text-muted text-sm">
                    {row[1]}
                  </span>
                </button>
              </WithTooltip>
            </ListRow>
          ))}
        </ul>
      ) : query.trim() !== "" ? (
        <p className="text-muted text-sm">
          No course in Testudo matches that. Try its code, like CHEM131.
        </p>
      ) : null}
    </div>
  );
}
