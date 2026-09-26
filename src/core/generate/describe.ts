import type { CatalogIndex } from "../catalog/catalog-index";
import type {
  CourseCode,
  Day,
  GeneratedPlan,
  GenItem,
  Minutes,
  SectionCode,
} from "../schema";

// What tells one generated plan from its neighbors in the list: the days it
// leaves free, which of the person's choices (pick-N and optional courses) it
// includes, and the sections where it differs from the top result.

const WEEKDAYS: readonly Day[] = ["M", "Tu", "W", "Th", "F"];

/** Weekdays with no class meeting in person or online at a set time. */
export function freeWeekdays(
  result: Pick<GeneratedPlan, "sections">,
  index: CatalogIndex,
): Day[] {
  const busy = new Set<Day>();
  for (const key of result.sections)
    for (const m of index.sections.get(key)?.section.meetings ?? [])
      if (m.timed) for (const d of m.days) busy.add(d);
  return WEEKDAYS.filter((d) => !busy.has(d));
}

/**
 * The courses the person left to the generator (pick-N groups and optional
 * courses) that this result includes, in request order.
 */
export function chosenCourses(
  result: Pick<GeneratedPlan, "sections">,
  items: readonly GenItem[],
): CourseCode[] {
  const open = new Set(
    items.flatMap((item) =>
      item.kind === "pick"
        ? item.courses.map((c) => c.courseCode)
        : item.kind === "wildcard" || item.required
          ? []
          : [item.courseCode],
    ),
  );
  if (open.size === 0) return [];
  const included = new Set(result.sections.map((k) => k.split("-")[0] ?? ""));
  return [...open].filter((code) => included.has(code));
}

/** Whether the request leaves anything to the generator to include or not. */
export function hasChoices(items: readonly GenItem[]): boolean {
  return items.some((i) => i.kind === "pick" || !i.required);
}

export type SectionDifference = {
  courseCode: CourseCode;
  sectionCode: SectionCode;
  /** Days it meets in person at a set time ("MWF"). */
  days: string;
  /** Days it meets online at a set time; hybrid sections split the week. */
  onlineDays: string;
  start: Minutes | null;
};

/**
 * Sections this result places differently from `top` (another section, or a
 * course `top` doesn't have), in the result's order, with their first timed
 * meeting so the list can say "ENGL101 9020 MF 11am".
 */
export function differencesFrom(
  result: Pick<GeneratedPlan, "sections">,
  top: Pick<GeneratedPlan, "sections">,
  index: CatalogIndex,
): SectionDifference[] {
  const topSections = new Set(top.sections);
  return result.sections.flatMap((key): SectionDifference[] => {
    if (topSections.has(key)) return [];
    const ref = index.sections.get(key);
    if (!ref) return [];
    const timed = ref.section.meetings.flatMap((m) => (m.timed ? [m] : []));
    const daysOf = (online: boolean) =>
      [...new Set(timed.flatMap((m) => (m.online === online ? m.days : [])))]
        .sort((a, b) => WEEK_ORDER.indexOf(a) - WEEK_ORDER.indexOf(b))
        .join("");
    return [
      {
        courseCode: ref.course.code,
        sectionCode: ref.section.code,
        days: daysOf(false),
        onlineDays: daysOf(true),
        start: timed[0]?.start ?? null,
      },
    ];
  });
}

const WEEK_ORDER: readonly Day[] = ["M", "Tu", "W", "Th", "F", "Sa", "Su"];
