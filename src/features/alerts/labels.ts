// Names for what a seat alert watches, from the ids alone (these pages load
// without the catalog).
import { parseSectionKey, SEASON_BY_MONTH_CODE } from "~/core/schema";

/** "CMSC351-0101" → "CMSC351 0101". */
export function sectionLabel(sectionKey: string): string {
  const parsed = parseSectionKey(sectionKey);
  return parsed ? `${parsed.courseCode} ${parsed.sectionCode}` : sectionKey;
}

/** A term id as Testudo names it ("Spring 2027"); winter `YYYY12` is named for the next year. */
export function termLabel(termId: string): string {
  const year = Number(termId.slice(0, 4));
  const code = termId.slice(4);
  const season =
    SEASON_BY_MONTH_CODE[code as keyof typeof SEASON_BY_MONTH_CODE];
  if (!season || !Number.isFinite(year)) return termId;
  const name = season.charAt(0).toUpperCase() + season.slice(1);
  return `${name} ${season === "winter" ? year + 1 : year}`;
}

/** The app URL that opens this section's course in its term. */
export function courseHref(termId: string, sectionKey: string): string {
  const parsed = parseSectionKey(sectionKey);
  const params = new URLSearchParams({ term: termId });
  if (parsed) params.set("course", parsed.courseCode);
  return `/?${params}`;
}
