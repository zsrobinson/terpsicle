import { wildcardId } from "../catalog/wildcard";
import {
  type CourseCode,
  type GenerateDraft,
  type GenerateDraftItem,
  type GenItem,
  type GenWildcardItem,
  MAX_WILDCARD_COUNT,
  type MustHaves,
  type Relaxable,
  type Relaxation,
  type Wildcard,
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
    if (item.kind !== "pick") return [item];
    const [only, ...rest] = item.courses;
    if (!only) return [];
    if (rest.length === 0) return [{ kind: "course", required: true, ...only }];
    return [{ ...item, count: Math.min(item.count, item.courses.length) }];
  });
}

/** Every course the form mentions, first mention first (a wildcard isn't one). */
export function draftCourseCodes(
  items: readonly GenerateDraftItem[],
): CourseCode[] {
  const codes = items.flatMap((item) =>
    item.kind === "course"
      ? [item.courseCode]
      : item.kind === "pick"
        ? item.courses.map((c) => c.courseCode)
        : [],
  );
  return [...new Set(codes)];
}

/**
 * The form with a wildcard added. Adding one that's listed already asks for
 * one more course from its set ("Any CMSC 400-level ×2"), up to
 * `MAX_WILDCARD_COUNT`; a new one is required, like a new course.
 */
export function addWildcard(
  items: readonly GenerateDraftItem[],
  wildcard: Wildcard,
): GenerateDraftItem[] {
  const id = wildcardId(wildcard);
  const same = (i: GenerateDraftItem) =>
    i.kind === "wildcard" && wildcardId(i.wildcard) === id;
  if (!items.some(same))
    return [...items, { kind: "wildcard", wildcard, required: true, count: 1 }];
  return items.map((i) =>
    i.kind === "wildcard" && same(i)
      ? { ...i, count: Math.min(MAX_WILDCARD_COUNT, i.count + 1) }
      : i,
  );
}

/** The form with one course fewer from a wildcard, or without it when it's down to one. */
export function removeWildcard(
  items: readonly GenerateDraftItem[],
  wildcard: Wildcard,
): GenerateDraftItem[] {
  const id = wildcardId(wildcard);
  return items.flatMap((i): GenerateDraftItem[] =>
    i.kind !== "wildcard" || wildcardId(i.wildcard) !== id
      ? [i]
      : i.count > 1
        ? [{ ...i, count: i.count - 1 }]
        : [],
  );
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

/** The form with a suggested relaxation applied, as clicking it does. */
export function relaxDraft(
  draft: GenerateDraft,
  patch: Relaxation["patch"],
): GenerateDraft {
  return {
    ...draft,
    mustHaves: { ...draft.mustHaves, ...(patch.mustHaves ?? {}) },
    items: draft.items.map((item) =>
      item.kind === "course"
        ? relaxCourseItem(item, patch)
        : item.kind === "wildcard"
          ? relaxWildcardItem(item, patch)
          : item,
    ),
  };
}

/** A wildcard with a relaxation's patch applied. */
export function relaxWildcardItem(
  item: GenWildcardItem,
  patch: Relaxation["patch"],
): GenWildcardItem {
  return wildcardId(item.wildcard) === patch.makeWildcardOptional
    ? { ...item, required: false }
    : item;
}

/** A requested course with a relaxation's course patch applied. */
export function relaxCourseItem(
  item: Extract<GenItem, { kind: "course" }>,
  patch: Relaxation["patch"],
): Extract<GenItem, { kind: "course" }> {
  let next = item;
  if (item.courseCode === patch.makeOptional)
    next = { ...next, required: false };
  if (item.courseCode === patch.allowAllSections) {
    const { sections: _all, ...rest } = next;
    next = rest;
  }
  return next;
}
