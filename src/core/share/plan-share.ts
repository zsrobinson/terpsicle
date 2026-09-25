import { type CatalogIndex, snapshotOf } from "../catalog/catalog-index";
import {
  type Block,
  type CourseCode,
  type CourseColor,
  type IsoDateTime,
  type LocalId,
  type Plan,
  type PlanCourse,
  parseSectionKey,
  type SectionKey,
  SHARE_PAYLOAD_VERSION,
  type SharePayload,
  sectionKey,
} from "../schema";

// Between plans and share payloads (DATA §8).

const MAX_ENTRIES = 40;

/** What "Copy share link" encodes: the plan, the term's blocks and the plan's course colors. */
export function sharePayloadFromPlan(
  plan: Plan,
  blocks: readonly Block[],
  colors: Readonly<Record<CourseCode, CourseColor>>,
): SharePayload {
  const sections: SectionKey[] = [];
  const saved: CourseCode[] = [];
  const planColors: Record<CourseCode, CourseColor> = {};
  for (const c of plan.courses) {
    if (c.sectionCode === null) {
      if (saved.length < MAX_ENTRIES) saved.push(c.courseCode);
    } else if (sections.length < MAX_ENTRIES) {
      sections.push(sectionKey(c.courseCode, c.sectionCode));
    } else continue;
    const color = colors[c.courseCode];
    if (color) planColors[c.courseCode] = color;
  }
  const termBlocks = blocks
    .filter((b) => b.termId === plan.termId)
    .slice(0, MAX_ENTRIES);
  return {
    v: SHARE_PAYLOAD_VERSION,
    termId: plan.termId,
    name: plan.name,
    sections,
    ...(saved.length ? { saved } : {}),
    ...(termBlocks.length
      ? {
          blocks: termBlocks.map((b) => ({
            label: b.label,
            days: [...b.days],
            start: b.start,
            end: b.end,
          })),
        }
      : {}),
    ...(Object.keys(planColors).length ? { colors: planColors } : {}),
  };
}

/**
 * The read-only plan the shared view shows. Sections the catalog doesn't have
 * stay in, with an empty snapshot, so Problems lists them as cancelled.
 */
export function sharedViewPlan(
  payload: SharePayload,
  index: CatalogIndex,
  id: LocalId,
  now: IsoDateTime,
): Plan {
  const placed: PlanCourse[] = payload.sections.flatMap((key) => {
    const parts = parseSectionKey(key);
    if (!parts) return [];
    const ref = index.sections.get(key);
    return [
      {
        courseCode: parts.courseCode,
        sectionCode: parts.sectionCode,
        snapshot: ref
          ? snapshotOf(ref.section)
          : { instructors: [], delivery: "f2f", meetings: [] },
      },
    ];
  });
  const saved: PlanCourse[] = (payload.saved ?? []).map((courseCode) => ({
    courseCode,
    sectionCode: null,
    snapshot: null,
  }));
  return {
    id,
    termId: payload.termId,
    name: payload.name ?? "Shared plan",
    order: 0,
    createdAt: now,
    updatedAt: now,
    courses: [...placed, ...saved],
  };
}

/**
 * "Save a copy": the courses with fresh snapshots from the current catalog.
 * Sections and saved courses the catalog no longer has (cancelled) are
 * dropped and named, for the toast.
 */
export function coursesFromShare(
  payload: SharePayload,
  index: CatalogIndex,
): { courses: PlanCourse[]; dropped: string[] } {
  const courses: PlanCourse[] = [];
  const dropped: string[] = [];
  for (const key of payload.sections) {
    const ref = index.sections.get(key);
    if (!ref) {
      dropped.push(key);
      continue;
    }
    courses.push({
      courseCode: ref.course.code,
      sectionCode: ref.section.code,
      snapshot: snapshotOf(ref.section),
    });
  }
  for (const code of payload.saved ?? []) {
    if (index.courses.has(code))
      courses.push({ courseCode: code, sectionCode: null, snapshot: null });
    else dropped.push(code);
  }
  return { courses, dropped };
}
