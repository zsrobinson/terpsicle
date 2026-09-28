import type { RailTab } from "~/core/schema/primitives";
import type {
  DrillSearch,
  GenerateTabSearch,
  LegacyScheduleSearch,
  ScheduleSearch,
  SearchTabSearch,
} from "~/core/schema/schedule-url";

// The scheduler's routes (src/routes/schedule.*.tsx): one per rail tab, one
// per drill-in, and `/schedule` itself, which redirects its old-style URLs
// (`?tab=&course=`) to them. src/features/schedule/README.md, "URL state".

/** Each rail tab's route: `/schedule/search`. */
export const TAB_PATHS = {
  courses: "/schedule/courses",
  search: "/schedule/search",
  problems: "/schedule/problems",
  travel: "/schedule/travel",
  blocks: "/schedule/blocks",
  generate: "/schedule/generate",
  register: "/schedule/register",
} as const satisfies Record<RailTab, string>;
export type TabPath = (typeof TAB_PATHS)[RailTab];

/** Course details: `/schedule/course/CMSC351?tab=search`. */
export const COURSE_PATH = "/schedule/course/$code";
/** Connection details: `/schedule/connection/M%3AESJ%3EIRB`. */
export const CONNECTION_PATH = "/schedule/connection/$connectionId";
/** A generated plan's details, over Generate's results. */
export const RESULT_PATH = "/schedule/result/$resultId";

/** Where a scheduler URL goes, as the router's `navigate` takes it. */
export type ScheduleLocation =
  | {
      to: TabPath;
      search: ScheduleSearch & SearchTabSearch & GenerateTabSearch;
    }
  | {
      to: typeof COURSE_PATH;
      params: { code: string };
      search: DrillLocationSearch;
    }
  | {
      to: typeof CONNECTION_PATH;
      params: { connectionId: string };
      search: DrillLocationSearch;
    }
  | {
      to: typeof RESULT_PATH;
      params: { resultId: string };
      search: DrillLocationSearch;
    };
type DrillLocationSearch = ScheduleSearch & DrillSearch;

/** Params as the URL carries them: empty ones left out. */
export function compactSearch<T extends object>(search: T): T {
  return Object.fromEntries(
    Object.entries(search).filter(([, v]) => v !== undefined && v !== ""),
  ) as T;
}

/**
 * The route an old-style `/schedule?…` URL names, or null when it names no
 * view (a plain `/schedule`, a share link: the saved view opens). A drill-in
 * without a tab opens over Courses, as it always has; a generated plan over
 * Generate.
 */
export function canonicalScheduleLocation(
  legacy: LegacyScheduleSearch,
): ScheduleLocation | null {
  const { plan, demo, term, planId } = legacy;
  const shared = compactSearch({ plan, demo, term, planId });
  if (legacy.course)
    return {
      to: COURSE_PATH,
      params: { code: legacy.course },
      search: { ...shared, tab: legacy.tab ?? "courses" },
    };
  if (legacy.connection)
    return {
      to: CONNECTION_PATH,
      params: { connectionId: legacy.connection },
      search: { ...shared, tab: legacy.tab ?? "courses" },
    };
  if (legacy.result)
    return {
      to: RESULT_PATH,
      params: { resultId: legacy.result },
      search: { ...shared, tab: legacy.tab ?? "generate" },
    };
  if (!legacy.tab) return null;
  const { q, gened, credits, level, openSeats, fits, view } = legacy;
  return {
    to: TAB_PATHS[legacy.tab],
    search: compactSearch({
      ...shared,
      ...(legacy.tab === "search"
        ? { q, gened, credits, level, openSeats, fits }
        : {}),
      ...(legacy.tab === "generate" ? { view } : {}),
    }),
  };
}
