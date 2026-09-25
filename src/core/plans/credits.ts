import type { CatalogIndex } from "../catalog/catalog-index";
import type { Credits, Plan } from "../schema";

// A plan's credits, for the top bar and the Courses header.

/**
 * Credits of the placed courses (saved-for-later ones don't count). Variable
 * credit courses make a range. Courses not loaded yet are left out, so this
 * can briefly undercount while a department loads.
 */
export function planCredits(
  plan: Pick<Plan, "courses">,
  index: Pick<CatalogIndex, "courses">,
): Credits {
  let min = 0;
  let max = 0;
  for (const entry of plan.courses) {
    if (entry.sectionCode === null) continue;
    const course = index.courses.get(entry.courseCode);
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
