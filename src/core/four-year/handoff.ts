import type { CourseCode, LocalId, Plan, TermId, Wildcard } from "../schema";
import type { FourYearEntry } from "../schema/four-year";

// "View schedule" (docs/V3.md §2.12): one scheduler plan per term is the
// four-year plan's link, never a copy of it.

/** The term's active plan on this device, else its first tab; null when the term has none. */
export function linkedSchedulePlan(
  termId: TermId,
  plans: readonly Plan[],
  activePlanByTerm: Readonly<Record<TermId, LocalId>>,
): Plan | null {
  const inTerm = plans.filter((p) => p.termId === termId);
  const active = activePlanByTerm[termId];
  const chosen = inTerm.find((p) => p.id === active);
  if (chosen) return chosen;
  let first: Plan | null = null;
  for (const p of inTerm)
    if (first === null || p.order < first.order) first = p;
  return first;
}

/** What a column hands the scheduler: its courses, and the placeholders it can't. */
export function handoffCourses(entries: readonly FourYearEntry[]): {
  readonly courses: CourseCode[];
  readonly placeholders: Wildcard[];
} {
  const courses: CourseCode[] = [];
  const placeholders: Wildcard[] = [];
  for (const e of entries)
    if (e.kind === "course" && !courses.includes(e.code)) courses.push(e.code);
    else if (e.kind === "wildcard") placeholders.push(e.wildcard);
  return { courses, placeholders };
}

/** "From Plan A: 4 of 5 placed": how many of the column's courses have a section in the plan. */
export function placedInPlan(
  courses: readonly CourseCode[],
  plan: Pick<Plan, "courses">,
): { readonly placed: number; readonly total: number } {
  const placed = new Set(
    plan.courses.filter((c) => c.sectionCode !== null).map((c) => c.courseCode),
  );
  return {
    placed: courses.filter((c) => placed.has(c)).length,
    total: courses.length,
  };
}
