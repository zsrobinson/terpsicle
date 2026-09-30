import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  historyCoursesFromChunk,
  historyFromPlanetTerpGrades,
} from "~/core/history";
import {
  type DeptChunk,
  DeptChunkSchema,
  deptChunkKey,
  HISTORY_MANIFEST_KEY,
  historyDeptKey,
  historyTermKey,
  ManifestSchema,
  manifestKey,
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
import { readJson, silentLogger, writeHashed, writeJson } from "./publish";

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

  it("writes nothing when the manifest is missing but term files aren't", async () => {
    const store = createMemoryBlobStore();
    await publishHistory({
      store,
      now,
      log,
      updates: [{ termId: fixtureTermId, courses: [aHistoryCourse()] }],
    });
    await store.delete(HISTORY_MANIFEST_KEY);
    const files = (await store.list("history/")).sort();
    await expect(
      publishHistory({
        store,
        now,
        log,
        updates: [
          {
            termId: fixtureTermId,
            courses: [aHistoryCourse({ code: "CMSC250" })],
          },
        ],
      }),
    ).rejects.toBeInstanceOf(HistoryUnreadableError);
    expect((await store.list("history/")).sort()).toEqual(files);
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

const StateSchema = z.object({
  copied: z.record(
    z.string(),
    z.record(z.string(), z.object({ hash: z.string(), sections: z.number() })),
  ),
});

/** Replaces a department's chunk in the catalog, as a crawl would. */
async function recrawl(
  store: ReturnType<typeof createMemoryBlobStore>,
  dept: string,
  change: (chunk: DeptChunk) => DeptChunk,
) {
  const manifest = await readJson(
    store,
    manifestKey(fixtureTermId),
    ManifestSchema,
  );
  const entry = manifest?.departments.find((d) => d.code === dept);
  if (!manifest || !entry) throw new Error(`no ${dept} in the catalog`);
  const chunk = await readJson(
    store,
    deptChunkKey(fixtureTermId, dept, entry.hash),
    DeptChunkSchema,
  );
  if (!chunk) throw new Error(`no ${dept} chunk`);
  const next = change(chunk);
  const { hash } = await writeHashed(
    store,
    DeptChunkSchema,
    next,
    (h) => deptChunkKey(fixtureTermId, dept, h),
    dept,
  );
  const sectionCount = next.courses.reduce((n, c) => n + c.sections.length, 0);
  await writeJson(store, manifestKey(fixtureTermId), {
    ...manifest,
    departments: manifest.departments.map((d) =>
      d.code === dept ? { ...d, hash, sectionCount } : d,
    ),
  });
}

async function cmsc351(store: ReturnType<typeof createMemoryBlobStore>) {
  const cmsc = (await manifestOf(store)).departments.find(
    (d) => d.code === "CMSC",
  );
  const dept = await readJson(
    store,
    historyDeptKey("CMSC", cmsc?.hash ?? ""),
    HistoryDeptSchema,
  );
  return dept?.courses
    .find((c) => c.code === "CMSC351")
    ?.offerings.find((o) => o.termId === fixtureTermId);
}

describe("the job state", () => {
  it("copies a changed chunk again, and only that one", async () => {
    const store = await catalogStore();
    await snapshotHistory({ store, now, log });
    const state = await readJson(store, HISTORY_STATE_KEY, StateSchema);
    const depts = state?.copied[fixtureTermId] ?? {};
    const [dept] = Object.keys(depts);
    if (!dept) throw new Error("no department copied");
    const last = depts[dept];
    await writeJson(store, HISTORY_STATE_KEY, {
      copied: {
        ...state?.copied,
        [fixtureTermId]: { ...depts, [dept]: { ...last, hash: "0" } },
      },
    });
    const again = await snapshotHistory({ store, now, log });
    expect(again.chunks).toBe(1);
  });

  it("holds back a chunk whose sections dropped sharply, and doesn't record it", async () => {
    const store = await catalogStore();
    await snapshotHistory({ store, now, log });
    const before = await cmsc351(store);
    expect(before?.sections.length).toBeGreaterThan(0);
    // A truncated /sections answer: every course published with no sections.
    await recrawl(store, "CMSC", (chunk) => ({
      ...chunk,
      courses: chunk.courses.map((c) => ({ ...c, sections: [] })),
    }));
    const held = await snapshotHistory({ store, now, log });
    expect(held).toMatchObject({ held: 1, chunks: 0 });
    expect(held.errors[0]).toMatch(/CMSC: held back, 0 sections/);
    expect(await cmsc351(store)).toEqual(before);
    // Still held next run: it was never recorded as copied.
    expect((await snapshotHistory({ store, now, log })).held).toBe(1);

    // Forced through, the merge still keeps every instructor it had.
    const forced = await snapshotHistory({ store, now, log, force: true });
    expect(forced.chunks).toBe(1);
    expect(await cmsc351(store)).toEqual(before);
  });

  it("copies a smaller drop, a few cancelled sections", async () => {
    const store = await catalogStore();
    await snapshotHistory({ store, now, log });
    await recrawl(store, "CMSC", (chunk) => ({
      ...chunk,
      courses: chunk.courses.map((c) =>
        c.code === "CMSC351" ? { ...c, sections: c.sections.slice(0, 1) } : c,
      ),
    }));
    const run = await snapshotHistory({ store, now, log });
    expect(run).toMatchObject({ held: 0, chunks: 1 });
    expect((await cmsc351(store))?.sections).toHaveLength(1);
  });
});

describe("backfillHistory", () => {
  const progressOf = async (store: ReturnType<typeof createMemoryBlobStore>) =>
    JSON.parse(
      new TextDecoder().decode(
        (await store.get(HISTORY_BACKFILL_KEY)) ?? undefined,
      ),
    );

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
    expect(await progressOf(store)).toEqual({
      done: ["CMSC351"],
      emptyOnce: [],
      doneEmpty: [],
    });

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

  /** A fake PlanetTerp answering each URL that contains a key from `pages`. */
  const fakePlanetTerp = (pages: [string, number, unknown][]) => {
    const fetch = async (input: string | URL | Request) => {
      const url = String(input);
      const hit = pages.find(([part]) => url.includes(part));
      return hit
        ? Response.json(hit[2], { status: hit[1] })
        : new Response("nope", { status: 500 });
    };
    return createHttpClient({ fetch, attempts: 1, sleep: async () => {} });
  };
  const notFound = fixture("planetterp/grades-course-not-found.json");
  const listing = (...codes: string[]) =>
    codes.map((name) => ({ name, title: `${name} title`, credits: 3 }));

  it("takes only PlanetTerp's 400 as no grades; an empty list stays to do", async () => {
    const store = createMemoryBlobStore();
    const http = fakePlanetTerp([
      ["/course?name=", 200, { name: "X", title: "T", credits: 3 }],
      ["/grades?course=CMSC351", 200, []],
      ["/grades?course=CMSC250", 400, notFound],
    ]);
    const result = await backfillHistory({
      http,
      store,
      now,
      log,
      courses: ["CMSC351", "CMSC250"],
      sleep: async () => {},
    });
    expect(result).toMatchObject({
      emptyAnswers: 1,
      markedEmpty: 0,
      noGrades: 1,
    });
    expect(await progressOf(store)).toEqual({
      done: ["CMSC250"],
      emptyOnce: ["CMSC351"],
      doneEmpty: [],
    });
  });

  it("marks a course done-empty after a second empty answer on a later run, and stops asking", async () => {
    const store = createMemoryBlobStore();
    const urls: string[] = [];
    const http = createHttpClient({
      fetch: async (input) => {
        urls.push(String(input));
        return Response.json(
          String(input).includes("/course?name=")
            ? { name: "X", title: "T", credits: 3 }
            : [],
        );
      },
      attempts: 1,
      sleep: async () => {},
    });
    const run = () =>
      backfillHistory({
        http,
        store,
        now,
        log,
        courses: ["AAAS100"],
        sleep: async () => {},
      });

    expect(await run()).toMatchObject({ emptyAnswers: 1, markedEmpty: 0 });
    expect(await progressOf(store)).toMatchObject({ emptyOnce: ["AAAS100"] });
    expect(await run()).toMatchObject({ emptyAnswers: 1, markedEmpty: 1 });
    expect(await progressOf(store)).toEqual({
      done: [],
      emptyOnce: [],
      doneEmpty: ["AAAS100"],
    });
    const third = await run();
    expect(third).toMatchObject({ alreadyDone: 1, fetched: 0 });
    expect(urls.filter((u) => u.includes("/grades?"))).toHaveLength(2);
    // Nothing was recorded for it: no data, not empty data.
    expect(await store.get(HISTORY_MANIFEST_KEY)).toBeNull();
  });

  it("records a course that was empty once and has rows the next time", async () => {
    const store = createMemoryBlobStore();
    await writeJson(store, HISTORY_BACKFILL_KEY, {
      done: [],
      emptyOnce: ["CMSC351"],
    });
    const { http } = planetTerp();
    const result = await backfillHistory({
      http,
      store,
      now,
      log,
      courses: ["CMSC351"],
      sleep: async () => {},
    });
    expect(result).toMatchObject({ fetched: 1, emptyAnswers: 0 });
    expect((await manifestOf(store)).terms).toHaveLength(27);
    expect(await progressOf(store)).toEqual({
      done: ["CMSC351"],
      emptyOnce: [],
      doneEmpty: [],
    });
  });

  it("saves a complete listing and lists from it next time", async () => {
    const urls: string[] = [];
    const fetch = async (input: string | URL | Request) => {
      const url = String(input);
      urls.push(url);
      if (url.includes("offset=0&"))
        return Response.json(listing("CMSC131", "CMSC132"));
      if (url.includes("offset=100&")) return Response.json([]);
      return Response.json(notFound, { status: 400 });
    };
    const http = createHttpClient({
      fetch,
      attempts: 1,
      sleep: async () => {},
    });
    let saved: string | null = null;
    const listCache = {
      read: async () => saved,
      write: async (text: string) => {
        saved = text;
      },
    };
    const store = createMemoryBlobStore();
    const run = (departments: string[]) =>
      backfillHistory({
        http,
        store,
        now,
        log,
        departments,
        listCache,
        sleep: async () => {},
      });

    const first = await run(["CMSC"]);
    expect(first).toMatchObject({ listed: 2, listingCached: false });
    expect(saved).not.toBeNull();
    urls.length = 0;
    await writeJson(store, HISTORY_BACKFILL_KEY, { done: [] });
    const second = await run(["cmsc"]);
    expect(second).toMatchObject({ listed: 2, listingCached: true });
    expect(urls.some((u) => u.includes("/courses?"))).toBe(false);
    expect(urls.filter((u) => u.includes("/grades?"))).toHaveLength(2);

    // Another department's run doesn't take CMSC's listing.
    const other = await run(["MATH"]);
    expect(other.listingCached).toBe(false);
  });

  it("doesn't save a listing that's incomplete", async () => {
    const http = fakePlanetTerp([
      ["offset=0&", 200, listing("CMSC131", "CMSC132")],
      ["offset=100&", 200, listing("CMSC216")],
      ["offset=200&", 200, []],
      ["/grades?", 400, notFound],
    ]);
    let saved: string | null = null;
    const result = await backfillHistory({
      http,
      store: createMemoryBlobStore(),
      now,
      log,
      departments: ["CMSC"],
      listCache: {
        read: async () => "not json",
        write: async (text) => {
          saved = text;
        },
      },
      sleep: async () => {},
    });
    expect(result).toMatchObject({ listingComplete: false, listed: 3 });
    expect(saved).toBeNull();
  });

  it("stops cleanly when asked, merging what it has and counting what's left", async () => {
    const store = createMemoryBlobStore();
    const http = fakePlanetTerp([
      ["offset=0&", 200, listing("CMSC131", "CMSC132", "CMSC216")],
      ["offset=100&", 200, []],
      ["/grades?", 400, notFound],
    ]);
    let asked = 0;
    const result = await backfillHistory({
      http,
      store,
      now,
      log,
      departments: ["CMSC"],
      shouldStop: () => ++asked > 1,
      sleep: async () => {},
    });
    expect(result).toMatchObject({ fetched: 1, stoppedEarly: true, left: 2 });
    expect(await progressOf(store)).toMatchObject({ done: ["CMSC131"] });
  });

  it("stops after too many failures in a row instead of hammering PlanetTerp", async () => {
    const http = fakePlanetTerp([
      [
        "offset=0&",
        200,
        listing(...Array.from({ length: 8 }, (_, i) => `CMSC${100 + i}`)),
      ],
      ["offset=100&", 200, []],
      ["/grades?", 503, { error: "down" }],
    ]);
    const result = await backfillHistory({
      http,
      store: createMemoryBlobStore(),
      now,
      log,
      departments: ["CMSC"],
      maxFailuresInARow: 3,
      sleep: async () => {},
    });
    expect(result).toMatchObject({ failed: 3, stoppedEarly: true, left: 5 });
    expect(result.errors.at(-1)).toMatch(/3 courses in a row failed/);
  });

  it("checks a short list page, and reports one that had more after it", async () => {
    const http = fakePlanetTerp([
      ["offset=0&", 200, listing("CMSC131", "CMSC132")],
      ["offset=100&", 200, listing("CMSC216")],
      ["offset=200&", 200, []],
      ["/grades?", 400, notFound],
    ]);
    const result = await backfillHistory({
      http,
      store: createMemoryBlobStore(),
      now,
      log,
      departments: ["CMSC"],
      sleep: async () => {},
    });
    expect(result.listed).toBe(3);
    expect(result.listingComplete).toBe(false);
    expect(result.errors[0]).toMatch(
      /offset 0 had 2 courses, but more followed/,
    );
  });

  it("ends the list quietly at an empty page after a short one", async () => {
    const http = fakePlanetTerp([
      ["offset=0&", 200, listing("CMSC131")],
      ["offset=100&", 200, []],
      ["/grades?", 400, notFound],
    ]);
    const result = await backfillHistory({
      http,
      store: createMemoryBlobStore(),
      now,
      log,
      departments: ["CMSC"],
      sleep: async () => {},
    });
    expect(result).toMatchObject({ listed: 1, listingComplete: true });
    expect(result.errors).toEqual([]);
  });

  it("keeps what it listed when a list page fails, and says the list is incomplete", async () => {
    const http = fakePlanetTerp([
      [
        "offset=0&",
        200,
        listing(...Array.from({ length: 100 }, (_, i) => `CMSC${100 + i}`)),
      ],
      ["/grades?", 400, notFound],
    ]);
    const result = await backfillHistory({
      http,
      store: createMemoryBlobStore(),
      now,
      log,
      departments: ["CMSC"],
      sleep: async () => {},
    });
    expect(result).toMatchObject({ listed: 100, listingComplete: false });
    expect(result.errors[0]).toMatch(/stopped at offset 100/);
  });
});
