// Names for what a seat watch is on, from the ids alone (Settings loads
// without the catalog).

import { SCHEDULE_PATH } from "~/core/routing";
import { parseSectionKey } from "~/core/schema";

export { termLabel } from "~/core/catalog";

/** "CMSC351-0101" → "CMSC351 0101". */
export function sectionLabel(sectionKey: string): string {
  const parsed = parseSectionKey(sectionKey);
  return parsed ? `${parsed.courseCode} ${parsed.sectionCode}` : sectionKey;
}

/** The scheduler URL that opens this section's course in its term. */
export function courseHref(termId: string, sectionKey: string): string {
  const parsed = parseSectionKey(sectionKey);
  const params = new URLSearchParams({ term: termId });
  const course = parsed
    ? `/course/${encodeURIComponent(parsed.courseCode)}`
    : "/courses";
  return `${SCHEDULE_PATH}${course}?${params}`;
}
