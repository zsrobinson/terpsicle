import {
  type ScheduleSearch,
  type ScheduleSearchInput,
  ScheduleSearchSchema,
  TYPED_SEARCH_PARAMS,
} from "~/core/schema/schedule-url";

// How a change of the scheduler's URL enters the browser's history
// (src/app/README.md, "URL state"): a place someone went pushes an entry, so
// Back returns there; typing, and anything the app corrects on its own
// (a plan that's gone, a term that loaded), replaces the current one.

export type HistoryMode = "push" | "replace" | "none";

/**
 * The params as the URL carries them, ready to write: validated (lists
 * joined, flags as `1`), with empty ones left out.
 */
export function urlSearch(search: ScheduleSearchInput): ScheduleSearch {
  const parsed = ScheduleSearchSchema.parse(search);
  return Object.fromEntries(
    Object.entries(parsed).filter(([, v]) => v !== undefined && v !== ""),
  ) as ScheduleSearch;
}

/** Keys whose values differ between two sets of params. */
export function changedParams(
  a: ScheduleSearchInput,
  b: ScheduleSearchInput,
): (keyof ScheduleSearch)[] {
  const x = urlSearch(a);
  const y = urlSearch(b);
  const keys = new Set([...Object.keys(x), ...Object.keys(y)]) as Set<
    keyof ScheduleSearch
  >;
  return [...keys].filter((k) => JSON.stringify(x[k]) !== JSON.stringify(y[k]));
}

/**
 * `navigating` is true when the change came from someone going somewhere
 * (opening a course, a tab, a plan). Only then does it push, and only when a
 * place changed: the same URL is never pushed twice, and a change to typed
 * text alone always replaces.
 */
export function historyMode(
  current: ScheduleSearchInput,
  next: ScheduleSearchInput,
  navigating: boolean,
): HistoryMode {
  const changed = changedParams(current, next);
  if (changed.length === 0) return "none";
  if (!navigating) return "replace";
  return changed.some((k) => !TYPED_SEARCH_PARAMS.includes(k))
    ? "push"
    : "replace";
}
