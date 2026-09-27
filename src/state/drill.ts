import type { CourseCode, CourseDetailsTab, DrillTarget } from "~/core/schema";
import { DrillTargetSchema } from "~/core/schema";

/**
 * A view the sidebar drills into over a tab, as its route names it:
 * `/schedule/course/CMSC351` is `{ kind: "course", courseCode: "CMSC351" }`.
 * `tab` on a course is where its details jump on arrival (grades, about,
 * instructors): a scroll target carried in history state, not a place.
 */
export type DrillEntry =
  | { kind: "course"; courseCode: CourseCode; tab?: CourseDetailsTab }
  | { kind: "connection"; connectionId: string }
  | { kind: "generated-plan"; resultId: string };

export type DrillKind = DrillEntry["kind"];

export type DrillEntryOf<K extends DrillKind> = Extract<
  DrillEntry,
  { kind: K }
>;

/** The entry to remember between visits, if it's restorable (course or connection). */
export function restorableTarget(
  entry: DrillEntry | null | undefined,
): DrillTarget | null {
  if (!entry) return null;
  const parsed = DrillTargetSchema.safeParse(entry);
  return parsed.success ? parsed.data : null;
}

/** Two entries show the same thing (ignoring a details sub-tab). */
export function sameDrillSubject(a: DrillEntry, b: DrillEntry): boolean {
  if (a.kind !== b.kind) return false;
  const strip = (e: DrillEntry): string => {
    const { tab: _tab, ...rest } = e as DrillEntry & { tab?: unknown };
    return JSON.stringify(rest, Object.keys(rest).sort());
  };
  return strip(a) === strip(b);
}
