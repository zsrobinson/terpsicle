import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type DeptCode,
  REVIEWS_MANIFEST_KEY,
  reviewsDeptKey,
} from "~/core/schema";
import {
  aPlanetTerpDept,
  aReviewsDept,
  aReviewsManifest,
  mockDataSource,
  mockMintedNames,
} from "~/fixtures";
import { useTerpsicleReviews } from "../data-hooks";
import {
  createBucketDataSource,
  DataError,
  type DataSource,
} from "../data-source";
import {
  createMemoryQueryStorage,
  flushQueryStorage,
  setQueryStorage,
} from "./persister";
import { connectPublished, publishedKey, retryPublished } from "./published";
import { reviewsManifestQuery, terpsicleInstructor } from "./review-numbers";
import { createTestQueryClient } from "./testing";

// Terpsicle reviews' numbers through the query cache (DATA.md §5.4): the
// hook course details reads, against the mock bucket and a fake server,
// with the persister writing to memory.

const hash = (n: number) => n.toString(16).padStart(16, "0");
const numbers = (reviewCount: number) => ({
  rating: 4.5,
  reviewCount,
  latestReviewMonth: "2026-09",
});

function aServer() {
  const files = new Map<string, unknown>();
  const reads: string[] = [];
  let offline = false;
  /** Keys whose read fails as a dropped connection would. */
  const failing = new Set<string>();
  const source: DataSource = {
    kind: "live",
    async readJson(key) {
      reads.push(key);
      if (offline || failing.has(key))
        throw new DataError(key, "network", "offline");
      if (!files.has(key)) throw new DataError(key, "missing", "missing");
      return structuredClone(files.get(key));
    },
    async readBinary(key) {
      throw new DataError(key, "missing", "missing");
    },
  };
  const publish = (n: number) => {
    files.set(
      REVIEWS_MANIFEST_KEY,
      aReviewsManifest({ departments: [{ code: "CMSC", hash: hash(n) }] }),
    );
    files.set(
      reviewsDeptKey("CMSC", hash(n)),
      aReviewsDept({ instructors: { brandt: numbers(n) } }),
    );
  };
  publish(1);
  return {
    files,
    failing,
    source,
    publish,
    setOffline: (value: boolean) => {
      offline = value;
    },
    take: () => reads.splice(0),
  };
}

let storage: ReturnType<typeof createMemoryQueryStorage>;

/** A page: a fresh client over the same storage, as a reload would be. */
function aPage(source: DataSource) {
  connectPublished(source);
  const client = createTestQueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const show = (dept: DeptCode | null, enabled = true) =>
    renderHook(() => useTerpsicleReviews(dept, enabled), { wrapper });
  return { client, wrapper, show };
}

/** A first page that showed CMSC's numbers and saved them, then closed. */
async function visitedOnce(server: ReturnType<typeof aServer>) {
  const first = aPage(server.source).show("CMSC");
  await waitFor(() => expect(first.result.current).not.toBeNull());
  await waitFor(() => expect(storage.rows.size).toBe(2));
  first.unmount();
  server.take();
}

/** The R2 keys saved now, sorted. */
const savedKeys = () =>
  [...storage.rows.keys()]
    .map((k) => JSON.parse(k.slice(k.indexOf("-") + 1))[2] as string)
    .sort();

/** The hash the saved reviews manifest lists for CMSC. */
function savedManifestHash(): string | undefined {
  const row = [...storage.rows].find(([k]) =>
    k.includes(REVIEWS_MANIFEST_KEY),
  )?.[1] as
    | { state: { data: { departments: { hash: string }[] } } }
    | undefined;
  return row?.state.data.departments[0]?.hash;
}

/** Makes every saved row look `ms` older, as if the page were opened later. */
function age(ms: number) {
  for (const [key, row] of storage.rows) {
    const r = row as { state: { dataUpdatedAt: number } };
    storage.rows.set(key, {
      ...r,
      state: { ...r.state, dataUpdatedAt: r.state.dataUpdatedAt - ms },
    });
  }
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  storage = createMemoryQueryStorage();
  setQueryStorage(storage);
});
afterEach(() => {
  connectPublished(null);
  setQueryStorage(null);
  vi.restoreAllMocks();
});

describe("useTerpsicleReviews in mock mode", () => {
  it("serves the mock bucket's numbers, minted instructors included", async () => {
    const { show } = aPage(createBucketDataSource(mockDataSource));
    const cmsc = show("CMSC");
    await waitFor(() => expect(cmsc.result.current).not.toBeNull());
    const minted = mockMintedNames.find((name) =>
      terpsicleInstructor(cmsc.result.current, null, name),
    );
    expect(minted).toBeDefined();
  });

  it("is null for a department with nothing published, and while Reviews is off", async () => {
    const { client, show } = aPage(createBucketDataSource(mockDataSource));
    const none = show("ZZZZ");
    await waitFor(() =>
      expect(
        client.getQueryState(publishedKey("mock", REVIEWS_MANIFEST_KEY))
          ?.status,
      ).toBe("success"),
    );
    expect(none.result.current).toBeNull();
    expect(show("CMSC", false).result.current).toBeNull();
  });
});

