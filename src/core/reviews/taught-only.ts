import { courseOfferings, type TaughtRow, taughtBy } from "../history";
import type { CourseCode } from "../schema";
import type { HistoryDept } from "../schema/history";

// An instructor PlanetTerp doesn't know (owner, 2026-09-30: "every instructor
// row is clickable"): about 500 names in the instructor history join no
// PlanetTerp slug, so they have no ratings, grades or reviews of theirs to
// show. Their page is our own, from the history alone: what they taught,
// term by term, and the box to be the first to review them.
//
// Their address is their name (`/reviews/jane-doe`), always with the course
// it was reached from (`?course=CMSC351`): that course's department history
// is where the name is looked up, since nothing indexes these names.

/** A history name's address: "Jane Q. Doe-Smith" → "jane-q-doe-smith". */
export function historyInstructorSlug(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** What their page shows. */
export interface TaughtOnlyPageData {
  /** Their address, `historyInstructorSlug(name)`. */
  slug: string;
  /** As the history spells it. */
  name: string;
  /** The course the page was reached from; always one of `taught`'s. */
  course: CourseCode;
  /** Every course and term of theirs in that department, newest first. */
  taught: TaughtRow[];
}

/**
 * The instructor `slug` names among everyone who taught `course`, with all
 * they taught in its department; null when nobody there has that address.
 */
export function taughtOnlyPageData(
  dept: HistoryDept | null | undefined,
  course: CourseCode,
  slug: string,
): TaughtOnlyPageData | null {
  if (!slug) return null;
  // An offering's names are everyone on its sections too, as `taughtBy` reads.
  for (const offering of courseOfferings(dept, course)) {
    const name = offering.instructors.find(
      (n) => historyInstructorSlug(n) === slug,
    );
    if (name && dept)
      return { slug, name, course, taught: taughtBy([dept], [name]) };
  }
  return null;
}
