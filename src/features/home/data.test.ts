import { onlineManager, type QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { termTagCandidates } from "~/core/catalog/term-tag";
import {
  COURSE_INDEX_MANIFEST_KEY,
  CourseIndexManifestSchema,
  type IsoDate,
} from "~/core/schema";
import {
  FIXTURE_NOW,
  fixtureTermId,
  mockCalendars,
  mockDataSource,
  mockTermsFile,
} from "~/fixtures";
import {
  createBucketDataSource,
  createMemoryDataSource,
  DataError,
  type DataSource,
} from "~/state/data-source";
import {
  calendarQuery,
  deptChunkQuery,
  geoManifestQuery,
  manifestQuery,
} from "~/state/query/catalog";
import {
  createMemoryQueryStorage,
  flushQueryStorage,
  setQueryStorage,
} from "~/state/query/persister";
import { connectPublished, usePublishedSource } from "~/state/query/published";
import { createTestQueryClient } from "~/state/query/testing";
import { homeSource, resetHomeSource } from "./data";
import {
  fourYearCoursesQuery,
  homeCalendarsQuery,
  homeCampusQuery,
  planCatalogQuery,
} from "./queries";

// What Home reads from published files, through the files' own queries in
// the page's client: against the mock bucket, with the persister writing to
// memory. Home shares the scheduler's copies, reads each file once a page,
// and shows what this device saved when it's offline.

const today = FIXTURE_NOW.slice(0, 10) as IsoDate;

/** The mock bucket, counting what's read from it, and able to go offline. */
function aServer(bucket: DataSource = createBucketDataSource(mockDataSource)) {
  const reads: string[] = [];
  let offline = false;
  const source: DataSource = {
    kind: bucket.kind,
    async readJson(key, options) {
      reads.push(key);
      if (offline) throw new DataError(key, "network", "offline");
      return bucket.readJson(key, options);
    },
    async readBinary(key, options) {
      reads.push(key);
      if (offline) throw new DataError(key, "network", "offline");
      return bucket.readBinary(key, options);
    },
  };
  return {
    source,
    goOffline: () => {
      offline = true;
    },
    /** The keys read since the last call. */
    take: () => reads.splice(0),
  };
}

/** Lets the files' saves (a task after each fetch) finish. */
async function settled(client: QueryClient) {
  await vi.waitFor(() => expect(client.isFetching()).toBe(0));
  await new Promise((resolve) => setTimeout(resolve, 0));
  await flushQueryStorage();
}

beforeEach(() => {
  setQueryStorage(createMemoryQueryStorage());
  resetHomeSource();
});

afterEach(() => {
  setQueryStorage(null);
  connectPublished(null);
  resetHomeSource();
  onlineManager.setOnline(true);
});

describe("Home's published reads", () => {
  it("reads the calendars of the terms that can be Now or Next, into the calendars' own queries", async () => {
    const server = aServer();
    connectPublished(server.source);
    const client = createTestQueryClient();
    const calendars = await client.fetchQuery(homeCalendarsQuery(today));
    const listed = new Set(mockTermsFile.terms.map((t) => t.id));
    const wanted = termTagCandidates(today).filter((id) => listed.has(id));
    expect(calendars.map((c) => c.termId).sort()).toEqual(
      mockCalendars
        .filter((c) => wanted.includes(c.termId))
        .map((c) => c.termId)
        .sort(),
    );
    // The scheduler's and Plan's query for each one now holds it.
    for (const c of calendars)
      expect(
        client.getQueryData(calendarQuery(server.source, c.termId).queryKey),
      ).toEqual(c);
  });

  it("reads only the plan's departments of a term, with its seats, as the scheduler keeps them", async () => {
    const server = aServer();
    connectPublished(server.source);
    const client = createTestQueryClient();
    const catalog = await client.fetchQuery(
      planCatalogQuery(fixtureTermId, ["CMSC"]),
    );
    if (!catalog) throw new Error("the fixture term's catalog didn't load");
    expect(catalog.index.courses.has("CMSC351")).toBe(true);
    expect(
      [...catalog.index.courses.keys()].every((c) => c.startsWith("CMSC")),
    ).toBe(true);
    expect(catalog.seats).not.toBeNull();
    expect(catalog.pendingDepts.size).toBe(0);
    const manifest = client.getQueryData(
      manifestQuery(server.source, fixtureTermId).queryKey,
    );
    const cmsc = manifest?.departments.find((d) => d.code === "CMSC");
    if (!cmsc) throw new Error("the fixture manifest has no CMSC");
    expect(
      client.getQueryData(
        deptChunkQuery(server.source, fixtureTermId, cmsc).queryKey,
      ),
    ).toBeDefined();
    expect(
      server
        .take()
        .filter((k) => k.includes("/dept/"))
        .every((k) => k.includes("/CMSC.")),
    ).toBe(true);
  });

  it("reads nothing again for another look in the same page", async () => {
    const server = aServer();
    connectPublished(server.source);
    const client = createTestQueryClient();
    await client.fetchQuery(planCatalogQuery(fixtureTermId, ["CMSC"]));
    await client.fetchQuery(homeCalendarsQuery(today));
    server.take();
    await client.invalidateQueries({ queryKey: ["home"] });
    await client.fetchQuery(planCatalogQuery(fixtureTermId, ["CMSC"]));
    await client.fetchQuery(homeCalendarsQuery(today));
    expect(server.take()).toEqual([]);
  });

  it("shows what this device saved when it's offline", async () => {
    const first = aServer();
    connectPublished(first.source);
    const before = createTestQueryClient();
    const calendars = await before.fetchQuery(homeCalendarsQuery(today));
    const catalog = await before.fetchQuery(
      planCatalogQuery(fixtureTermId, ["CMSC"]),
    );
    await settled(before);

    // A new page, with no connection: the answers still come, from the disk.
    const later = aServer();
    later.goOffline();
    onlineManager.setOnline(false);
    connectPublished(later.source);
    const client = createTestQueryClient();
    expect(await client.fetchQuery(homeCalendarsQuery(today))).toEqual(
      calendars,
    );
    const again = await client.fetchQuery(
      planCatalogQuery(fixtureTermId, ["CMSC"]),
    );
    expect(again?.index.courses.get("CMSC351")).toEqual(
      catalog?.index.courses.get("CMSC351"),
    );
    expect(again?.seats).toEqual(catalog?.seats);
  });

  it("answers null for a term with no catalog, rather than failing", async () => {
    connectPublished(aServer().source);
    const client = createTestQueryClient();
    await expect(
      client.fetchQuery(planCatalogQuery("209901", ["CMSC"])),
    ).resolves.toBeNull();
  });

  it("reads the campus map through the geo files' queries", async () => {
    const server = aServer();
    connectPublished(server.source);
    const client = createTestQueryClient();
    const campus = await client.fetchQuery(homeCampusQuery());
    expect(campus).not.toBeNull();
    expect(
      client.getQueryData(geoManifestQuery(server.source).queryKey),
    ).toBeDefined();
  });

  it("counts a department the course index doesn't list as loaded, and one that won't load as not", async () => {
    const bucket = createBucketDataSource(mockDataSource);
    const manifest = CourseIndexManifestSchema.parse(
      await bucket.readJson(COURSE_INDEX_MANIFEST_KEY),
    );
    // MATH is listed at a hash nothing was published at; ZZZZ isn't listed.
    const listed = {
      ...manifest,
      departments: [
        ...manifest.departments.filter((d) => d.code !== "MATH"),
        { code: "MATH", hash: "ffffffffffffffff" },
      ],
    };
    const source: DataSource = {
      kind: "mock",
      readJson: (key, options) =>
        key === COURSE_INDEX_MANIFEST_KEY
          ? createMemoryDataSource({ [key]: listed }).readJson(key)
          : bucket.readJson(key, options),
      readBinary: (key, options) => bucket.readBinary(key, options),
    };
    connectPublished(source);
    const client = createTestQueryClient();
    const lookup = await client.fetchQuery(
      fourYearCoursesQuery(["CMSC", "MATH", "ZZZZ"]),
    );
    if (!lookup) throw new Error("the course index didn't load");
    expect(lookup.courses.has("CMSC351")).toBe(true);
    expect([...lookup.loadedDepts].sort()).toEqual(["CMSC", "ZZZZ"]);
  });

  it("answers null when the course index can't be read", async () => {
    connectPublished(createMemoryDataSource({}));
    const client = createTestQueryClient();
    await expect(
      client.fetchQuery(fourYearCoursesQuery(["CMSC"])),
    ).resolves.toBeNull();
  });

  it("uses the source another product connected, else connects its own", async () => {
    const server = aServer();
    connectPublished(server.source);
    expect(await homeSource()).toBe(server.source);
    connectPublished(null);
    resetHomeSource();
    const own = await homeSource();
    expect(usePublishedSource.getState().source).toBe(own);
    expect(await homeSource()).toBe(own);
  });
});
