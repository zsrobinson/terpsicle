import { z } from "zod";
import {
  historyFromPlanetTerpGrades,
  type PlanetTerpCourseMeta,
} from "~/core/history";
import { CourseCodeSchema, JOBS_PREFIX, type TermId } from "~/core/schema";
import type { HistoryCourse } from "~/core/schema/history";
import type { BlobStore } from "./blob-store";
import { publishHistory } from "./history";
import type { HttpClient } from "./http";
import { fetchGrades, PLANETTERP_API } from "./planetterp/planetterp";
import { type Logger, readJsonOrNull, writeJson } from "./publish";

// The one-off PlanetTerp backfill of the instructor history (DATA.md §3.5):
// for every course PlanetTerp lists, its grade rows say who taught which
// section in which term, back to 2012. Recorded as `source: planetterp`;
// our own records win wherever both exist. Run by
// scripts/backfill-history.ts, never by a cron: it's one request a second
// for every course, about 5 hours, in chunks that each carry on from the
// last.

/** Courses already backfilled, so a rerun picks up where one stopped. */
export const HISTORY_BACKFILL_KEY = `${JOBS_PREFIX}history/backfill.json`;
const ProgressSchema = z.object({
  done: z.array(z.string()),
  /** Answered `[]` once: asked again on a later run before it counts. */
  emptyOnce: z.array(z.string()).default([]),
  /**
   * Answered `[]` on two runs: a course PlanetTerp knows but has no grades
   * for (a renamed or never-graded course), so nothing to record.
   */
  doneEmpty: z.array(z.string()).default([]),
});

/** A saved course listing, so a rerun skips the six-minute list. */
const ListingCacheSchema = z.object({
  scope: z.string(),
  courses: z.record(
    z.string(),
    z.object({ title: z.string().nullable(), credits: z.number().nullable() }),
  ),
});

const PAGE_SIZE = 100;

const CourseListingSchema = z.object({
  name: z.string(),
  title: z.string().nullable().catch(null),
  credits: z.number().nullable().catch(null),
});

export interface BackfillOptions {
  http: HttpClient;
  store: BlobStore;
  now: Date;
  log: Logger;
  /** Only these departments' courses (default: every course PlanetTerp lists). */
  departments?: readonly string[];
  /** Only these courses. */
  courses?: readonly string[];
  /** At most this many courses this run. */
  limit?: number;
  /** Wait between requests (default 1 s): PlanetTerp asks to be gentle. */
  delayMs?: number;
  /** Merge into the history after this many courses (default 400). */
  flushEvery?: number;
  /** Fetch and count, but write nothing. */
  dryRun?: boolean;
  /**
   * Where a complete course listing is kept between runs (the script's
   * `--list-cache` file). A saved listing for the same departments is used
   * instead of asking PlanetTerp; one that won't read is listed again.
   */
  listCache?: {
    read(): Promise<string | null>;
    write(text: string): Promise<void>;
  };
  /**
   * Asked before each course: true ends the run early, after a last merge,
   * so a run that has to fit a time limit stops cleanly (`--max-minutes`).
   */
  shouldStop?: () => boolean;
  /**
   * Stop after this many courses fail in a row (default 5; each request is
   * already retried with backoff): PlanetTerp is down or refusing us, and
   * asking for the rest would only hammer it.
   */
  maxFailuresInARow?: number;
  sleep?: (ms: number) => Promise<void>;
}

export interface BackfillResult {
  /** Courses PlanetTerp listed that this run could take. */
  listed: number;
  /** Skipped: backfilled by an earlier run. */
  alreadyDone: number;
  fetched: number;
  /** PlanetTerp said it has no grades for them (its 400 "course not found"). */
  noGrades: number;
  /**
   * PlanetTerp answered with an empty list. The first time, it isn't taken
   * as "no grades" (DATA.md §4.1): the course stays to do, and a later run
   * asks again.
   */
  emptyAnswers: number;
  /** Of those, empty on an earlier run too: now done, with nothing recorded. */
  markedEmpty: number;
  failed: number;
  /** The course listing came from `listCache`, not PlanetTerp. */
  listingCached: boolean;
  /** `shouldStop`, or too many failures in a row, ended the run early. */
  stoppedEarly: boolean;
  /** Courses this run could take but didn't reach. */
  left: number;
  /**
   * False when a page of PlanetTerp's course list failed, or came back
   * short with more after it: some courses may be missing from this run,
   * and a rerun lists them again.
   */
  listingComplete: boolean;
  /** Course-in-a-term records found, per term (a dry run's answer). */
  byTerm: Record<TermId, number>;
  written: number;
  errors: string[];
}

