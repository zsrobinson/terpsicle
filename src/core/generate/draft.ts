import type {
  CourseCode,
  GenerateDraftItem,
  GenItem,
  MustHaves,
  Relaxable,
} from "../schema";

// The Generate form's items as the generator's: the form lets a "pick N"
// group be half-built while the person fills it in.

/**
 * Valid request items. A group with no courses is left out, a group of one
 * is that course, required (pick 1 of 1), and N never exceeds the courses
 * listed.
 */
export function requestItems(items: readonly GenerateDraftItem[]): GenItem[] {
  return items.flatMap((item): GenItem[] => {
    if (item.kind === "course") return [item];
    const [only, ...rest] = item.courses;
    if (!only) return [];
    if (rest.length === 0) return [{ kind: "course", required: true, ...only }];
    return [{ ...item, count: Math.min(item.count, item.courses.length) }];
  });
}

/** Every course the form mentions, first mention first. */
export function draftCourseCodes(
  items: readonly GenerateDraftItem[],
): CourseCode[] {
  const codes = items.flatMap((item) =>
    item.kind === "course"
      ? [item.courseCode]
      : item.courses.map((c) => c.courseCode),
  );
  return [...new Set(codes)];
}

/** The must-haves that narrow the search, by name (analytics, summaries). */
export function activeMustHaves(
  mustHaves: MustHaves,
  hasBlocks: boolean,
): Relaxable[] {
  const out: Relaxable[] = [];
  if (mustHaves.earliestStart !== null) out.push("earliest-start");
  if (mustHaves.latestEnd !== null) out.push("latest-end");
  if (mustHaves.daysOff.length > 0) out.push("days-off");
  if (mustHaves.enoughTravelTime) out.push("enough-travel-time");
  if (mustHaves.openSeatsOnly) out.push("open-seats-only");
  if (mustHaves.respectBlocks && hasBlocks) out.push("respect-blocks");
  if (mustHaves.credits.min !== null || mustHaves.credits.max !== null)
    out.push("credits");
  return out;
}
