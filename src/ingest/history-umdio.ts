import { z } from "zod";
import { historyFromUmdioSections, type UmdioCourseMeta } from "~/core/history";
import {
  HISTORY_MANIFEST_KEY,
  JOBS_PREFIX,
  type TermId,
  TermIdSchema,
} from "~/core/schema";
import { HistoryManifestSchema } from "~/core/schema/history";
import type { BlobStore } from "./blob-store";
import { publishHistory } from "./history";
import type { HttpClient } from "./http";
import { type Logger, readJson, readJsonOrNull, writeJson } from "./publish";

// The umd.io backfill of the instructor history (DATA.md §3.5): umd.io keeps
// its own copy of Testudo's Schedule of Classes from Fall 2017 on, winter and
// summer terms included, with every section's instructors. Recorded as
// `source: umdio`, below our own records and above PlanetTerp's. By default
// it fills only the terms the history lacks (every winter and summer, and
// Summer 2025 to Spring 2026, which PlanetTerp's grades stop short of and
// our own copies start after). Run by scripts/backfill-history-umdio.ts,
// never by a cron: one request a second, in chunks that carry on from the
// last.

export const UMDIO_API = "https://api.umd.io/v1";

/** Terms already merged from umd.io, so a rerun carries on. */
export const HISTORY_UMDIO_KEY = `${JOBS_PREFIX}history/umdio.json`;
const ProgressSchema = z.object({ done: z.array(TermIdSchema) });

/** umd.io's largest page. */
const PAGE_SIZE = 100;

const SemestersSchema = z.array(
  z.union([z.string(), z.number()]).transform(String),
);

const SectionApiSchema = z.object({
  section_id: z.string(),
  semester: z.union([z.string(), z.number()]).transform(String),
  number: z.string().nullable().catch(null),
  instructors: z.array(z.string()).catch([]),
});
const SectionPageSchema = z.array(SectionApiSchema);

const CourseListSchema = z.array(
  z.object({ course_id: z.string(), name: z.string().nullable().catch(null) }),
);

/** A term's sections as far as paging has got, kept between runs. */
const PartialTermSchema = z.object({
  termId: TermIdSchema,
  /** Pages read so far (1-based pages 1…pages). */
  pages: z.number().int().min(0),
  complete: z.boolean(),
  rows: z.array(
    z.object({
      section_id: z.string(),
      semester: z.string(),
      number: z.string().nullable(),
      instructors: z.array(z.string()),
    }),
  ),
});
type PartialTerm = z.infer<typeof PartialTermSchema>;

export interface UmdioBackfillOptions {
  http: HttpClient;
  store: BlobStore;
  now: Date;
  log: Logger;
  /** Only these terms (default: every umd.io term the history lacks). */
  terms?: readonly TermId[];
  /** Wait between requests (default 1 s). */
  delayMs?: number;
  /** Fetch and count, but write nothing to the store. */
  dryRun?: boolean;
  /**
   * Where a term's pages are kept between runs (the script's `--cache`
   * folder), so a term too big for one run carries on from its last page.
   */
  cache?: {
    read(termId: TermId): Promise<string | null>;
    write(termId: TermId, text: string): Promise<void>;
  };
  /** Asked before each request: true ends the run cleanly (`--max-minutes`). */
  shouldStop?: () => boolean;
  sleep?: (ms: number) => Promise<void>;
}

export interface UmdioTermResult {
  courses: number;
  sections: number;
  /** Sections with no instructor named (TBA). */
  tba: number;
}

export interface UmdioBackfillResult {
  /** Every term umd.io has. */
  semesters: TermId[];
  /** The terms this run set out to do. */
  todo: TermId[];
  /** Skipped: merged by an earlier run. */
  alreadyDone: TermId[];
  pages: number;
  /** Terms read in full this run (merged, unless a dry run). */
  byTerm: Record<TermId, UmdioTermResult>;
  /** Terms still to do when the run stopped. */
  left: TermId[];
  stoppedEarly: boolean;
  written: number;
  errors: string[];
}

