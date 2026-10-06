import { QueryObserver } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  archivedFixtureTermId,
  fixtureTermId,
  mockCourse,
  mockDataSource,
} from "~/fixtures";
import { createBucketDataSource } from "../data-source";
import { historyManifestQuery, taughtByQuery, whoTaughtQuery } from "./history";
import { createMemoryQueryStorage, setQueryStorage } from "./persister";
import { createTestQueryClient } from "./testing";

// The instructor history's read path (DATA.md §3.5) against the mock
// bucket, which the history job's own functions build.

beforeEach(() => setQueryStorage(createMemoryQueryStorage()));
afterEach(() => setQueryStorage(null));

const source = createBucketDataSource(mockDataSource);

describe("the instructor history in mock mode", () => {
  it("says who taught a course in a term", async () => {
    const client = createTestQueryClient();
    const manifest = await client.fetchQuery(historyManifestQuery(source));
    // The catalog's two terms, Fall 2026, and the older terms the mock
    // backfills (fixtures/mock/history.ts), newest first, with its gap.
    const terms = manifest.terms.map((t) => t.termId);
    expect(terms.slice(0, 5)).toEqual([
      fixtureTermId,
      "202608",
      archivedFixtureTermId,
      "202501",
      "202408",
    ]);
    expect(terms.at(-1)).toBe("201808");
    const observer = new QueryObserver(
      client,
      whoTaughtQuery(source, manifest, "CMSC351", fixtureTermId),
    );
    const offering = await new Promise((resolve) => {
      const stop = observer.subscribe((result) => {
        if (!result.isSuccess) return;
        stop();
        resolve(result.data);
      });
    });
    const course = mockCourse("CMSC351");
    expect(offering).toMatchObject({
      termId: fixtureTermId,
      source: "terpsicle",
      sections: course.sections.map((s) => ({
        code: s.code,
        instructors: [...new Set(s.instructors)].sort(),
      })),
    });
  });

  it("lists what an instructor taught, newest term first", async () => {
    const client = createTestQueryClient();
    const manifest = await client.fetchQuery(historyManifestQuery(source));
    const [name] = mockCourse("CMSC351").sections[0]?.instructors ?? [];
    if (!name) throw new Error("CMSC351's first section has no instructor");
    const rows = await client.fetchQuery(
      taughtByQuery(source, manifest, ["CMSC", "MATH"], [name]),
    );
    expect(rows.some((r) => r.course === "CMSC351")).toBe(true);
    const terms = rows.map((r) => r.termId);
    expect(terms).toEqual([...terms].sort().reverse());
  });

  it("answers null for a department with no history, rather than waiting", async () => {
    const client = createTestQueryClient();
    const manifest = await client.fetchQuery(historyManifestQuery(source));
    expect(manifest.departments.some((d) => d.code === "ZZZZ")).toBe(false);
    await expect(
      client.fetchQuery(
        whoTaughtQuery(source, manifest, "ZZZZ101", fixtureTermId),
      ),
    ).resolves.toBeNull();
    await expect(
      client.fetchQuery(taughtByQuery(source, manifest, ["ZZZZ"], ["Anyone"])),
    ).resolves.toEqual([]);
  });

  it("waits for the manifest before it reads anything", () => {
    const client = createTestQueryClient();
    const query = whoTaughtQuery(source, undefined, "CMSC351", fixtureTermId);
    const observer = new QueryObserver(client, query);
    const stop = observer.subscribe(() => {});
    expect(observer.getCurrentResult()).toMatchObject({
      status: "pending",
      fetchStatus: "idle",
    });
    stop();
  });
});
