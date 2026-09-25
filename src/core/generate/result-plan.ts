import { type CatalogIndex, snapshotOf } from "../catalog/catalog-index";
import type {
  CourseCode,
  GeneratedPlan,
  GenerateRequest,
  Plan,
  PlanCourse,
  SectionCode,
} from "../schema";

// A generated result as a plan: what "Save as new plan" stores, what the
// calendar previews, and how it differs from the plan on screen.

/**
 * The result's sections placed, in request order, then the optional courses
 * it left out, saved for later (the person still wants them). Courses a
 * "pick N" group didn't pick are dropped: listing every alternative as
 * saved would bury the plan.
 */
export function resultCourses(
  result: GeneratedPlan,
  request: Pick<GenerateRequest, "items">,
  index: CatalogIndex,
): PlanCourse[] {
  const placed = result.sections.flatMap((key): PlanCourse[] => {
    const ref = index.sections.get(key);
    return ref
      ? [
          {
            courseCode: ref.course.code,
            sectionCode: ref.section.code,
            snapshot: snapshotOf(ref.section),
          },
        ]
      : [];
  });
  const optional = new Set(
    request.items.flatMap((item) =>
      item.kind === "course" && !item.required ? [item.courseCode] : [],
    ),
  );
  const saved = result.skipped
    .filter((code) => optional.has(code))
    .map((courseCode) => ({ courseCode, sectionCode: null, snapshot: null }));
  return [...placed, ...saved];
}

/** How one course differs between the plan on screen and a result. */
export type PlanChange =
  | { kind: "added"; courseCode: CourseCode; to: SectionCode }
  | {
      kind: "switched";
      courseCode: CourseCode;
      from: SectionCode;
      to: SectionCode;
    }
  /** Saved for later in the plan, placed in the result. */
  | { kind: "placed"; courseCode: CourseCode; to: SectionCode }
  /** Placed in the plan, saved for later in the result. */
  | { kind: "unplaced"; courseCode: CourseCode; from: SectionCode }
  /** In the plan, not in the result at all. */
  | { kind: "dropped"; courseCode: CourseCode; from: SectionCode | null };

/** Result order first, then what the result drops, in plan order. */
export function changesFrom(
  plan: Pick<Plan, "courses">,
  courses: readonly PlanCourse[],
): PlanChange[] {
  const before = new Map(plan.courses.map((c) => [c.courseCode, c]));
  const out: PlanChange[] = [];
  for (const c of courses) {
    const was = before.get(c.courseCode);
    if (c.sectionCode === null) {
      if (was?.sectionCode)
        out.push({
          kind: "unplaced",
          courseCode: c.courseCode,
          from: was.sectionCode,
        });
      continue;
    }
    if (!was)
      out.push({ kind: "added", courseCode: c.courseCode, to: c.sectionCode });
    else if (was.sectionCode === null)
      out.push({ kind: "placed", courseCode: c.courseCode, to: c.sectionCode });
    else if (was.sectionCode !== c.sectionCode)
      out.push({
        kind: "switched",
        courseCode: c.courseCode,
        from: was.sectionCode,
        to: c.sectionCode,
      });
  }
  const kept = new Set(courses.map((c) => c.courseCode));
  for (const c of plan.courses)
    if (!kept.has(c.courseCode))
      out.push({
        kind: "dropped",
        courseCode: c.courseCode,
        from: c.sectionCode,
      });
  return out;
}
