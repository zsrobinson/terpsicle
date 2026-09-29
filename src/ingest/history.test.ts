import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  historyCoursesFromChunk,
  historyFromPlanetTerpGrades,
} from "~/core/history";
import {
  DeptChunkSchema,
  HISTORY_MANIFEST_KEY,
  historyDeptKey,
  historyTermKey,
} from "~/core/schema";
import {
  HistoryDeptSchema,
  HistoryManifestSchema,
  HistoryTermSchema,
} from "~/core/schema/history";
import {
  aCourse,
  aHistoryCourse,
  archivedFixtureTermId,
  aSection,
  buildMockDataFiles,
  FIXTURE_NOW,
  fixtureTermId,
} from "~/fixtures";
import { createMemoryBlobStore } from "./blob-store";
import {
  HISTORY_STATE_KEY,
  HistoryUnreadableError,
  publishHistory,
  snapshotHistory,
} from "./history";
import { backfillHistory, HISTORY_BACKFILL_KEY } from "./history-backfill";
import { createHttpClient } from "./http";
import { readJson, silentLogger, writeJson } from "./publish";

const FIXTURES = new URL("./__fixtures__/", import.meta.url);
const fixture = (path: string) =>
  JSON.parse(readFileSync(new URL(path, FIXTURES), "utf8"));
const now = new Date(FIXTURE_NOW);
const log = silentLogger;

/** The mock bucket's catalog, without any history in it. */
async function catalogStore() {
  const files = await buildMockDataFiles();
  return createMemoryBlobStore(
    Object.fromEntries(
      [...files].filter(([key]) => !key.startsWith("history/")),
    ),
  );
}

async function manifestOf(store: ReturnType<typeof createMemoryBlobStore>) {
  const manifest = await readJson(
    store,
    HISTORY_MANIFEST_KEY,
    HistoryManifestSchema,
  );
  if (!manifest) throw new Error("no history manifest");
  return manifest;
}

describe("golden: saved real pages → history records", () => {
  it("reads Testudo's department chunks", async () => {
    const courses = ["AGNR", "ARMY", "BUSI", "IDEA"].flatMap((dept) =>
      historyCoursesFromChunk(
        DeptChunkSchema.parse(fixture(`golden/202701-${dept}.json`)).courses,
      ),
    );
    const term = HistoryTermSchema.parse({
      schemaVersion: 1,
      termId: "202701",
      courses,
    });
    await expect(`${JSON.stringify(term, null, 1)}\n`).toMatchFileSnapshot(
      "./__fixtures__/golden/history-202701.json",
    );
  });

  it("reads PlanetTerp's grade rows for CMSC351, padding its short section numbers", async () => {
    const course = fixture("planetterp/course-CMSC351.json");
    const byTerm = historyFromPlanetTerpGrades(
      fixture("planetterp/grades-CMSC351.json"),
      () => ({ title: course.title, credits: course.credits }),
    );
    const out = Object.fromEntries(
      [...byTerm]
        .sort(([a], [b]) => (a < b ? 1 : -1))
        .map(([termId, courses]) => [
          termId,
          HistoryTermSchema.parse({ schemaVersion: 1, termId, courses })
            .courses,
        ]),
    );
    expect(Object.keys(out)).toHaveLength(27);
    for (const courses of Object.values(out))
      for (const s of courses[0]?.sections ?? [])
        expect(s.code).toMatch(/^\d{4}$/);
    await expect(`${JSON.stringify(out, null, 1)}\n`).toMatchFileSnapshot(
      "./__fixtures__/golden/history-planetterp-CMSC351.json",
    );
  });
});

