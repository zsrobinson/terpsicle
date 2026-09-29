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
// for every course, about 3–4 hours.

/** Courses already backfilled, so a rerun picks up where one stopped. */
export const HISTORY_BACKFILL_KEY = `${JOBS_PREFIX}history/backfill.json`;
const ProgressSchema = z.object({ done: z.array(z.string()) });

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
  sleep?: (ms: number) => Promise<void>;
}

export interface BackfillResult {
  /** Courses PlanetTerp listed that this run could take. */
  listed: number;
  /** Skipped: backfilled by an earlier run. */
  alreadyDone: number;
  fetched: number;
  /** PlanetTerp had no grades for them. */
  noGrades: number;
  failed: number;
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
    failed: 0,
    byTerm: {},
    written: 0,
    errors: [],
  };
  let requests = 0;
  const politely = async <T>(request: () => Promise<T>): Promise<T> => {
    if (requests++ > 0) await sleep(delayMs);
    return request();
  };

  const metas = await listCourses(options, politely, result);
  const progress = (await readJsonOrNull(
    store,
    HISTORY_BACKFILL_KEY,
    ProgressSchema,
    log,
  )) ?? { done: [] };
  const done = new Set(progress.done);
  const codes = [...metas.keys()].sort();
  result.listed = codes.length;
  const todo = codes.filter((c) => !done.has(c));
  result.alreadyDone = codes.length - todo.length;
  const batch =
    options.limit === undefined ? todo : todo.slice(0, options.limit);

  let pending = new Map<TermId, HistoryCourse[]>();
  let pendingCodes: string[] = [];
  const flush = async () => {
    if (pendingCodes.length === 0) return;
    const updates = [...pending].map(([termId, courses]) => ({
      termId,
      courses,
    }));
    const codesNow = pendingCodes;
    pending = new Map();
    pendingCodes = [];
    if (options.dryRun) return;
    try {
      const published = await publishHistory({ store, now, log, updates });
      result.written += published.written;
      result.errors.push(...published.errors);
      // A course is done only once every term it touched took it.
      if (published.failedTerms.length > 0 || published.failedDepts.length > 0)
        return;
      for (const code of codesNow) done.add(code);
      await writeJson(store, HISTORY_BACKFILL_KEY, {
        done: [...done].sort(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.errors.push(`merge: ${message}`);
      log.error("A backfill merge failed; its courses stay to do", {
        error: message,
      });
    }
  };

  for (const code of batch) {
    try {
      const rows = await politely(() => fetchGrades(http, code));
      result.fetched++;
      if (!rows || rows.length === 0) {
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
      const message = error instanceof Error ? error.message : String(error);
      result.errors.push(`${code}: ${message}`);
      log.warn(`Skipped ${code}; a rerun tries it again`, { error: message });
    }
    if (pendingCodes.length >= flushEvery) await flush();
  }
  await flush();
  return result;
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
  for (const scope of scopes) {
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const page = z
        .array(CourseListingSchema)
        .parse(
          await politely(() =>
            http.json(
              `${PLANETTERP_API}/courses?limit=${PAGE_SIZE}&offset=${offset}${scope}`,
            ),
          ),
        );
      for (const course of page) {
        const code = CourseCodeSchema.safeParse(
          course.name.trim().toUpperCase(),
        );
        if (code.success)
          out.set(code.data, { title: course.title, credits: course.credits });
      }
      if (page.length < PAGE_SIZE) break;
    }
  }
  return out;
}
