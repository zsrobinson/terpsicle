import type { GenEdCode } from "~/core/schema/primitives";
import { listItems, type ScheduleSearch } from "~/core/schema/schedule-url";
import type { SearchFilters } from "./filters";

// Search's filter chips in the scheduler's URL (`?gened=DSHU,DSNL&credits=3`),
// so a filtered search survives a reload and Back undoes a chip.

type FilterParams = Pick<
  ScheduleSearch,
  "gened" | "credits" | "level" | "openSeats" | "fits"
>;

const joined = (items: readonly (string | number)[]) =>
  items.length > 0 ? items.join(",") : undefined;

/** The params for a set of filters; none when nothing is chosen. */
export function filterParams(filters: SearchFilters): FilterParams {
  return {
    gened: joined(filters.genEds),
    credits: joined(filters.credits),
    level: joined(filters.levels),
    openSeats: filters.openSeats ? 1 : undefined,
    fits: filters.fitsMyPlan ? 1 : undefined,
  };
}

/** The filters validated params ask for; missing ones are off. */
export function filtersFromParams(search: FilterParams): SearchFilters {
  return {
    // The schema checked each item.
    genEds: listItems(search.gened) as GenEdCode[],
    credits: listItems(search.credits).map(Number),
    levels: listItems(search.level).map(Number),
    openSeats: search.openSeats === 1,
    fitsMyPlan: search.fits === 1,
  };
}

/** Two sets of filters choose the same things. */
export function sameFilters(a: SearchFilters, b: SearchFilters): boolean {
  return JSON.stringify(filterParams(a)) === JSON.stringify(filterParams(b));
}