export async function backfillUmdio(
  options: UmdioBackfillOptions,
): Promise<UmdioBackfillResult> {
  const { http, store, now, log } = options;
  const delayMs = options.delayMs ?? 1000;
  const sleep =
    options.sleep ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  let requests = 0;
  const politely = async <T>(request: () => Promise<T>): Promise<T> => {
    if (requests++ > 0) await sleep(delayMs);
    return request();
  };
  const result: UmdioBackfillResult = {
    semesters: [],
    todo: [],
    alreadyDone: [],
    pages: 0,
    byTerm: {},
    left: [],
    stoppedEarly: false,
    written: 0,
    errors: [],
  };

  const semesters = SemestersSchema.parse(
    await politely(() => http.json(`${UMDIO_API}/courses/semesters`)),
  )
    .flatMap((s) => {
      const t = TermIdSchema.safeParse(s);
      return t.success ? [t.data] : [];
    })
    .sort();
  result.semesters = semesters;
  const manifest = await readJson(
    store,
    HISTORY_MANIFEST_KEY,
    HistoryManifestSchema,
  );
  const recorded = new Set(manifest?.terms.map((t) => t.termId) ?? []);
  const progress = (await readJsonOrNull(
    store,
    HISTORY_UMDIO_KEY,
    ProgressSchema,
    log,
  )) ?? { done: [] };
  const done = new Set(progress.done);
  const wanted = options.terms
    ? options.terms.filter((t) => semesters.includes(t))
    : semesters.filter((t) => !recorded.has(t));
  for (const t of options.terms ?? [])
    if (!semesters.includes(t))
      result.errors.push(`${t}: umd.io doesn't have it`);
  result.alreadyDone = wanted.filter((t) => done.has(t));
  result.todo = wanted.filter((t) => !done.has(t));

  for (const [i, termId] of result.todo.entries()) {
    const partial = await readPartial(options, termId);
    try {
      while (!partial.complete) {
        if (options.shouldStop?.()) {
          result.stoppedEarly = true;
          break;
        }
        const page = partial.pages + 1;
        const url = `${UMDIO_API}/courses/sections?semester=${termId}&per_page=${PAGE_SIZE}&page=${page}`;
        let rows = SectionPageSchema.parse(
          await politely(() => http.json(url)),
        );
        result.pages++;
        // The term ends at the first empty page. One straight after a full
        // page could be a glitch rather than the end, and taking it would
        // record a truncated term, so it's asked once more.
        if (rows.length === 0 && partial.rows.length % PAGE_SIZE === 0) {
          rows = SectionPageSchema.parse(await politely(() => http.json(url)));
          result.pages++;
        }
        if (rows.length === 0) partial.complete = true;
        else {
          partial.pages = page;
          partial.rows.push(...rows);
        }
        await options.cache?.write(termId, JSON.stringify(partial));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.errors.push(`${termId} page ${partial.pages + 1}: ${message}`);
      log.warn(`Stopped reading ${termId}; a rerun carries on`, {
        error: message,
      });
      result.left = result.todo.slice(i);
      result.stoppedEarly = true;
      break;
    }
    if (!partial.complete) {
      result.left = result.todo.slice(i);
      break;
    }
    if (partial.rows.length === 0) {
      // Never record a term from an empty answer (DATA.md §4.1).
      result.errors.push(`${termId}: umd.io listed no sections`);
      continue;
    }
    let titles = new Map<string, UmdioCourseMeta>();
    try {
      titles = new Map(
        CourseListSchema.parse(
          await politely(() =>
            http.json(`${UMDIO_API}/courses/list?semester=${termId}`),
          ),
        ).map((c) => [c.course_id.toUpperCase(), { title: c.name }]),
      );
    } catch (error) {
      // Titles are a nicety: a course keeps any title another term gives it.
      result.errors.push(`${termId} titles: ${String(error)}`);
    }
    const courses = historyFromUmdioSections(
      termId,
      partial.rows,
      (code) => titles.get(code) ?? null,
    );
    const sections = courses.flatMap((c) => c.sections);
    result.byTerm[termId] = {
      courses: courses.length,
      sections: sections.length,
      tba: sections.filter((s) => s.instructors.length === 0).length,
    };
    if (options.dryRun) continue;
    const published = await publishHistory({
      store,
      now,
      log,
      updates: [{ termId, courses }],
    });
    result.written += published.written;
    result.errors.push(...published.errors);
    if (published.failedTerms.length > 0 || published.failedDepts.length > 0)
      continue;
    done.add(termId);
    await writeJson(store, HISTORY_UMDIO_KEY, { done: [...done].sort() });
  }
  return result;
}

async function readPartial(
  options: UmdioBackfillOptions,
  termId: TermId,
): Promise<PartialTerm> {
  const fresh = { termId, pages: 0, complete: false, rows: [] };
  const text = await options.cache?.read(termId);
  if (!text) return fresh;
  try {
    const parsed = PartialTermSchema.parse(JSON.parse(text));
    return parsed.termId === termId ? parsed : fresh;
  } catch {
    return fresh;
  }
}