describe("useTerpsicleReviews with the persister", () => {
  it("reads one file per key, however many ask", async () => {
    const server = aServer();
    const { show } = aPage(server.source);
    const a = show("CMSC");
    const b = show("CMSC");
    await waitFor(() => expect(a.result.current).not.toBeNull());
    expect(b.result.current).toBe(a.result.current);
    expect(server.take().sort()).toEqual(
      [REVIEWS_MANIFEST_KEY, reviewsDeptKey("CMSC", hash(1))].sort(),
    );
  });

  it("shows the saved copy next time, and checks the manifest once per page", async () => {
    const server = aServer();
    await visitedOnce(server);

    // Within the hour, a new page still asks for the manifest, once.
    const next = aPage(server.source);
    const a = next.show("CMSC");
    await waitFor(() =>
      expect(a.result.current?.instructors.brandt?.reviewCount).toBe(1),
    );
    await waitFor(() => expect(server.take()).toEqual([REVIEWS_MANIFEST_KEY]));
    next.show("CMSC");
    await flushQueryStorage();
    expect(server.take()).toEqual([]);
  });

  it("keeps a saved file however old it is, offline too", async () => {
    const server = aServer();
    await visitedOnce(server);
    age(400 * 24 * 60 * 60 * 1000);

    server.setOffline(true);
    const next = aPage(server.source).show("CMSC");
    await waitFor(() =>
      expect(next.result.current?.instructors.brandt?.reviewCount).toBe(1),
    );
  });

  it("brings a saved department's new file along with a changed manifest, then forgets the old one", async () => {
    const server = aServer();
    await visitedOnce(server);

    server.publish(2);
    const next = aPage(server.source).show("CMSC");
    await waitFor(() =>
      expect(next.result.current?.instructors.brandt?.reviewCount).toBe(2),
    );
    expect(server.take().sort()).toEqual(
      [REVIEWS_MANIFEST_KEY, reviewsDeptKey("CMSC", hash(2))].sort(),
    );
    await waitFor(() =>
      expect(savedKeys()).toEqual(
        [REVIEWS_MANIFEST_KEY, reviewsDeptKey("CMSC", hash(2))].sort(),
      ),
    );
    expect(savedManifestHash()).toBe(hash(2));
  });

  it("keeps the old manifest and file when the new file can't load", async () => {
    const server = aServer();
    await visitedOnce(server);

    // The manifest arrives, then the connection drops.
    server.publish(2);
    server.failing.add(reviewsDeptKey("CMSC", hash(2)));
    const next = aPage(server.source);
    const view = next.show("CMSC");
    await waitFor(() =>
      expect(
        next.client.getQueryState(publishedKey("live", REVIEWS_MANIFEST_KEY))
          ?.status,
      ).toBe("error"),
    );
    expect(view.result.current?.instructors.brandt?.reviewCount).toBe(1);
    await flushQueryStorage();
    expect(savedKeys()).toEqual(
      [REVIEWS_MANIFEST_KEY, reviewsDeptKey("CMSC", hash(1))].sort(),
    );
    expect(savedManifestHash()).toBe(hash(1));
    view.unmount();

    server.setOffline(true);
    const offline = aPage(server.source).show("CMSC");
    await waitFor(() =>
      expect(offline.result.current?.instructors.brandt?.reviewCount).toBe(1),
    );
  });

  it("keeps the old numbers on screen while a department's new file loads", async () => {
    // Nothing saved, so the new file loads only once the manifest changed.
    setQueryStorage(null);
    const server = aServer();
    const { client, wrapper } = aPage(server.source);
    const seen: (number | undefined)[] = [];
    renderHook(
      () => {
        const dept = useTerpsicleReviews("CMSC", true);
        seen.push(dept?.instructors.brandt?.reviewCount);
        return dept;
      },
      { wrapper },
    );
    await waitFor(() => expect(seen.at(-1)).toBe(1));

    server.publish(2);
    await client.refetchQueries({
      queryKey: publishedKey("live", REVIEWS_MANIFEST_KEY),
    });
    await waitFor(() => expect(seen.at(-1)).toBe(2));
    expect(seen.slice(seen.indexOf(1))).not.toContain(undefined);
  });

  it("follows the server when a saved manifest names a file it deleted", async () => {
    const server = aServer();
    const first = aPage(server.source).show("MATH");
    await waitFor(() => expect(storage.rows.size).toBe(1));
    first.unmount();

    server.publish(2);
    server.files.delete(reviewsDeptKey("CMSC", hash(1)));
    const next = aPage(server.source).show("CMSC");
    await waitFor(() =>
      expect(next.result.current?.instructors.brandt?.reviewCount).toBe(2),
    );
  });

  it("drops a saved copy that doesn't read, and fetches again", async () => {
    const server = aServer();
    await visitedOnce(server);
    for (const key of storage.rows.keys()) storage.rows.set(key, { junk: 1 });

    const next = aPage(server.source).show("CMSC");
    await waitFor(() => expect(next.result.current).not.toBeNull());
    expect(server.take().sort()).toEqual(
      [REVIEWS_MANIFEST_KEY, reviewsDeptKey("CMSC", hash(1))].sort(),
    );
  });

  it("drops a saved file whose data doesn't match its schema, and fetches again", async () => {
    const server = aServer();
    await visitedOnce(server);
    for (const [key, row] of storage.rows)
      if (key.includes("/dept/")) {
        const r = row as { state: object };
        storage.rows.set(key, {
          ...r,
          state: { ...r.state, data: { dept: 7 } },
        });
      }

    const next = aPage(server.source).show("CMSC");
    await waitFor(() =>
      expect(next.result.current?.instructors.brandt?.reviewCount).toBe(1),
    );
    expect(server.take()).toContain(reviewsDeptKey("CMSC", hash(1)));
  });

  it("keeps mock and live apart on one origin", async () => {
    const server = aServer();
    const live = aPage(server.source).show("CMSC");
    await waitFor(() => expect(live.result.current).not.toBeNull());
    const liveNumbers = live.result.current;
    live.unmount();
    await waitFor(() => expect(storage.rows.size).toBe(2));
    const mock = aPage(createBucketDataSource(mockDataSource)).show("CMSC");
    await waitFor(() => expect(mock.result.current).not.toBeNull());
    expect(liveNumbers?.instructors).toEqual({ brandt: numbers(1) });
    expect(mock.result.current?.instructors).not.toEqual({
      brandt: numbers(1),
    });
  });
});

