import { z } from "zod";
import {
  type CatalogChange,
  type ChangesFile,
  ChangesFileSchema,
  changesKey,
  type DeptChunk,
  DeptChunkSchema,
  deptChunkKey,
  JOBS_PREFIX,
  type Manifest,
  type ManifestDepartment,
  ManifestSchema,
  manifestKey,
  SCHEMA_VERSIONS,
  type SeatsFile,
  SeatsFileSchema,
  type SeatTuple,
  type Section,
  SectionSchema,
  type SectionSnapshot,
  SectionSnapshotSchema,
  seatsKey,
  TERMS_KEY,
  TermsFileSchema,
} from "~/core/schema";
import type { BlobStore } from "./blob-store";
import { contentHash } from "./hash";
import { type HttpClient, MAX_CONCURRENCY, mapLimit } from "./http";
import {
  type Logger,
  readJson,
  readJsonOrNull,
  updatePointer,
  writeHashed,
  writeJson,
} from "./publish";
import { fetchDepartmentPage, fetchSections } from "./soc/client";
import { normalizeSections } from "./soc/normalize";
import { activeTermIds } from "./soc/terms";
import { parseSeatsStamp } from "./time";

// The seats job (every 5 min, 30 s CPU; DATA.md §3.2–3.3): per active term,
// the sections endpoint for every department → seats file, section changes
// (added/changed/removed) and, when a department's sections changed, its
// chunk. Terms whose "Open Seats as of" stamp hasn't moved are skipped, with a
// full refresh at least hourly in case the stamp is stale.

/** Refresh a term at least this often even when Testudo's stamp hasn't moved. */
export const FULL_REFRESH_MS = 60 * 60 * 1000;
/** The changes file keeps this much history. */
export const CHANGES_WINDOW_MS = 30 * 24 * 3600 * 1000;

const baselineKey = (termId: string) =>
  `${JOBS_PREFIX}seats/${termId}/baseline.json`;

const DeptStateSchema = z.object({
  /** The chunk this state was taken from. */
  chunkHash: z.string(),
  courses: z.array(z.string()),
  /** Hash of the chunk's sections, to tell whether a crawl changed them. */
  sectionsHash: z.string(),
});

/** The seats job's memory between runs. Not served. */
const BaselineSchema = z.object({
  createdAt: z.string(),
  /** Testudo's "Open Seats as of" text on the last full run; null if the page had none. */
  stamp: z.string().nullable(),
  fullAt: z.string(),
  depts: z.record(z.string(), DeptStateSchema),
  /** Section key → JSON of its `SectionSnapshot`, for diffing. */
  snapshots: z.record(z.string(), z.string()),
});
type Baseline = z.infer<typeof BaselineSchema>;

export interface SeatsOptions {
  http: HttpClient;
  store: BlobStore;
  now: Date;
  log: Logger;
  terms?: readonly string[];
  /** Ignore the stamp check (scripts). */
  force?: boolean;
  /**
   * Called after a term's new seats file is published (its counts changed),
   * with the previous file. The Worker sends seat alerts from here; a
   * failure is recorded, never fatal.
   */
  onSeatsPublished?: (
    before: SeatsFile | null,
    after: SeatsFile,
  ) => Promise<void>;
}

export interface SeatsTermResult {
  termId: string;
  status: "refreshed" | "unchanged" | "skipped";
  reason?: string;
  sections: number;
  changes: number;
  rewrittenDepartments: number;
  failedDepartments: number;
}

export interface SeatsResult {
  terms: SeatsTermResult[];
  errors: string[];
}

export async function runSeats(options: SeatsOptions): Promise<SeatsResult> {
  const { store } = options;
  const terms = await readJson(store, TERMS_KEY, TermsFileSchema);
  if (!terms)
    throw new Error(`${TERMS_KEY} is missing; run the catalog job first`);
  const wanted = options.terms ? new Set(options.terms) : null;
  const result: SeatsResult = { terms: [], errors: [] };
  for (const termId of activeTermIds(terms)) {
    if (wanted && !wanted.has(termId)) continue;
    try {
      result.terms.push(await refreshTerm(options, termId, result.errors));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.errors.push(`${termId}: ${message}`);
      options.log.error(`Seats for ${termId} failed`, { error: message });
    }
  }
  return result;
}

function snapshotOf(section: Section): SectionSnapshot {
  return {
    instructors: section.instructors,
    delivery: section.delivery,
    meetings: section.meetings,
    ...(section.dates ? { dates: section.dates } : {}),
  };
}

async function sectionsHash(
  courses: readonly { code: string; sections: readonly Section[] }[],
): Promise<string> {
  return contentHash(JSON.stringify(courses.map((c) => [c.code, c.sections])));
}

async function loadChunk(
  store: BlobStore,
  termId: string,
  dept: ManifestDepartment,
): Promise<DeptChunk> {
  const key = deptChunkKey(termId, dept.code, dept.hash);
  const chunk = await readJson(store, key, DeptChunkSchema);
  if (!chunk)
    throw new Error(`${key} is in the manifest but missing from storage`);
  return chunk;
}

