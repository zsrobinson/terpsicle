import { z } from "zod";
import {
  changesKey,
  DeptChunkSchema,
  deptChunkKey,
  JOBS_PREFIX,
  type Manifest,
  type ManifestDepartment,
  ManifestSchema,
  manifestKey,
  SCHEMA_VERSIONS,
  seatsKey,
  TERMS_KEY,
  TermsFileSchema,
} from "~/core/schema";
import type { BlobStore } from "./blob-store";
import { type HttpClient, MAX_CONCURRENCY, mapLimit } from "./http";
import {
  type Logger,
  readJson,
  readJsonOrNull,
  updatePointer,
  writeHashed,
  writeJson,
} from "./publish";
import { buildDeptChunk } from "./soc/chunk";
import {
  fetchDepartmentPage,
  fetchDepartments,
  fetchSections,
  fetchTerms,
} from "./soc/client";
import type { RawCourseSections } from "./soc/parse-sections";
import { activeTermIds, mergeTerms } from "./soc/terms";

// The catalog job (DATA.md §2–3): Testudo's term list → terms.json, then per
// active term every department page plus its sections → one hashed chunk per
// department and the term manifest. Unchanged departments keep their hash and
// aren't rewritten.

export interface CatalogOptions {
  http: HttpClient;
  store: BlobStore;
  now: Date;
  log: Logger;
  /** Limit to these terms (scripts); default: every active term. */
  terms?: readonly string[];
  /** Limit to these departments (scripts, tests). Others keep their previous entry. */
  departments?: readonly string[];
}

export interface CatalogResult {
  terms: number;
  archived: number;
  departments: number;
  written: number;
  unchanged: number;
  failed: number;
  courses: number;
  sections: number;
  deleted: number;
  errors: string[];
}

/** Every building code seen with one room, kept for the buildings job's popup lookups. */
export const BUILDING_ROOMS_KEY = `${JOBS_PREFIX}catalog/building-rooms.json`;
export const BuildingRoomsSchema = z.object({
  codes: z.record(
    z.string(),
    z.object({ room: z.string().nullable(), lastSeen: z.string() }),
  ),
});
export type BuildingRooms = z.infer<typeof BuildingRoomsSchema>;

const orphansKey = (termId: string) =>
  `${JOBS_PREFIX}catalog/${termId}/orphans.json`;
const OrphansSchema = z.object({ firstSeen: z.record(z.string(), z.string()) });

/** Hashed files no manifest references are deleted once they've been orphaned this long. */
export const ORPHAN_GRACE_MS = 24 * 3600 * 1000;

export async function runCatalog(
  options: CatalogOptions,
): Promise<CatalogResult> {
  const { http, store, now, log } = options;
  const result: CatalogResult = {
    terms: 0,
    archived: 0,
    departments: 0,
    written: 0,
    unchanged: 0,
    failed: 0,
    courses: 0,
    sections: 0,
    deleted: 0,
    errors: [],
  };

  const dropdown = await fetchTerms(http);
  const termsFile = await updatePointer(
    store,
    TERMS_KEY,
    TermsFileSchema,
    (current) => mergeTerms(current, dropdown, now),
  );
  // biome-ignore lint/style/noNonNullAssertion: updatePointer returns the written value when `change` returns one.
  const terms = termsFile!;
  result.archived = terms.terms.filter((t) => t.status === "archived").length;

  const wanted = options.terms ? new Set(options.terms) : null;
  const termIds = activeTermIds(terms).filter(
    (id) => !wanted || wanted.has(id),
  );
  const rooms: BuildingRooms["codes"] = {};

  for (const termId of termIds) {
    result.terms++;
    // One term failing (its department list didn't load) mustn't stop the others.
    try {
      await crawlTerm(options, termId, result, rooms);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.errors.push(`${termId}: ${message}`);
      options.log.error(`Left ${termId} as it was`, { error: message });
    }
  }
  if (result.terms > 0 && result.departments === 0) {
    throw new Error(
      `No term could be crawled: ${result.errors.slice(0, 3).join("; ")}`,
    );
  }

  if (Object.keys(rooms).length > 0) {
    const previous = await readJsonOrNull(
      store,
      BUILDING_ROOMS_KEY,
      BuildingRoomsSchema,
      log,
    );
    await writeJson(store, BUILDING_ROOMS_KEY, {
      codes: { ...(previous?.codes ?? {}), ...rooms },
    } satisfies BuildingRooms);
  }
  return result;
}