describe("snapshotHistory", () => {
  it("records every term's catalog, then reads only what changed", async () => {
    const store = await catalogStore();
    const first = await snapshotHistory({ store, now, log });
    expect(first.errors).toEqual([]);
    expect(first.chunks).toBeGreaterThan(0);
    expect(first.pending).toBe(0);

    const manifest = await manifestOf(store);
    expect(manifest.terms.map((t) => t.termId)).toEqual([
      fixtureTermId,
      archivedFixtureTermId,
    ]);
    const cmsc = manifest.departments.find((d) => d.code === "CMSC");
    if (!cmsc) throw new Error("no CMSC");
    const dept = await readJson(
      store,
      historyDeptKey("CMSC", cmsc.hash),
      HistoryDeptSchema,
    );
    const offered = dept?.courses.find((c) => c.code === "CMSC351");
    expect(offered?.offerings[0]?.termId).toBe(fixtureTermId);
    expect(offered?.offerings[0]?.source).toBe("terpsicle");

    const writes = store.writes.length;
    const second = await snapshotHistory({ store, now, log });
    expect(second.chunks).toBe(0);
    // Nothing changed, so nothing is written, not even the job state.
    expect(store.writes.slice(writes)).toEqual([]);
  });

  it("spreads a first run over several when there's a lot to copy", async () => {
    const store = await catalogStore();
    const first = await snapshotHistory({ store, now, log, maxChunks: 2 });
    expect(first.chunks).toBe(2);
    expect(first.pending).toBeGreaterThan(0);
    const rest = await snapshotHistory({ store, now, log });
    expect(rest.chunks).toBe(first.pending);
    expect(rest.pending).toBe(0);
  });

  it("keeps a term after its catalog can't be read any more", async () => {
    const store = await catalogStore();
    await snapshotHistory({ store, now, log });
    const before = await manifestOf(store);
    // A catalog schema bump leaves an archived term unreadable.
    await store.put(
      `catalog/${archivedFixtureTermId}/manifest.json`,
      JSON.stringify({ schemaVersion: 99 }),
    );
    const again = await snapshotHistory({ store, now, log });
    expect(again.errors).toHaveLength(1);
    expect((await manifestOf(store)).terms).toEqual(before.terms);
  });
});

describe("publishHistory", () => {
  it("lets our own record replace PlanetTerp's, in either order", async () => {
    const store = createMemoryBlobStore();
    const theirs = aHistoryCourse({
      source: "planetterp",
      instructors: ["Clyde Kruskal"],
      sections: [{ code: "0101", instructors: ["Clyde Kruskal"] }],
    });
    await publishHistory({
      store,
      now,
      log,
      updates: [{ termId: fixtureTermId, courses: [theirs] }],
    });
    await publishHistory({
      store,
      now,
      log,
      updates: [{ termId: fixtureTermId, courses: [aHistoryCourse()] }],
    });
    await publishHistory({
      store,
      now,
      log,
      updates: [{ termId: fixtureTermId, courses: [theirs] }],
    });
    const [entry] = (await manifestOf(store)).terms;
    expect(entry?.courses).toEqual({ terpsicle: 1, planetterp: 0 });
    if (!entry) throw new Error("no term");
    const term = await readJson(
      store,
      historyTermKey(fixtureTermId, entry.hash),
      HistoryTermSchema,
    );
    expect(term?.courses).toEqual([aHistoryCourse()]);
  });

  it("writes nothing when the manifest can't be read", async () => {
    const store = createMemoryBlobStore({
      [HISTORY_MANIFEST_KEY]: JSON.stringify({ schemaVersion: 99 }),
    });
    await expect(
      publishHistory({
        store,
        now,
        log,
        updates: [{ termId: fixtureTermId, courses: [aHistoryCourse()] }],
      }),
    ).rejects.toBeInstanceOf(HistoryUnreadableError);
    expect(store.writes).toEqual([]);
  });

  it("reports a term whose file went missing and leaves it alone", async () => {
    const store = createMemoryBlobStore();
    await publishHistory({
      store,
      now,
      log,
      updates: [{ termId: fixtureTermId, courses: [aHistoryCourse()] }],
    });
    const [entry] = (await manifestOf(store)).terms;
    if (!entry) throw new Error("no term");
    await store.delete(historyTermKey(fixtureTermId, entry.hash));
    const result = await publishHistory({
      store,
      now,
      log,
      updates: [
        {
          termId: fixtureTermId,
          courses: [aHistoryCourse({ code: "CMSC250" })],
        },
      ],
    });
    expect(result.failedTerms).toEqual([fixtureTermId]);
    expect((await manifestOf(store)).terms).toEqual([entry]);
  });
});