async function refreshTerm(
  options: SeatsOptions,
  termId: string,
  errors: string[],
): Promise<SeatsTermResult> {
  const { http, store, now, log } = options;
  const base: SeatsTermResult = {
    termId,
    status: "skipped",
    sections: 0,
    changes: 0,
    rewrittenDepartments: 0,
    failedDepartments: 0,
  };
  const manifest = await readJson(store, manifestKey(termId), ManifestSchema);
  if (!manifest || manifest.departments.length === 0) {
    return { ...base, reason: "no catalog yet" };
  }
  if (manifest.schemaVersion !== SCHEMA_VERSIONS.catalog) {
    return {
      ...base,
      reason: "catalog schema version differs; waiting for the catalog job",
    };
  }
  const baseline = await readJsonOrNull(
    store,
    baselineKey(termId),
    BaselineSchema,
    log,
  );

  // The stamp lives on department pages only; the smallest one is cheapest.
  const probe = [...manifest.departments].sort(
    (a, b) => a.courseCount - b.courseCount,
  )[0];
  // biome-ignore lint/style/noNonNullAssertion: departments is non-empty (checked above).
  const stamp = (await fetchDepartmentPage(http, termId, probe!.code))
    .seatsAsOf;
  const fresh =
    baseline !== null &&
    now.getTime() - Date.parse(baseline.fullAt) < FULL_REFRESH_MS;
  if (!options.force && fresh && baseline?.stamp === stamp) {
    return {
      ...base,
      status: "unchanged",
      reason: `stamp ${stamp ?? "absent"}`,
    };
  }

  const previousSeats = manifest.seats
    ? await readJsonOrNull(
        store,
        seatsKey(termId, manifest.seats.hash),
        SeatsFileSchema,
        log,
      )
    : null;

  const seats = new Map<string, SeatTuple>();
  const snapshots: Record<string, string> = {};
  const depts: Baseline["depts"] = {};
  const rewritten = new Map<string, { from: string; to: ManifestDepartment }>();
  const crawledDepts = new Set<string>();
  let failed = 0;

  await mapLimit(manifest.departments, MAX_CONCURRENCY, async (dept) => {
    let state = baseline?.depts[dept.code];
    let chunk: DeptChunk | null = null;
    try {
      if (!state || state.chunkHash !== dept.hash) {
        chunk = await loadChunk(store, termId, dept);
        state = {
          chunkHash: dept.hash,
          courses: chunk.courses.map((c) => c.code),
          sectionsHash: await sectionsHash(chunk.courses),
        };
      }
      const byCourse = new Map<string, Section[]>();
      await fetchSections(http, termId, state.courses, (raw) => {
        const code = raw.course.toUpperCase();
        const normalized = normalizeSections(raw);
        // Strip fields the schema doesn't publish, so hashes match the chunk.
        byCourse.set(code, z.array(SectionSchema).parse(normalized.sections));
        for (const [section, tuple] of normalized.seats)
          seats.set(`${code}-${section}`, tuple);
      });
      const crawled = state.courses.map((code) => ({
        code,
        sections: byCourse.get(code) ?? [],
      }));
      for (const course of crawled) {
        for (const section of course.sections) {
          snapshots[`${course.code}-${section.code}`] = JSON.stringify(
            snapshotOf(section),
          );
        }
      }
      crawledDepts.add(dept.code);
      const hash = await sectionsHash(crawled);
      if (hash !== state.sectionsHash) {
        chunk ??= await loadChunk(store, termId, dept);
        const next = rebuildChunk(chunk, byCourse);
        const written = await writeHashed(
          store,
          DeptChunkSchema,
          next,
          (h) => deptChunkKey(termId, dept.code, h),
          `${termId} ${dept.code}`,
          dept.hash,
        );
        const sectionCount = next.courses.reduce(
          (n, c) => n + c.sections.length,
          0,
        );
        rewritten.set(dept.code, {
          from: dept.hash,
          to: { ...dept, hash: written.hash, sectionCount },
        });
        state = {
          chunkHash: written.hash,
          courses: state.courses,
          sectionsHash: hash,
        };
      }
      depts[dept.code] = state;
    } catch (error) {
      failed++;
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${termId} ${dept.code}: ${message}`);
      log.error(`Kept previous seats for ${termId} ${dept.code}`, {
        error: message,
      });
      if (state) depts[dept.code] = state;
    }
  });

  // Departments that failed keep their previous counts and snapshots.
  for (const dept of manifest.departments) {
    if (crawledDepts.has(dept.code)) continue;
    const prefix = dept.code;
    for (const [key, tuple] of Object.entries(previousSeats?.seats ?? {})) {
      if (key.startsWith(prefix) && !seats.has(key)) seats.set(key, tuple);
    }
    for (const [key, snap] of Object.entries(baseline?.snapshots ?? {})) {
      if (key.startsWith(prefix) && !(key in snapshots)) snapshots[key] = snap;
    }
  }
  if (crawledDepts.size === 0) {
    throw new Error("every department failed; left seats and changes alone");
  }

  const at = now.toISOString();
  const newChanges = baseline
    ? diffSnapshots(baseline.snapshots, snapshots, crawledDepts, at)
    : [];
  const seatsFile = {
    schemaVersion: SCHEMA_VERSIONS.catalog,
    termId,
    asOf: parseSeatsStamp(stamp),
    seats: Object.fromEntries([...seats].sort(([a], [b]) => (a < b ? -1 : 1))),
  };
  const seatsWrite = await writeHashed(
    store,
    SeatsFileSchema,
    seatsFile,
    (h) => seatsKey(termId, h),
    `${termId} seats`,
    manifest.seats?.hash ?? null,
  );

  const previousChanges = manifest.changes
    ? await readJsonOrNull(
        store,
        changesKey(termId, manifest.changes.hash),
        ChangesFileSchema,
        log,
      )
    : null;
  const changesFile = rollChanges(
    termId,
    previousChanges,
    newChanges,
    now,
    baseline?.createdAt ?? at,
  );
  const changesWrite = await writeHashed(
    store,
    ChangesFileSchema,
    changesFile,
    (h) => changesKey(termId, h),
    `${termId} changes`,
    manifest.changes?.hash ?? null,
  );

  await updatePointer(store, manifestKey(termId), ManifestSchema, (current) => {
    if (!current) return null;
    return {
      ...current,
      generatedAt: at,
      // Only replace chunks the catalog job hasn't replaced in the meantime.
      departments: current.departments.map((d) => {
        const change = rewritten.get(d.code);
        return change && d.hash === change.from ? change.to : d;
      }),
      seats: { hash: seatsWrite.hash, asOf: seatsFile.asOf, fetchedAt: at },
      changes: {
        hash: changesWrite.hash,
        count: changesFile.changes.length,
        latestAt: changesFile.changes[0]?.at ?? null,
      },
    } satisfies Manifest;
  });

  if (seatsWrite.written && options.onSeatsPublished) {
    try {
      await options.onSeatsPublished(
        previousSeats,
        SeatsFileSchema.parse(seatsFile),
      );
    } catch (error) {
      errors.push(
        `${termId} seat alerts: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  await writeJson(store, baselineKey(termId), {
    createdAt: baseline?.createdAt ?? at,
    stamp,
    fullAt: at,
    depts,
    snapshots,
  } satisfies Baseline);

  return {
    ...base,
    status: "refreshed",
    sections: seats.size,
    changes: newChanges.length,
    rewrittenDepartments: rewritten.size,
    failedDepartments: failed,
  };
}

/** Replaces each course's sections with the crawled ones; courses the crawl didn't return lose their sections. */
function rebuildChunk(
  chunk: DeptChunk,
  byCourse: ReadonlyMap<string, Section[]>,
): DeptChunk {
  return {
    ...chunk,
    courses: chunk.courses.map((c) => ({
      ...c,
      sections: byCourse.get(c.code) ?? [],
    })),
  };
}

/** Section-level differences between two runs, limited to departments crawled this run. */
export function diffSnapshots(
  before: Readonly<Record<string, string>>,
  after: Readonly<Record<string, string>>,
  depts: ReadonlySet<string>,
  at: string,
): CatalogChange[] {
  const changes: CatalogChange[] = [];
  const parse = (json: string) => SectionSnapshotSchema.parse(JSON.parse(json));
  for (const [key, json] of Object.entries(after)) {
    const prev = before[key];
    if (prev === undefined) {
      changes.push({ kind: "added", sectionKey: key, at, after: parse(json) });
    } else if (prev !== json) {
      changes.push({
        kind: "changed",
        sectionKey: key,
        at,
        before: parse(prev),
        after: parse(json),
      });
    }
  }
  for (const [key, json] of Object.entries(before)) {
    if (key in after || !depts.has(key.slice(0, 4))) continue;
    changes.push({
      kind: "cancelled",
      sectionKey: key,
      at,
      before: parse(json),
    });
  }
  return changes.sort((a, b) => (a.sectionKey < b.sectionKey ? -1 : 1));
}

/** Newest first, trimmed to the 30-day window. */
export function rollChanges(
  termId: string,
  previous: ChangesFile | null,
  added: readonly CatalogChange[],
  now: Date,
  trackingSince: string,
): ChangesFile {
  const windowStart = new Date(now.getTime() - CHANGES_WINDOW_MS).toISOString();
  const since = trackingSince > windowStart ? trackingSince : windowStart;
  const kept = (previous?.changes ?? []).filter((c) => c.at >= windowStart);
  return {
    schemaVersion: SCHEMA_VERSIONS.catalog,
    termId,
    since,
    changes: [...added, ...kept],
  };
}
