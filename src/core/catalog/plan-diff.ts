import {
  type CatalogChange,
  type CourseCode,
  type DeptCode,
  type IsoDateTime,
  type Meeting,
  type Plan,
  type SectionCode,
  type SectionKey,
  type SectionSnapshot,
  sectionKey,
} from "../schema";
import { type CatalogIndex, snapshotOf } from "./catalog-index";

// Turns catalog updates into "cancelled" and "changed" problems (DATA §3.3):
// each placed course's snapshot against the live catalog. Testudo cancels a
// section by no longer listing it, so a missing section is cancelled; the
// changes file only adds when it happened.

export type SnapshotPart = "meetings" | "dates" | "instructors" | "delivery";

export type PlanSectionDiff =
  | {
      readonly kind: "cancelled";
      readonly key: SectionKey;
      readonly courseCode: CourseCode;
      readonly sectionCode: SectionCode;
      readonly before: SectionSnapshot;
      /** From the changes file; null when it doesn't cover it. */
      readonly at: IsoDateTime | null;
    }
  | {
      readonly kind: "changed";
      readonly key: SectionKey;
      readonly courseCode: CourseCode;
      readonly sectionCode: SectionCode;
      readonly parts: readonly SnapshotPart[];
      readonly before: SectionSnapshot;
      readonly after: SectionSnapshot;
      readonly at: IsoDateTime | null;
    };

function sameList<T>(
  a: readonly T[],
  b: readonly T[],
  eq: (x: T, y: T) => boolean,
): boolean {
  return a.length === b.length && a.every((x, i) => eq(x, b[i] as T));
}

export function sameMeeting(a: Meeting, b: Meeting): boolean {
  if (
    a.timed !== b.timed ||
    a.kind !== b.kind ||
    a.building !== b.building ||
    a.room !== b.room ||
    a.online !== b.online
  )
    return false;
  if (a.timed && b.timed)
    return (
      a.start === b.start &&
      a.end === b.end &&
      sameList(a.days, b.days, (x, y) => x === y)
    );
  return true;
}

/** Which parts differ; empty when the snapshots describe the same section. */
export function snapshotChanges(
  before: SectionSnapshot,
  after: SectionSnapshot,
): SnapshotPart[] {
  const parts: SnapshotPart[] = [];
  if (!sameList(before.meetings, after.meetings, sameMeeting))
    parts.push("meetings");
  if (
    before.dates?.start !== after.dates?.start ||
    before.dates?.end !== after.dates?.end
  )
    parts.push("dates");
  if (!sameList(before.instructors, after.instructors, (x, y) => x === y))
    parts.push("instructors");
  if (before.delivery !== after.delivery) parts.push("delivery");
  return parts;
}

/** A course's department: always the code's first four letters (DATA.md §1). */
export function courseDept(code: CourseCode): DeptCode {
  return code.slice(0, 4);
}

/**
 * The plan's departments the catalog can't speak for yet: listed in the
 * manifest but not loaded. Their sections are unknown, not cancelled. A
 * department the manifest no longer lists isn't pending: its sections are
 * gone.
 */
export function pendingPlanDepts(
  plan: Pick<Plan, "courses">,
  listed: ReadonlySet<DeptCode>,
  isLoaded: (dept: DeptCode) => boolean,
): Set<DeptCode> {
  const pending = new Set<DeptCode>();
  for (const pc of plan.courses) {
    const dept = courseDept(pc.courseCode);
    if (listed.has(dept) && !isLoaded(dept)) pending.add(dept);
  }
  return pending;
}

/** The newest change for each section key (the file is newest first). */
function latestChanges(
  changes: readonly CatalogChange[],
): Map<SectionKey, CatalogChange> {
  const map = new Map<SectionKey, CatalogChange>();
  for (const c of changes) if (!map.has(c.sectionKey)) map.set(c.sectionKey, c);
  return map;
}

/**
 * Every placed section that was cancelled or changed since the plan took its
 * snapshot, in plan order. A section missing from the catalog is cancelled,
 * unless its department is `pending` (not loaded yet).
 */
export function diffPlanAgainstCatalog(
  plan: Plan,
  index: CatalogIndex,
  changes: readonly CatalogChange[] = [],
  pending: ReadonlySet<DeptCode> = new Set(),
): PlanSectionDiff[] {
  const latest = latestChanges(changes);
  const out: PlanSectionDiff[] = [];
  for (const pc of plan.courses) {
    if (pc.sectionCode === null || pc.snapshot === null) continue;
    const key = sectionKey(pc.courseCode, pc.sectionCode);
    const change = latest.get(key);
    const base = {
      key,
      courseCode: pc.courseCode,
      sectionCode: pc.sectionCode,
      before: pc.snapshot,
      at: change?.at ?? null,
    };
    const ref = index.sections.get(key);
    if (!ref) {
      if (!pending.has(courseDept(pc.courseCode)))
        out.push({ kind: "cancelled", ...base });
      continue;
    }
    const after = snapshotOf(ref.section);
    const parts = snapshotChanges(pc.snapshot, after);
    if (parts.length > 0) out.push({ kind: "changed", ...base, parts, after });
  }
  return out;
}
