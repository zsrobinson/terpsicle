import { mainPlanFor } from "../plans/main-plan";
import {
  type CourseCode,
  type InstructorId,
  type IsoDate,
  instructorNameKey,
  type MainPlans,
  type MyReview,
  type Plan,
  type TermId,
} from "../schema";
import type { FourYearDoc } from "../schema/four-year";
import { reviewTermChoices } from "./terms";
import { isNamedInstructor, isReviewableTerm, reviewedKey } from "./to-review";

// What Reviews knows you took, and what you've reviewed (owner, 2026-09-29:
// "a note for the review box saying if you haven't reviewed them and a
// slight encouragement to do so"). From this device's plans: the four-year
// plan's past terms (a transcript import fills them), which know the
// courses but not who taught them; and Schedule's main plan for a term the
// Schedule of Classes still lists, which knows the sections' instructors.
// Testudo lists only recent terms (in the fall, back to the summer), so
// nobody can build an older term's schedule: those come from the four-year
// plan alone (owner, 2026-09-29). Only terms that are over, or in their last
// six weeks, and that the review form offers.

/** A class you took: a course in a term, and who taught your section. */
export interface ClassTaken {
  termId: TermId;
  course: CourseCode;
  /** Testudo's names on your section; empty when only the four-year plan says so. */
  instructors: string[];
}

/** The plans Reviews reads from this device. */
export interface YourPlans {
  plans: readonly Plan[];
  mainPlans: Readonly<MainPlans>;
  fourYear: FourYearDoc | null;
}

/**
 * Every class you took, newest term first, then by course. `listed`: the
 * terms the Schedule of Classes still lists (the published terms file),
 * the only ones whose schedules count.
 */
export function classesTaken(
  { plans, mainPlans, fourYear }: YourPlans,
  today: IsoDate,
  listed: ReadonlySet<TermId>,
): ClassTaken[] {
  const offered = new Set(reviewTermChoices(today));
  const counts = (termId: TermId) =>
    offered.has(termId) && isReviewableTerm(termId, today);
  const found = new Map<string, ClassTaken>();
  const add = (
    termId: TermId,
    course: CourseCode,
    names: readonly string[],
  ) => {
    const key = `${termId}:${course}`;
    const entry = found.get(key) ?? { termId, course, instructors: [] };
    for (const name of names)
      if (
        isNamedInstructor(name) &&
        !entry.instructors.some(
          (n) => instructorNameKey(n) === instructorNameKey(name),
        )
      )
        entry.instructors.push(name.trim());
    found.set(key, entry);
  };
  const terms = new Set(
    plans.map((p) => p.termId).filter((t) => listed.has(t) && counts(t)),
  );
  for (const termId of terms) {
    const plan = mainPlanFor(termId, plans, mainPlans);
    for (const c of plan?.courses ?? [])
      add(termId, c.courseCode, c.snapshot?.instructors ?? []);
  }
  for (const entry of fourYear?.entries ?? [])
    if (
      entry.kind === "course" &&
      entry.term !== "before" &&
      counts(entry.term)
    )
      add(entry.term, entry.code, []);
  return [...found.values()].sort(
    (a, b) =>
      b.termId.localeCompare(a.termId) || a.course.localeCompare(b.course),
  );
}

/** The newest class of yours a page is about, and who taught it. */
export interface TookHere {
  termId: TermId;
  course: CourseCode;
  /** Testudo's name for them; null when your plans don't say. */
  instructor: string | null;
}

/**
 * Your newest class a page is about that you haven't reviewed: on a
 * course's page, that course (with whoever taught your section); on an
 * instructor's, a class of theirs (`course` narrows it to one course).
 * `reviewed` holds `reviewedKey`s of yours; a class whose instructor your
 * plans don't name counts as reviewed once you've reviewed its course, and
 * on an instructor's page counts only for a course they taught.
 * Null when there's none.
 */
export function tookHere(
  taken: readonly ClassTaken[],
  page: {
    course: CourseCode | null;
    instructorName: string | null;
    /**
     * An instructor's page: the courses they've taught. A class of one whose
     * instructor your plans don't name is theirs to ask about ("Was it
     * with…?"), never to claim.
     */
    taught?: ReadonlySet<CourseCode>;
  },
  reviewed: ReadonlySet<string> = new Set(),
): TookHere | null {
  const nameKey =
    page.instructorName === null
      ? null
      : instructorNameKey(page.instructorName);
  const open = (course: CourseCode, name: string) =>
    !reviewed.has(reviewedKey(course, name));
  const courseReviewed = (course: CourseCode) =>
    [...reviewed].some((key) => key.startsWith(`${course}:`));
  for (const c of taken) {
    if (page.course !== null && c.course !== page.course) continue;
    const names = c.instructors.filter(
      (n) =>
        (nameKey === null || instructorNameKey(n) === nameKey) &&
        open(c.course, n),
    );
    const [name] = names;
    if (name) return { termId: c.termId, course: c.course, instructor: name };
    if (
      c.instructors.length === 0 &&
      !courseReviewed(c.course) &&
      (nameKey === null || page.taught?.has(c.course))
    )
      return { termId: c.termId, course: c.course, instructor: null };
  }
  return null;
}

/**
 * Your classes to review, newest first: each instructor of yours you
 * haven't reviewed in that course, and each course of yours whose
 * instructor your plans don't name and you haven't reviewed at all.
 */
export function classesToReview(
  taken: readonly ClassTaken[],
  reviewed: ReadonlySet<string>,
): TookHere[] {
  const out: TookHere[] = [];
  for (const c of taken) {
    if (c.instructors.length === 0) {
      if (![...reviewed].some((key) => key.startsWith(`${c.course}:`)))
        out.push({ termId: c.termId, course: c.course, instructor: null });
      continue;
    }
    for (const name of c.instructors)
      if (!reviewed.has(reviewedKey(c.course, name)))
        out.push({ termId: c.termId, course: c.course, instructor: name });
  }
  return out;
}

/** When a review was written, for ordering: its first posting. */
const writtenAt = (r: MyReview) => r.createdAt;

/**
 * Your reviews that count, newest first: one per instructor and course (the
 * newest), leaving out rejected ones, which count as not written.
 */
export function reviewsByRecency(mine: readonly MyReview[]): MyReview[] {
  const seen = new Set<string>();
  return [...mine]
    .filter((r) => r.status !== "rejected")
    .sort((a, b) => writtenAt(b).localeCompare(writtenAt(a)))
    .filter((r) => {
      const key = `${r.instructorId}:${r.course}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

/**
 * Your newest review a page is about: of this instructor (in `course`, when
 * the page shows one), or of this course; rejected ones don't count.
 */
export function reviewedHere(
  mine: readonly MyReview[],
  page: { instructorId: InstructorId | null; course: CourseCode | null },
): MyReview | null {
  return (
    reviewsByRecency(mine).find(
      (r) =>
        (page.instructorId === null || r.instructorId === page.instructorId) &&
        (page.course === null || r.course === page.course),
    ) ?? null
  );
}
