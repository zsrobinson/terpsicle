import { seasonSpan } from "../catalog/terms";
import { mainPlanFor } from "../plans/main-plan";
import {
  type CourseCode,
  type IsoDate,
  instructorNameKey,
  type MainPlans,
  type Plan,
  type TermId,
} from "../schema";
import { reviewTermChoices } from "./terms";

// "Review your instructors" on /reviews (owner, 2026-09-28: "encourage
// reviews of professors based on the information we know about the user").
// From the schedules you made: the instructors of the sections you placed in
// terms that are over, and in the term under way once it's nearly done. A
// term's schedule is its main plan (docs/V2.md §5.5), the one you're taking;
// the others were drafts.

/** A term is "nearly done" for this many days before its usual end. */
export const LATE_IN_TERM_DAYS = 42;

/** Instructor names Testudo prints when nobody's assigned yet. */
const NOBODY = /^(tba|staff|instructor:?\s*tba)$/i;

const DAY_MS = 86_400_000;

export interface InstructorToReview {
  termId: TermId;
  course: CourseCode;
  /** The Testudo name on the section. */
  name: string;
}

/** Whether a term's classes are over, or nearly, by `today`. */
export function isReviewableTerm(termId: TermId, today: IsoDate): boolean {
  const { start, end } = seasonSpan(termId);
  if (today < start) return false;
  const lateFrom = new Date(Date.parse(end) - LATE_IN_TERM_DAYS * DAY_MS)
    .toISOString()
    .slice(0, 10);
  return today >= lateFrom;
}

/** "CMSC351:clyde kruskal": what a review of an instructor in a course is keyed by here. */
export function reviewedKey(course: string, name: string): string {
  return `${course}:${instructorNameKey(name)}`;
}

/**
 * Who you could review, newest term first, then by course, from each term's
 * main plan (`mainPlans`, or the first tab where none is chosen). `reviewed`
 * holds `reviewedKey`s of the reviews you've written, which drop out. Terms
 * older than the review form offers (four years) are left out too.
 */
export function instructorsToReview(
  plans: readonly Plan[],
  today: IsoDate,
  reviewed: ReadonlySet<string> = new Set(),
  mainPlans: Readonly<MainPlans> = {},
): InstructorToReview[] {
  const offered = new Set(reviewTermChoices(today));
  const terms = new Set(
    plans
      .map((p) => p.termId)
      .filter((t) => offered.has(t) && isReviewableTerm(t, today)),
  );
  const mains = [...terms].flatMap(
    (termId) => mainPlanFor(termId, plans, mainPlans) ?? [],
  );
  const out: InstructorToReview[] = [];
  const seen = new Set<string>();
  for (const plan of mains)
    for (const course of plan.courses)
      for (const name of course.snapshot?.instructors ?? []) {
        const key = reviewedKey(course.courseCode, name);
        if (NOBODY.test(name.trim()) || seen.has(key) || reviewed.has(key))
          continue;
        seen.add(key);
        out.push({ termId: plan.termId, course: course.courseCode, name });
      }
  return out.sort(
    (a, b) =>
      b.termId.localeCompare(a.termId) ||
      a.course.localeCompare(b.course) ||
      a.name.localeCompare(b.name),
  );
}
