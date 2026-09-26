import {
  type DeptCode,
  type InstructorId,
  type InstructorNameRule,
  type ReviewsDept,
  SCHEMA_VERSIONS,
  type TerpsicleRating,
} from "~/core/schema";
import { createdMonth } from "./text";

// What the hourly reviews-publish job publishes (V2 §7.6), built from the
// published reviews' numbers alone: no text, no author, no exact times. The
// job reads them from D1; mock mode passes fixtures to the same function.

/** One published review, as much of it as the numbers need. */
export interface PublishedReviewFact {
  instructorId: InstructorId;
  course: string;
  rating: number;
  publishedAt: string;
}

/** An `instructor_names` row. */
export interface ReviewNameFact {
  nameKey: string;
  dept: DeptCode;
  instructorId: InstructorId;
  rule: InstructorNameRule;
}

const deptOf = (course: string): DeptCode => course.slice(0, 4);

const byKey = <T>(entries: Iterable<[string, T]>): Record<string, T> =>
  Object.fromEntries([...entries].sort(([a], [b]) => (a < b ? -1 : 1)));

/**
 * One file per department with something in it, sorted by code. An
 * instructor appears in each department they have a published review in, or
 * a published name in, always with their numbers across every course.
 * Names are the owner's corrections, and minted instructors' names once
 * they have a published review (a name alone would tell that someone tried
 * to review them). PlanetTerp's own join isn't repeated here.
 */
export function buildReviewsDepts(
  reviews: readonly PublishedReviewFact[],
  names: readonly ReviewNameFact[],
): ReviewsDept[] {
  const totals = new Map<
    InstructorId,
    { sum: number; count: number; latest: string }
  >();
  const depts = new Map<
    DeptCode,
    { instructors: Set<InstructorId>; names: Map<string, InstructorId> }
  >();
  const deptEntry = (dept: DeptCode) => {
    let entry = depts.get(dept);
    if (!entry) {
      entry = { instructors: new Set(), names: new Map() };
      depts.set(dept, entry);
    }
    return entry;
  };

  for (const r of reviews) {
    const t = totals.get(r.instructorId) ?? { sum: 0, count: 0, latest: "" };
    t.sum += r.rating;
    t.count += 1;
    if (r.publishedAt > t.latest) t.latest = r.publishedAt;
    totals.set(r.instructorId, t);
    deptEntry(deptOf(r.course)).instructors.add(r.instructorId);
  }
  for (const n of names) {
    const publish =
      n.rule === "manual" ||
      (n.rule === "minted" && totals.has(n.instructorId));
    if (!publish) continue;
    const entry = deptEntry(n.dept);
    entry.names.set(n.nameKey, n.instructorId);
    if (totals.has(n.instructorId)) entry.instructors.add(n.instructorId);
  }

  const rating = (id: InstructorId): TerpsicleRating | null => {
    const t = totals.get(id);
    if (!t) return null;
    return {
      rating: Math.round((t.sum / t.count) * 100) / 100,
      reviewCount: t.count,
      latestReviewMonth: createdMonth(t.latest),
    };
  };

  return [...depts.keys()].sort().map((dept) => {
    const entry = deptEntry(dept);
    return {
      schemaVersion: SCHEMA_VERSIONS.reviews,
      dept,
      instructors: byKey(
        [...entry.instructors].flatMap((id): [string, TerpsicleRating][] => {
          const r = rating(id);
          return r ? [[id, r]] : [];
        }),
      ),
      names: byKey(entry.names),
    };
  });
}
