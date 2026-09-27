import { z } from "zod";
// Only primitives: the route tree carries this schema to every page.
import {
  CourseCodeSchema,
  CourseDetailsTabSchema,
  GenEdCodeSchema,
  LocalIdSchema,
  RailTabSchema,
  TermIdSchema,
} from "./primitives";

// The scheduler's search params. Where you are is its route
// (`/schedule/search`, `/schedule/course/CMSC351`); these carry the rest
// (the term, the open plan, Search's text), so Back, Forward, reload and a
// copied link all land on the same view. Which change pushes a history entry
// and which replaces one: src/app/README.md, "URL state". A bad value is
// dropped, never an error: the rest of the link still works.

// The router writes what this schema returns into the URL, so it returns
// each param as the URL spells it (`gened=DSHU,DSNL`, `openSeats=1`):
// parsing its own output gives the same thing back. The router also reads
// `?q=351` as a number and `?q=true` as a boolean, so text fields
// take those back as text.
const Text = z.union([z.string(), z.number(), z.boolean()]).transform(String);

/** A connection's id (`M:ESJ>IRB`) as a path or search param. */
export const ConnectionIdSchema = z.string().min(1).max(64);
/** A generated result's id, as a path or search param. */
export const ResultIdSchema = z.string().min(1).max(64);

/** An optional param that's dropped when it isn't valid. */
function param<T extends z.ZodType<unknown, string>>(schema: T) {
  return Text.pipe(schema).optional().catch(undefined);
}

/** `param` for other routes' search schemas (reviews-url.ts). */
export const searchParam = param;

/** `a,b,c`, dropped whole when any item isn't valid. Split with `listItems`. */
function list(item: z.ZodType) {
  return z
    .union([z.array(Text).transform((items) => items.join(",")), Text])
    .pipe(
      z
        .string()
        .refine((s) => s.split(",").every((x) => item.safeParse(x).success)),
    )
    .optional()
    .catch(undefined);
}

/** A list param's items. */
export function listItems(value: string | undefined): string[] {
  return value ? value.split(",") : [];
}

/** `1` when on (`true` is read too); absent when off. */
const Flag = z
  .union([z.literal(1), z.literal("1"), z.literal(true), z.literal("true")])
  .transform(() => 1 as const)
  .optional()
  .catch(undefined);

/** Params every scheduler URL may carry, whatever view it shows. */
export const ScheduleSearchSchema = z.object({
  /** A shared plan, read-only (DATA.md §8). */
  plan: param(z.string().min(1)),
  /** `pnpm dev:mock` only: load the fixtures' demo plans. */
  demo: Flag,
  /** The term on screen. */
  term: param(TermIdSchema),
  /** The open plan tab (a local plan id; ignored when it isn't one of yours). */
  planId: param(LocalIdSchema),
  /**
   * `plan`: arrived by Plan's "View schedule" (docs/V3.md §2.12), which makes
   * or opens `term`'s linked plan. Dropped once that's done.
   */
  from: param(z.literal("plan")),
});
export type ScheduleSearch = z.infer<typeof ScheduleSearchSchema>;

/** `/schedule/search`: Search's text and filter chips. */
export const SearchTabSearchSchema = z.object({
  /** Search's text. */
  q: param(z.string().max(200)),
  gened: list(GenEdCodeSchema),
  credits: list(z.string().regex(/^[1-5]$/)),
  level: list(z.string().regex(/^[1-8]00$/)),
  openSeats: Flag,
  fits: Flag,
});
export type SearchTabSearch = z.infer<typeof SearchTabSearchSchema>;

/** `/schedule/generate`: its results rather than the form. */
export const GenerateTabSearchSchema = z.object({
  view: param(z.literal("results")),
});
export type GenerateTabSearch = z.infer<typeof GenerateTabSearchSchema>;

/** A drill-in (`/schedule/course/CMSC351`): the rail tab it opens over. */
export const DrillSearchSchema = z.object({
  tab: param(RailTabSchema),
});
export type DrillSearch = z.infer<typeof DrillSearchSchema>;

/**
 * `/schedule?tab=&course=&connection=&result=…`, the scheduler's URLs before
 * it had a route per view. Seat-alert emails, share links and bookmarks
 * still carry them; `/schedule` redirects each to its route
 * (`canonicalScheduleLocation` in ~/core/routing).
 */
export const LegacyScheduleSearchSchema = ScheduleSearchSchema.extend({
  tab: param(RailTabSchema),
  /** Course details, drilled in over the tab. */
  course: param(z.string().trim().toUpperCase().pipe(CourseCodeSchema)),
  /** Connection details (`M:ESJ>IRB`). */
  connection: param(ConnectionIdSchema),
  /** A generated plan, drilled in over Generate's results. */
  result: param(ResultIdSchema),
  ...GenerateTabSearchSchema.shape,
  ...SearchTabSearchSchema.shape,
});
export type LegacyScheduleSearch = z.infer<typeof LegacyScheduleSearchSchema>;
/** What a link may put in an old-style URL. */
export type LegacyScheduleSearchInput = z.input<
  typeof LegacyScheduleSearchSchema
>;

/**
 * What the scheduler keeps in a history entry's state: that it wrote the
 * entry (so the one before is the app's too, or this is the app's first),
 * the short name of the view Back returns to ("Search", "CMSC351"), and
 * where course details should jump on arrival (a scroll target, not a
 * place). Anything else there (the router's keys, another page's) is ignored.
 */
export const ScheduleHistoryStateSchema = z
  .object({
    inApp: z.literal(true).optional().catch(undefined),
    backLabel: z.string().min(1).max(80).optional().catch(undefined),
    backMono: z.boolean().optional().catch(undefined),
    detailsTab: CourseDetailsTabSchema.optional().catch(undefined),
  })
  .catch({});
export type ScheduleHistoryState = z.infer<typeof ScheduleHistoryStateSchema>;
