import {
  type Course,
  type CourseCode,
  type Plan,
  type Section,
  type SectionKey,
  type SectionSnapshot,
  sectionKey,
  type TermId,
} from "../schema";

// The in-memory catalog for one term: every course and section by key.
// Built once per catalog load (in the worker) and passed to core functions.

/** A section with the course it belongs to. */
export type SectionRef = {
  readonly key: SectionKey;
  readonly course: Course;
  readonly section: Section;
};

export type CatalogIndex = {
  readonly termId: TermId;
  /** In code order. */
  readonly courses: ReadonlyMap<CourseCode, Course>;
  readonly sections: ReadonlyMap<SectionKey, SectionRef>;
};

export function buildCatalogIndex(
  termId: TermId,
  courses: Iterable<Course>,
): CatalogIndex {
  const sorted = [...courses].sort((a, b) =>
    a.code < b.code ? -1 : a.code > b.code ? 1 : 0,
  );
  const courseMap = new Map<CourseCode, Course>();
  const sectionMap = new Map<SectionKey, SectionRef>();
  for (const course of sorted) {
    courseMap.set(course.code, course);
    for (const section of course.sections) {
      const key = sectionKey(course.code, section.code);
      sectionMap.set(key, { key, course, section });
    }
  }
  return { termId, courses: courseMap, sections: sectionMap };
}

export function findCourse(
  index: CatalogIndex,
  code: CourseCode,
): Course | undefined {
  return index.courses.get(code);
}

export function findSection(
  index: CatalogIndex,
  key: SectionKey,
): SectionRef | undefined {
  return index.sections.get(key);
}

export function sectionRef(course: Course, section: Section): SectionRef {
  return { key: sectionKey(course.code, section.code), course, section };
}

/**
 * The plan's placed sections as they are in the catalog now, in plan order.
 * Sections missing from the catalog or cancelled are left out: they don't
 * meet, so they can't overlap or need a walk. Problems reports them instead.
 */
export function placedSections(plan: Plan, index: CatalogIndex): SectionRef[] {
  const out: SectionRef[] = [];
  for (const c of plan.courses) {
    if (c.sectionCode === null) continue;
    const ref = index.sections.get(sectionKey(c.courseCode, c.sectionCode));
    if (ref && !ref.section.cancelled) out.push(ref);
  }
  return out;
}

/** What a plan remembers about a section when it's placed. */
export function snapshotOf(section: Section): SectionSnapshot {
  return {
    instructors: [...section.instructors],
    delivery: section.delivery,
    meetings: section.meetings.map((m) => ({ ...m })),
  };
}
