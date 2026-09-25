import type { CatalogIndex } from "../catalog/catalog-index";
import type {
  CourseCode,
  GeneratedPlan,
  Section,
  SectionCode,
} from "../schema";

// Results that give the student the same week: every course meets at the
// same times (in person or online) and the same courses are left out. The
// search keeps rooms apart, because the walk between classes depends on
// them; once every result is known to fit, a different room is not a
// different plan to choose between, so the list shows one row with the
// others counted in "×N equivalent".

/** A section's weekly times, ignoring rooms. */
export function sectionTimesKey(section: Section): string {
  const parts = section.meetings.flatMap((m) =>
    m.timed
      ? [`${m.days.join("")}@${m.start}-${m.end}${m.online ? "@online" : ""}`]
      : [],
  );
  const dates = section.dates
    ? `${section.dates.start}~${section.dates.end}`
    : "";
  return `${parts.sort().join(",")}|${dates}`;
}

function weekKey(result: GeneratedPlan, index: CatalogIndex): string {
  const courses = result.sections.map((key) => {
    const ref = index.sections.get(key);
    return ref ? `${ref.course.code}:${sectionTimesKey(ref.section)}` : key;
  });
  return `${courses.join(";")}|skip:${result.skipped.join(",")}`;
}

/** Each course's interchangeable sections in a result (at least its own). */
function alternatives(
  result: GeneratedPlan,
): Map<CourseCode, Set<SectionCode>> {
  const out = new Map<CourseCode, Set<SectionCode>>();
  for (const key of result.sections) {
    const [course = "", section = ""] = key.split("-");
    out.set(course, new Set([section]));
  }
  for (const e of result.equivalents.byCourse)
    out.set(e.courseCode, new Set(e.sectionCodes));
  return out;
}

/**
 * Merges results with the same week into the best-ranked of them, adding the
 * others' sections to its equivalents. Order is kept.
 */
export function mergeSameWeek(
  results: readonly GeneratedPlan[],
  index: CatalogIndex,
): GeneratedPlan[] {
  const groups = new Map<
    string,
    { first: GeneratedPlan; alts: Map<CourseCode, Set<SectionCode>> }
  >();
  for (const result of results) {
    const key = weekKey(result, index);
    const group = groups.get(key);
    if (!group) {
      groups.set(key, { first: result, alts: alternatives(result) });
      continue;
    }
    for (const [course, codes] of alternatives(result)) {
      const into = group.alts.get(course) ?? new Set<SectionCode>();
      for (const code of codes) into.add(code);
      group.alts.set(course, into);
    }
  }
  return [...groups.values()].map(({ first, alts }) => {
    const byCourse = [...alts]
      .filter(([, codes]) => codes.size > 1)
      .map(([courseCode, codes]) => ({
        courseCode,
        sectionCodes: [...codes].sort(),
      }));
    return {
      ...first,
      equivalents: {
        count: byCourse.reduce((n, c) => n * c.sectionCodes.length, 1),
        byCourse,
      },
    };
  });
}