describe("failures", () => {
  it("shows nothing when the manifest can't load, and loads on the next try", async () => {
    const server = aServer();
    server.setOffline(true);
    const { client, show } = aPage(server.source);
    const view = show("CMSC");
    const state = () =>
      client.getQueryState(publishedKey("live", REVIEWS_MANIFEST_KEY));
    await waitFor(() => expect(state()?.status).toBe("error"));
    // Asked once, then retried twice (at once, in tests).
    expect(server.take()).toEqual(Array(3).fill(REVIEWS_MANIFEST_KEY));
    expect(view.result.current).toBeNull();

    server.setOffline(false);
    await client.refetchQueries();
    await waitFor(() => expect(view.result.current).not.toBeNull());
  });

  it("doesn't retry a file that's missing, broken or in a newer format", async () => {
    const server = aServer();
    server.files.set(REVIEWS_MANIFEST_KEY, {
      ...aReviewsManifest(),
      schemaVersion: 99,
    });
    const client: QueryClient = createTestQueryClient();
    await expect(
      client.fetchQuery(reviewsManifestQuery(server.source)),
    ).rejects.toThrow(/schema version 99/);
    expect(server.take()).toEqual([REVIEWS_MANIFEST_KEY]);

    const missing = new DataError("k", "missing", "gone");
    const broken = new DataError("k", "invalid", "bad");
    const offline = new DataError("k", "network", "offline");
    expect(retryPublished(0, missing)).toBe(false);
    expect(retryPublished(0, broken)).toBe(false);
    expect(retryPublished(1, offline)).toBe(true);
    expect(retryPublished(2, offline)).toBe(false);
  });
});

describe("terpsicleInstructor", () => {
  const planetTerp = aPlanetTerpDept({ names: { "ada brandt": "brandt" } });

  it("joins through PlanetTerp's names", () => {
    expect(
      terpsicleInstructor(aReviewsDept(), planetTerp, "Ada Brandt"),
    ).toEqual({ id: "brandt", numbers: aReviewsDept().instructors.brandt });
  });

  it("uses a minted instructor only for names PlanetTerp doesn't know", () => {
    const ours = aReviewsDept({
      instructors: { "t~abcde23456": numbers(2) },
      names: { "pat quill": "t~abcde23456", "ada brandt": "t~zzzzz23456" },
    });
    expect(terpsicleInstructor(ours, planetTerp, "Pat Quill")).toEqual({
      id: "t~abcde23456",
      numbers: numbers(2),
    });
    expect(terpsicleInstructor(ours, planetTerp, "Ada Brandt")?.id).toBe(
      "brandt",
    );
  });

  it("lets the owner's fix beat PlanetTerp's join", () => {
    const ours = aReviewsDept({ names: { "ada brandt": "brandt_ada" } });
    expect(terpsicleInstructor(ours, planetTerp, "Ada Brandt")).toEqual({
      id: "brandt_ada",
      numbers: null,
    });
  });

  it("is null for a name nobody knows", () => {
    expect(terpsicleInstructor(null, null, "Nobody")).toBeNull();
  });
});
