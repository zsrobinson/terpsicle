import { gradeSummary } from "../grades/grades";
import {
  type Course,
  instructorNameKey,
  type PlanetTerpDept,
  type SectionKey,
  sectionKey,
} from "../schema";
import { meanOf, type SectionQuality } from "./candidates";

// Ratings and average GPAs per section, for ranking by best-rated
// instructors and higher average GPA. Joined through PlanetTerp's per-
// department files the same way course details does (DATA.md §4.1).

/**
 * Each section's mean instructor rating and mean average GPA in this
 * course. Sections with no PlanetTerp match are left out (the ranker treats
 * them as neutral, neither rewarded nor punished).
 */
export function sectionQuality(
  courses: Iterable<Course>,
  depts: Iterable<PlanetTerpDept>,
): Map<SectionKey, SectionQuality> {
  const byDept = new Map<string, PlanetTerpDept>();
  for (const d of depts) byDept.set(d.dept, d);
  const out = new Map<SectionKey, SectionQuality>();
  for (const course of courses) {
    const dept = byDept.get(course.code.slice(0, 4));
    if (!dept) continue;
    const grades = dept.courses[course.code];
    for (const section of course.sections) {
      const slugs = section.instructors.flatMap((name) => {
        const slug = dept.names[instructorNameKey(name)];
        return slug ? [slug] : [];
      });
      if (slugs.length === 0) continue;
      const rating = meanOf(
        slugs.map((s) => dept.instructors[s]?.rating ?? null),
      );
      const gpa = meanOf(
        slugs.map((s) => {
          const record = grades?.byInstructor[s];
          return record ? gradeSummary(record.counts).averageGpa : null;
        }),
      );
      if (rating !== null || gpa !== null)
        out.set(sectionKey(course.code, section.code), { rating, gpa });
    }
  }
  return out;
}
