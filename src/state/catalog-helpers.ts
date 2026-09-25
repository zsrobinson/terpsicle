// TODO(core): replace with ~/core/catalog helpers (snapshots, credits) once
// M1 core lands. Small pure functions the shell needs today.
import type {
  Course,
  CourseCode,
  Credits,
  Plan,
  Section,
  SectionSnapshot,
} from "~/core/schema";

/** What a plan keeps of a placed section (DATA.md §5). */
export function snapshotOf(section: Section): SectionSnapshot {
  return {
    instructors: [...section.instructors],
    delivery: section.delivery,
    meetings: section.meetings.map((m) => ({ ...m })),
    ...(section.dates ? { dates: { ...section.dates } } : {}),
  };
}

/**
 * Credits of the placed courses (saved-for-later ones don't count). Variable
 * credit courses make a range. Courses not loaded yet are left out, so this
 * can briefly undercount while a department loads.
 */
export function planCredits(
  plan: Pick<Plan, "courses">,
  courses: Readonly<Partial<Record<CourseCode, Course>>>,
): Credits {
  let min = 0;
  let max = 0;
  for (const entry of plan.courses) {
    if (entry.sectionCode === null) continue;
    const course = courses[entry.courseCode];
    if (!course) continue;
    min += course.credits.min;
    max += course.credits.max;
  }
  return { min, max };
}

/** "16 credits", "1 credit", "15–17 credits". */
export function creditsLabel({ min, max }: Credits): string {
  const n = (x: number) => String(Math.round(x * 10) / 10);
  if (min === max) return `${n(min)} ${min === 1 ? "credit" : "credits"}`;
  return `${n(min)}–${n(max)} credits`;
}