export async function backfillHistory(
  options: BackfillOptions,
): Promise<BackfillResult> {
  const { http, store, now, log } = options;
  const delayMs = options.delayMs ?? 1000;
  const flushEvery = options.flushEvery ?? 400;
  const sleep =
    options.sleep ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const result: BackfillResult = {
    listed: 0,
    alreadyDone: 0,
    fetched: 0,
    noGrades: 0,
    emptyAnswers: 0,
    markedEmpty: 0,
    failed: 0,
    listingCached: false,
    stoppedEarly: false,
    left: 0,
    listingComplete: true,
    byTerm: {},
    written: 0,
    errors: [],
  };
  let requests = 0;
  const politely = async <T>(request: () => Promise<T>): Promise<T> => {
    if (requests++ > 0) await sleep(delayMs);
    return request();
  };

  const metas = await cachedListing(options, politely, result);
  const progress = (await readJsonOrNull(
    store,
    HISTORY_BACKFILL_KEY,
    ProgressSchema,
    log,
  )) ?? { done: [], emptyOnce: [], doneEmpty: [] };
  const done = new Set(progress.done);
  const emptyOnce = new Set(progress.emptyOnce);
  const doneEmpty = new Set(progress.doneEmpty);
  const codes = [...metas.keys()].sort();
  result.listed = codes.length;
  const todo = codes.filter((c) => !done.has(c) && !doneEmpty.has(c));
  result.alreadyDone = codes.length - todo.length;
  const batch =
    options.limit === undefined ? todo : todo.slice(0, options.limit);

  let pending = new Map<TermId, HistoryCourse[]>();
  let pendingCodes: string[] = [];
  let cursorChanged = false;
  const flush = async () => {
    const updates = [...pending].map(([termId, courses]) => ({
      termId,
      courses,
    }));
    const codesNow = pendingCodes;
    pending = new Map();
    pendingCodes = [];
    if (options.dryRun) return;
    if (codesNow.length > 0) {
      try {
        const published = await publishHistory({ store, now, log, updates });
        result.written += published.written;
        result.errors.push(...published.errors);
        // A course is done only once every term it touched took it.
        if (
          published.failedTerms.length === 0 &&
          published.failedDepts.length === 0
        ) {
          for (const code of codesNow) {
            done.add(code);
            emptyOnce.delete(code);
          }
          cursorChanged = true;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        result.errors.push(`merge: ${message}`);
        log.error("A backfill merge failed; its courses stay to do", {
          error: message,
        });
      }
    }
    if (!cursorChanged) return;
    try {
      await writeJson(store, HISTORY_BACKFILL_KEY, {
        done: [...done].sort(),
        emptyOnce: [...emptyOnce].sort(),
        doneEmpty: [...doneEmpty].sort(),
      });
      cursorChanged = false;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.errors.push(`progress: ${message}`);
    }
  };

  const maxFailuresInARow = options.maxFailuresInARow ?? 5;
  let failuresInARow = 0;
  for (const [i, code] of batch.entries()) {
    const failing = failuresInARow >= maxFailuresInARow;
    if (failing || options.shouldStop?.()) {
      result.stoppedEarly = true;
      result.left = batch.length - i;
      if (failing)
        result.errors.push(
          `stopped: ${failuresInARow} courses in a row failed, so PlanetTerp may be down`,
        );
      break;
    }
    try {
      const rows = await politely(() => fetchGrades(http, code));
      result.fetched++;
      failuresInARow = 0;
      if (rows?.length === 0) {
        // PlanetTerp answers `[]` for a course it knows but has no grades
        // for (a renamed course's grades stay under its old code). A glitch
        // could look the same, so only a second `[]`, on a later run, counts.
        result.emptyAnswers++;
        if (emptyOnce.delete(code)) {
          doneEmpty.add(code);
          result.markedEmpty++;
        } else {
          emptyOnce.add(code);
        }
        cursorChanged = true;
        continue;
      }
      if (!rows) {
        result.noGrades++;
      } else {
        const meta = metas.get(code) ?? null;
        for (const [termId, courses] of historyFromPlanetTerpGrades(
          rows.map((r) => ({
            course: r.course,
            professor: r.professor,
            semester: r.semester,
            section: r.section,
          })),
          () => meta,
        )) {
          const list = pending.get(termId) ?? [];
          list.push(...courses);
          pending.set(termId, list);
          result.byTerm[termId] = (result.byTerm[termId] ?? 0) + courses.length;
        }
      }
      pendingCodes.push(code);
    } catch (error) {
      result.failed++;
      failuresInARow++;
      const message = error instanceof Error ? error.message : String(error);
      result.errors.push(`${code}: ${message}`);
      log.warn(`Skipped ${code}; a rerun tries it again`, { error: message });
    }
    if (pendingCodes.length >= flushEvery) await flush();
  }
  await flush();
  return result;
}

/**
 * `listCourses` through `listCache` when there is one: a saved listing for
 * the same departments is used as it is, and a complete fresh one is saved.
 * A `courses` run is never cached: it asks about each course anyway.
 */
async function cachedListing(
  options: BackfillOptions,
  politely: <T>(request: () => Promise<T>) => Promise<T>,
  result: BackfillResult,
): Promise<Map<string, PlanetTerpCourseMeta | null>> {
  const cache = options.courses ? undefined : options.listCache;
  if (!cache) return listCourses(options, politely, result);
  const scope = options.departments?.length
    ? options.departments
        .map((d) => d.toUpperCase())
        .sort()
        .join(",")
    : "all";
  try {
    const text = await cache.read();
    if (text !== null) {
      const saved = ListingCacheSchema.parse(JSON.parse(text));
      if (saved.scope === scope) {
        result.listingCached = true;
        return new Map(Object.entries(saved.courses));
      }
      options.log.info("The saved listing is for other departments", {
        saved: saved.scope,
        scope,
      });
    }
  } catch (error) {
    options.log.warn("Ignoring an unreadable saved listing", {
      error: String(error),
    });
  }
  const metas = await listCourses(options, politely, result);
  // An incomplete listing isn't saved, so the next run lists again.
  if (result.listingComplete) {
    try {
      await cache.write(
        JSON.stringify({
          scope,
          courses: Object.fromEntries(
            [...metas].map(([code, meta]) => [
              code,
              meta ?? { title: null, credits: null },
            ]),
          ),
        }),
      );
    } catch (error) {
      result.errors.push(`saving the listing: ${String(error)}`);
    }
  }
  return metas;
}

/** Course code → what PlanetTerp says about it, for the courses this run covers. */
async function listCourses(
  options: BackfillOptions,
  politely: <T>(request: () => Promise<T>) => Promise<T>,
  result: BackfillResult,
): Promise<Map<string, PlanetTerpCourseMeta | null>> {
  const { http } = options;
  const out = new Map<string, PlanetTerpCourseMeta | null>();
  if (options.courses) {
    for (const raw of options.courses) {
      const code = CourseCodeSchema.safeParse(raw.trim().toUpperCase());
      if (!code.success) {
        result.errors.push(`${raw} isn't a course code`);
        continue;
      }
      try {
        const course = CourseListingSchema.parse(
          await politely(() =>
            http.json(
              `${PLANETTERP_API}/course?name=${encodeURIComponent(code.data)}`,
            ),
          ),
        );
        out.set(code.data, { title: course.title, credits: course.credits });
      } catch (error) {
        // Still worth asking for its grades; the record just has no title.
        result.errors.push(`${code.data} details: ${String(error)}`);
        out.set(code.data, null);
      }
    }
    return out;
  }
  const scopes = options.departments?.length
    ? options.departments.map((d) => `&department=${encodeURIComponent(d)}`)
    : [""];
  const page = async (offset: number, scope: string) =>
    z
      .array(CourseListingSchema)
      .parse(
        await politely(() =>
          http.json(
            `${PLANETTERP_API}/courses?limit=${PAGE_SIZE}&offset=${offset}${scope}`,
          ),
        ),
      );
  for (const scope of scopes) {
    let offset = 0;
    let next: z.infer<typeof CourseListingSchema>[] | null = null;
    try {
      for (;;) {
        const courses = next ?? (await page(offset, scope));
        next = null;
        for (const course of courses) {
          const code = CourseCodeSchema.safeParse(
            course.name.trim().toUpperCase(),
          );
          if (code.success)
            out.set(code.data, {
              title: course.title,
              credits: course.credits,
            });
        }
        offset += PAGE_SIZE;
        if (courses.length === PAGE_SIZE) continue;
        // A short page usually ends the list, but a truncated one looks the
        // same: only an empty page after it says so.
        const after = await page(offset, scope);
        if (after.length === 0) break;
        result.listingComplete = false;
        result.errors.push(
          `listing${scope}: the page at offset ${offset - PAGE_SIZE} had ${courses.length} courses, but more followed`,
        );
        next = after;
      }
    } catch (error) {
      result.listingComplete = false;
      result.errors.push(
        `listing${scope}: stopped at offset ${offset}: ${String(error)}; a rerun lists again`,
      );
    }
  }
  return out;
}
