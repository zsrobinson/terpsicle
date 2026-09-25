import {
  countFittingSections,
  courseFitsPlan,
  type FitContext,
} from "../fit/fit";
import type { Course, CourseCode, GenEdCode, GenEdGroup } from "../schema";
import { sectionKey } from "../schema";
import { type SeatsMap, seatCounts } from "../seats/seats";

// Search filters (SPEC §3.5) as pure predicates over a course.

export type SearchFilters = {
  /** Every chosen gen-ed must be one the course can count for at the same time. */
  readonly genEds: readonly GenEdCode[];
  /** Credit values; the course matches when its range includes any. The top option means "or more". */
  readonly credits: readonly number[];
  /** 100–800; the course number's hundreds. */
  readonly levels: readonly number[];
  readonly openSeats: boolean;
  readonly fitsMyPlan: boolean;
};

export const NO_FILTERS: SearchFilters = {
  genEds: [],
  credits: [],
  levels: [],
  openSeats: false,
  fitsMyPlan: false,
};

/** The Credits ▾ options; the last reads "5+". */
export const CREDIT_OPTIONS = [1, 2, 3, 4, 5] as const;
export const LEVEL_OPTIONS = [100, 200, 300, 400, 500, 600, 700, 800] as const;

export function isFiltering(filters: SearchFilters): boolean {
  return (
    filters.genEds.length > 0 ||
    filters.credits.length > 0 ||
    filters.levels.length > 0 ||
    filters.openSeats ||
    filters.fitsMyPlan
  );
}

/**
 * Whether the course counts for all of `codes` at once. Within a gen-ed group
 * the student picks one code (DATA §3.2), so each code needs its own group:
 * a small bipartite matching.
 */
export function coversGenEds(
  groups: readonly GenEdGroup[],
  codes: readonly GenEdCode[],
): boolean {
  const wanted = [...new Set(codes)];
  if (wanted.length > groups.length) return false;
  const used = new Array<boolean>(groups.length).fill(false);
  const assign = (i: number): boolean => {
    const code = wanted[i];
    if (code === undefined) return true;
    for (let g = 0; g < groups.length; g++) {
      if (used[g] || !groups[g]?.some((o) => o.code === code)) continue;
      used[g] = true;
      if (assign(i + 1)) return true;
      used[g] = false;
    }
    return false;
  };
  return assign(0);
}

export function matchesCredits(
  course: Course,
  credits: readonly number[],
): boolean {
  if (credits.length === 0) return true;
  const top = CREDIT_OPTIONS[CREDIT_OPTIONS.length - 1] ?? 5;
  return credits.some((v) =>
    v >= top
      ? course.credits.max >= v
      : course.credits.min <= v && v <= course.credits.max,
  );
}

/** 351 → 300; 789 → 700. */
export function courseLevel(code: CourseCode): number {
  return Number(code.charAt(4)) * 100;
}

export function hasOpenSeats(course: Course, seats: SeatsMap | null): boolean {
  return course.sections.some(
    (s) => (seatCounts(seats, sectionKey(course.code, s.code))?.open ?? 0) > 0,
  );
}

export type FilterContext = {
  readonly seats: SeatsMap | null;
  /** Needed only when `fitsMyPlan` is on. */
  readonly fit: FitContext | null;
};

/** One predicate for the whole filter line; cheap checks run first. */
export function courseFilter(
  filters: SearchFilters,
  ctx: FilterContext,
): (course: Course) => boolean {
  return (course) =>
    (filters.levels.length === 0 ||
      filters.levels.includes(courseLevel(course.code))) &&
    matchesCredits(course, filters.credits) &&
    (filters.genEds.length === 0 ||
      coversGenEds(course.genEds, filters.genEds)) &&
    (!filters.openSeats || hasOpenSeats(course, ctx.seats)) &&
    (!filters.fitsMyPlan ||
      ctx.fit === null ||
      courseFitsPlan(ctx.fit, course));
}

export type SectionSummary = {
  readonly sections: number;
  /** How many fit the plan; null when there's no plan to fit against. */
  readonly fit: number | null;
};

export function sectionSummary(
  course: Course,
  fit: FitContext | null,
): SectionSummary {
  return {
    sections: course.sections.length,
    fit: fit ? countFittingSections(fit, course) : null,
  };
}

/** "4 sections · 2 fit your plan", "2 sections · 1 fits your plan", "3 sections · none fit your plan". */
export function formatSectionSummary(summary: SectionSummary): string {
  const n = summary.sections;
  const count = `${n} section${n === 1 ? "" : "s"}`;
  if (summary.fit === null || n === 0) return count;
  return `${count} · ${summary.fit === 0 ? "none" : summary.fit} fit${summary.fit === 1 ? "s" : ""} your plan`;
}