describe("the job state", () => {
  it("copies a changed chunk again, and only that one", async () => {
    const store = await catalogStore();
    await snapshotHistory({ store, now, log });
    const state = await readJson(
      store,
      HISTORY_STATE_KEY,
      z.object({
        copied: z.record(z.string(), z.record(z.string(), z.string())),
      }),
    );
    const depts = state?.copied[fixtureTermId] ?? {};
    const [dept] = Object.keys(depts);
    if (!dept) throw new Error("no department copied");
    await writeJson(store, HISTORY_STATE_KEY, {
      copied: { ...state?.copied, [fixtureTermId]: { ...depts, [dept]: "0" } },
    });
    const again = await snapshotHistory({ store, now, log });
    expect(again.chunks).toBe(1);
  });
});

describe("backfillHistory", () => {
  /** PlanetTerp from saved pages: CMSC351 has grades, CMSC999 fails. */
  const planetTerp = () => {
    const urls: string[] = [];
    const fetch = async (input: string | URL | Request) => {
      const url = String(input);
      urls.push(url);
      if (url.includes("/course?name=CMSC351"))
        return Response.json(fixture("planetterp/course-CMSC351.json"));
      if (url.includes("/grades?course=CMSC351"))
        return Response.json(fixture("planetterp/grades-CMSC351.json"));
      return new Response("nope", { status: 500 });
    };
    return {
      urls,
      http: createHttpClient({ fetch, attempts: 1, sleep: async () => {} }),
    };
  };

  it("dry-runs a small sample: counts what it would record and writes nothing", async () => {
    const store = createMemoryBlobStore();
    const { http, urls } = planetTerp();
    const waits: number[] = [];
    const result = await backfillHistory({
      http,
      store,
      now,
      log,
      courses: ["CMSC351"],
      dryRun: true,
      sleep: async (ms) => {
        waits.push(ms);
      },
    });
    expect(result.fetched).toBe(1);
    expect(Object.keys(result.byTerm)).toHaveLength(27);
    expect(store.writes).toEqual([]);
    // One request at a time, a second apart.
    expect(urls).toHaveLength(2);
    expect(waits).toEqual([1000]);
  });

  it("keeps going past a course that fails, and a rerun skips what's done", async () => {
    const store = createMemoryBlobStore();
    const { http } = planetTerp();
    const sleep = async () => {};
    const result = await backfillHistory({
      http,
      store,
      now,
      log,
      courses: ["CMSC351", "CMSC999"],
      sleep,
    });
    expect(result.failed).toBe(1);
    expect(result.fetched).toBe(1);
    const manifest = await manifestOf(store);
    expect(manifest.terms).toHaveLength(27);
    expect(manifest.terms.every((t) => t.courses.planetterp === 1)).toBe(true);
    const progress = await store.get(HISTORY_BACKFILL_KEY);
    expect(JSON.parse(new TextDecoder().decode(progress ?? undefined))).toEqual(
      { done: ["CMSC351"] },
    );

    const rerun = await backfillHistory({
      http,
      store,
      now,
      log,
      courses: ["CMSC351", "CMSC999"],
      sleep,
    });
    expect(rerun.alreadyDone).toBe(1);
    expect(rerun.fetched).toBe(0);
  });

  it("never overrides a term we recorded ourselves", async () => {
    const store = createMemoryBlobStore();
    const ours = historyCoursesFromChunk([
      aCourse({ sections: [aSection({ instructors: ["Ada Brandt"] })] }),
    ]);
    const { http } = planetTerp();
    const grades = fixture("planetterp/grades-CMSC351.json") as {
      semester: string;
    }[];
    const termId = grades[0]?.semester ?? "";
    await publishHistory({
      store,
      now,
      log,
      updates: [{ termId, courses: ours }],
    });
    await backfillHistory({
      http,
      store,
      now,
      log,
      courses: ["CMSC351"],
      sleep: async () => {},
    });
    const entry = (await manifestOf(store)).terms.find(
      (t) => t.termId === termId,
    );
    expect(entry?.courses).toEqual({ terpsicle: 1, planetterp: 0 });
  });
});
