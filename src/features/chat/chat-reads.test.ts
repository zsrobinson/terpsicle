import type { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  COURSE_INDEX_MANIFEST_KEY,
  calendarKey,
  manifestKey,
  type TermId,
} from "~/core/schema";
import { fixtureTermId, mockDataSource, mockTermsFile } from "~/fixtures";
import { resetPageSource } from "~/lib/published-source";
import { createBucketDataSource, type DataSource } from "~/state/data-source";
import {
  calendarQuery,
  deptChunkQuery,
  manifestQuery,
  termsQuery,
} from "~/state/query/catalog";
import {
  createMemoryQueryStorage,
  flushQueryStorage,
  setQueryStorage,
} from "~/state/query/persister";
import { connectPublished } from "~/state/query/published";
import { createTestQueryClient } from "~/state/query/testing";
import {
  readCalendar,
  readCourseSearch,
  readCourses,
  readTerms,
} from "./chat-reads";
import { chatCourseRowsQuery } from "./queries";

// What Chat reads from published files, through the files' own queries in
// the page's client, against the mock bucket: it shares Schedule's copies
// and reads each file once a page.

/** The mock bucket, counting what's read from it. */
function aServer() {
  const bucket = createBucketDataSource(mockDataSource);
  const reads: string[] = [];
  const source: DataSource = {
    kind: bucket.kind,
    async readJson(key, options) {
      reads.push(key);
      return bucket.readJson(key, options);
    },
    async readBinary(key, options) {
      reads.push(key);
      return bucket.readBinary(key, options);
    },
  };
  return {
    source,
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
  resetPageSource();
});

afterEach(() => {
  setQueryStorage(null);
  connectPublished(null);
  resetPageSource();
});

describe("Chat's published reads", () => {
  it("reads a term's manifest once, in Schedule's own query, and only the departments it needs", async () => {
    const server = aServer();
    connectPublished(server.source);
    const client = createTestQueryClient();
    const first = await readCourses(client, fixtureTermId, ["CMSC351"]);
    expect([...first.keys()]).toEqual(["CMSC351"]);
    const read = server.take();
    expect(read.filter((k) => k === manifestKey(fixtureTermId))).toHaveLength(
      1,
    );
    // Besides the manifest, only CMSC's file.
    expect(read.filter((k) => k !== manifestKey(fixtureTermId))).toEqual([
      expect.stringMatching(
        new RegExp(`^catalog/${fixtureTermId}/dept/CMSC\\.`),
      ),
    ]);
    // The scheduler's query for the manifest now holds it.
    expect(
      client.getQueryData(manifestQuery(server.source, fixtureTermId).queryKey),
    ).toBeDefined();
    await settled(client);
    // Another course of the same department, and the same one again: nothing.
    const second = await readCourses(client, fixtureTermId, [
      "CMSC351",
      "CMSC131",
    ]);
    expect(second.has("CMSC351")).toBe(true);
    await settled(client);
    expect(server.take()).toEqual([]);
  });

  it("reads nothing Schedule already loaded in the page", async () => {
    const server = aServer();
    connectPublished(server.source);
    const client = createTestQueryClient();
    // What the scheduler's catalog store reads for a term.
    const manifest = await client.fetchQuery(
      manifestQuery(server.source, fixtureTermId),
    );
    const cmsc = manifest.departments.find((d) => d.code === "CMSC");
    if (!cmsc) throw new Error("the fixture manifest has no CMSC");
    await client.fetchQuery(deptChunkQuery(server.source, fixtureTermId, cmsc));
    await settled(client);
    server.take();
    const courses = await readCourses(client, fixtureTermId, ["CMSC351"]);
    expect(courses.has("CMSC351")).toBe(true);
    await settled(client);
    expect(server.take()).toEqual([]);
  });

  it("lists the terms newest first, from the terms' own query", async () => {
    const server = aServer();
    connectPublished(server.source);
    const client = createTestQueryClient();
    const terms = await readTerms(client);
    expect(terms.map((t) => t.id)).toEqual(
      mockTermsFile.terms.map((t) => t.id).sort((a, b) => b.localeCompare(a)),
    );
    expect(
      client.getQueryData(termsQuery(server.source).queryKey),
    ).toBeDefined();
    await settled(client);
    server.take();
    await readTerms(client);
    await settled(client);
    expect(server.take()).toEqual([]);
  });

  it("reads a term's calendar into its own query, and null for a term with none", async () => {
    const server = aServer();
    connectPublished(server.source);
    const client = createTestQueryClient();
    const calendar = await readCalendar(client, fixtureTermId);
    expect(calendar?.termId).toBe(fixtureTermId);
    expect(
      client.getQueryData(calendarQuery(server.source, fixtureTermId).queryKey),
    ).toEqual(calendar);
    const none = "209901" as TermId;
    expect(await readCalendar(client, none)).toBeNull();
    expect(server.take()).toContain(calendarKey(none));
  });

  it("finds every course in the course index's search file, read once for the page", async () => {
    const server = aServer();
    connectPublished(server.source);
    const client = createTestQueryClient();
    const rows = await client.fetchQuery(chatCourseRowsQuery());
    expect(rows.some(([code]) => code === "CMSC351")).toBe(true);
    expect(server.take()).toContain(COURSE_INDEX_MANIFEST_KEY);
    await settled(client);
    // Plan's and Home's reads of the index share the same files.
    expect(await readCourseSearch(client)).toEqual(rows);
    await settled(client);
    expect(server.take()).toEqual([]);
  });
});