async function crawlTerm(
  options: CatalogOptions,
  termId: string,
  result: CatalogResult,
  rooms: BuildingRooms["codes"],
): Promise<void> {
  const { http, store, now, log } = options;
  const previous = await readJson(
    store,
    manifestKey(termId),
    ManifestSchema,
  ).catch((error: unknown) => {
    log.warn(`Rebuilding ${termId}: previous manifest unreadable`, {
      error: String(error),
    });
    return null;
  });
  // A schema bump republishes everything (DATA.md §2.3).
  const previousDepts = new Map(
    previous?.schemaVersion === SCHEMA_VERSIONS.catalog
      ? previous.departments.map((d) => [d.code, d])
      : [],
  );

  const listed = await fetchDepartments(http, termId);
  const onlyDepts = options.departments ? new Set(options.departments) : null;
  const entries = await mapLimit(listed, MAX_CONCURRENCY, async (dept) => {
    const prior = previousDepts.get(dept.code) ?? null;
    if (onlyDepts && !onlyDepts.has(dept.code)) return prior;
    try {
      return await crawlDepartment(options, termId, dept, prior, result, rooms);
    } catch (error) {
      result.failed++;
      const message = error instanceof Error ? error.message : String(error);
      result.errors.push(`${termId} ${dept.code}: ${message}`);
      log.error(`Kept the previous ${termId} ${dept.code}`, { error: message });
      return prior;
    }
  });
  const departments = entries
    .filter((d): d is ManifestDepartment => d !== null)
    .sort((a, b) => (a.code < b.code ? -1 : 1));
  if (departments.length === 0) {
    throw new Error(
      `${termId}: no department could be crawled; left the manifest alone`,
    );
  }
  result.departments += departments.length;

  const at = now.toISOString();
  const manifest = await updatePointer(
    store,
    manifestKey(termId),
    ManifestSchema,
    (current) => ({
      schemaVersion: SCHEMA_VERSIONS.catalog,
      termId,
      generatedAt: at,
      catalogCrawledAt: at,
      departments,
      seats: current?.seats ?? null,
      changes: current?.changes ?? null,
    }),
  );
  if (manifest)
    result.deleted += await collectGarbage(store, termId, manifest, now, log);
}

async function crawlDepartment(
  options: CatalogOptions,
  termId: string,
  dept: { code: string; name: string },
  prior: ManifestDepartment | null,
  result: CatalogResult,
  rooms: BuildingRooms["codes"],
): Promise<ManifestDepartment | null> {
  const { http, store, now } = options;
  const page = await fetchDepartmentPage(http, termId, dept.code);
  if (page.courses.length === 0) return null;
  const withSections = page.courses
    .filter((c) => !c.individualInstruction)
    .map((c) => c.code);
  const sections: RawCourseSections[] = [];
  if (withSections.length > 0) {
    await fetchSections(http, termId, withSections, (c) => sections.push(c));
  }
  const built = buildDeptChunk(termId, dept.code, page, sections);
  const { hash, written } = await writeHashed(
    store,
    DeptChunkSchema,
    built.chunk,
    (h) => deptChunkKey(termId, dept.code, h),
    `${termId} ${dept.code}`,
    prior?.hash ?? null,
  );
  if (written) result.written++;
  else result.unchanged++;

  let sectionCount = 0;
  const seenAt = now.toISOString();
  for (const course of built.chunk.courses) {
    sectionCount += course.sections.length;
    for (const section of course.sections) {
      for (const m of section.meetings) {
        if (m.building) rooms[m.building] = { room: m.room, lastSeen: seenAt };
      }
    }
  }
  result.courses += built.chunk.courses.length;
  result.sections += sectionCount;
  return {
    code: dept.code,
    name: page.deptName ?? dept.name ?? dept.code,
    hash,
    courseCount: built.chunk.courses.length,
    sectionCount,
  };
}

/**
 * Deletes hashed files under the term that no manifest references and that
 * have been orphaned for over 24 h (DATA.md §2.4). Orphan times live in
 * `_jobs/` because BlobStore doesn't expose upload times.
 */
async function collectGarbage(
  store: BlobStore,
  termId: string,
  manifest: Manifest,
  now: Date,
  log: Logger,
): Promise<number> {
  const referenced = new Set<string>([
    ...manifest.departments.map((d) => deptChunkKey(termId, d.code, d.hash)),
  ]);
  if (manifest.seats) referenced.add(seatsKey(termId, manifest.seats.hash));
  if (manifest.changes)
    referenced.add(changesKey(termId, manifest.changes.hash));

  const hashed = /\.[0-9a-f]{16}\.json$/;
  const keys = (await store.list(`catalog/${termId}/`)).filter(
    (k) => hashed.test(k) && !referenced.has(k),
  );
  const previous = await readJsonOrNull(
    store,
    orphansKey(termId),
    OrphansSchema,
    log,
  );
  const firstSeen: Record<string, string> = {};
  let deleted = 0;
  for (const key of keys) {
    const since = previous?.firstSeen[key] ?? now.toISOString();
    if (now.getTime() - Date.parse(since) >= ORPHAN_GRACE_MS) {
      await store.delete(key);
      deleted++;
    } else {
      firstSeen[key] = since;
    }
  }
  await writeJson(store, orphansKey(termId), { firstSeen });
  return deleted;
}
