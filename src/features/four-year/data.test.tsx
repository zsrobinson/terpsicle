import {
  onlineManager,
  type QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isUnknownCourse } from "~/core/four-year/course-lookup";
import {
  COURSE_INDEX_MANIFEST_KEY,
  calendarKey,
  courseIndexDeptKey,
  TERMS_KEY,
} from "~/core/schema";
import {
  aCourseIndexEntry,
  aCourseIndexManifest,
  aFourYear,
  aFourYearCreditEntry,
  aFourYearEntry,
  FIXTURE_HASH,
  mockCalendars,
  mockDataSource,
  mockTermsFile,
} from "~/fixtures";
import { resetPageSource } from "~/lib/published-source";
import {
  createBucketDataSource,
  DataError,
  type DataSource,
} from "~/state/data-source";
import { calendarQuery, termsQuery } from "~/state/query/catalog";
import { courseIndexSource } from "~/state/query/course-index-testing";
import {
  createMemoryQueryStorage,
  flushQueryStorage,
  setQueryStorage,
} from "~/state/query/persister";
import {
  connectPublished,
  publishedKey,
  usePublishedSource,
} from "~/state/query/published";
import { createTestQueryClient } from "~/state/query/testing";
import {
  docDepts,
  resetFourYearStart,
  startFourYear,
  useCourseSearch,
  useFourYearFacts,
  useIndexDepts,
  useIndexEntry,
  useIndexStale,
  useReloadWhenIndexStale,
} from "./data";
import { usePlanModel } from "./model";

// Plan's reads of the course index (docs/DATA.md §5.2), through the query
// cache: what's loading, what's known, what failed.

const index = () =>
  courseIndexSource([
    aCourseIndexEntry({
      code: "CMSC131",
      title: "Object-Oriented Programming I",
    }),
    aCourseIndexEntry({ code: "MATH140", title: "Calculus I" }),
  ]);

/** The same files, with MATH's department file out of reach. */
function withoutMath(): DataSource {
  const source = index();
  return {
    ...source,
    readJson: async (key, options) => {
      if (key === courseIndexDeptKey("MATH", FIXTURE_HASH))
        throw new DataError(key, "network", "offline");
      return source.readJson(key, options);
    },
  };
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  connectPublished(null);
  vi.restoreAllMocks();
});

describe("useIndexDepts", () => {
  it("is loading, then knows the courses and which codes aren't there", async () => {
    connectPublished(index());
    const { result } = renderHook(() => useIndexDepts(["CMSC", "ZZZZ"]));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    const { lookup, failed } = result.current;
    expect(lookup.courses.get("CMSC131")?.title).toBe(
      "Object-Oriented Programming I",
    );
    expect(isUnknownCourse(lookup, "CMSC999")).toBe(true);
    // A department the index never saw: loaded, and empty.
    expect(isUnknownCourse(lookup, "ZZZZ101")).toBe(true);
    expect(failed.size).toBe(0);
  });

  it("says a department failed, and guesses nothing about its codes", async () => {
    connectPublished(withoutMath());
    const { result } = renderHook(() => useIndexDepts(["CMSC", "MATH"]));
    await waitFor(() => expect(result.current.failed.has("MATH")).toBe(true));
    expect(result.current.loading).toBe(false);
    expect(isUnknownCourse(result.current.lookup, "MATH140")).toBe(false);
    expect(result.current.lookup.courses.has("CMSC131")).toBe(true);
  });

  it("isn't loading before there's a data source", () => {
    const { result } = renderHook(() => useIndexDepts(["CMSC"]));
    expect(result.current.loading).toBe(false);
  });

  it("keeps the same answer between renders while nothing changes", async () => {
    connectPublished(index());
    const { result, rerender } = renderHook(() => useIndexDepts(["CMSC"]));
    await waitFor(() => expect(result.current.loading).toBe(false));
    const before = result.current;
    rerender();
    expect(result.current).toBe(before);
  });
});

describe("useIndexEntry and useCourseSearch", () => {
  it("is undefined while its department loads, then the entry or null", async () => {
    connectPublished(index());
    const { result, rerender } = renderHook(
      ({ code }: { code: string }) => useIndexEntry(code),
      { initialProps: { code: "MATH140" } },
    );
    expect(result.current).toBeUndefined();
    await waitFor(() => expect(result.current?.title).toBe("Calculus I"));
    rerender({ code: "MATH999" });
    expect(result.current).toBeNull();
  });

  it("lists every course, and says when the list can't load", async () => {
    connectPublished(index());
    const view = renderHook(() => useCourseSearch());
    await waitFor(() =>
      expect(view.result.current.rows?.map((r) => r[0])).toEqual([
        "CMSC131",
        "MATH140",
      ]),
    );
    view.unmount();

    const offline: DataSource = {
      ...index(),
      readJson: async (key) => {
        throw new DataError(key, "network", "offline");
      },
    };
    connectPublished(offline);
    const failed = renderHook(() => useCourseSearch());
    await waitFor(() => expect(failed.result.current.failed).toBe(true));
    expect(failed.result.current.rows).toBeNull();
  });
});

describe("offline, a newer format, and a manifest that moved on", () => {
  it("says a department failed when offline with nothing saved, instead of loading forever", async () => {
    const offline: DataSource = {
      ...index(),
      readJson: async (key) => {
        throw new DataError(key, "network", "offline");
      },
    };
    connectPublished(offline);
    onlineManager.setOnline(false);
    try {
      // The factories' own retry policy, not the test client's.
      const { result } = renderHook(() => useIndexDepts(["CMSC"]));
      await waitFor(() => expect(result.current.failed.has("CMSC")).toBe(true));
      expect(result.current.loading).toBe(false);
    } finally {
      onlineManager.setOnline(true);
    }
  });

  it("is loading, not failed, while a missing file waits for the manifest's check", async () => {
    // The first manifest names a CMSC file the server no longer has; the
    // second, which the check brings, names the new one.
    const newer = courseIndexSource([
      aCourseIndexEntry({ code: "CMSC131", title: "OOP I (new)" }),
    ]);
    const moved = (hash: string) =>
      aCourseIndexManifest({
        search: { hash: FIXTURE_HASH },
        departments: [{ code: "CMSC", hash }],
      });
    let manifest = moved("1111111111111111");
    let letCheckLand: () => void = () => {};
    let checking: Promise<void> | null = null;
    connectPublished({
      ...newer,
      readJson: async (key, options) => {
        if (key === COURSE_INDEX_MANIFEST_KEY) {
          if (checking) await checking;
          return structuredClone(manifest);
        }
        return newer.readJson(key, options);
      },
    });
    const client = createTestQueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useIndexDepts(["CMSC"]), { wrapper });
    await waitFor(() => expect(result.current.failed.has("CMSC")).toBe(true));

    // The page's check of the manifest, on its way.
    checking = new Promise((resolve) => {
      letCheckLand = resolve;
    });
    manifest = moved(FIXTURE_HASH);
    const check = client.refetchQueries({
      queryKey: publishedKey("mock", COURSE_INDEX_MANIFEST_KEY),
    });
    await waitFor(() => expect(result.current.loading).toBe(true));
    expect(result.current.failed.size).toBe(0);

    await act(async () => {
      letCheckLand();
      await check;
    });
    await waitFor(() =>
      expect(result.current.lookup.courses.get("CMSC131")?.title).toBe(
        "OOP I (new)",
      ),
    );
    expect(result.current.failed.size).toBe(0);
  });

  it("says the index is newer than this page, and reloads when the page shows again", async () => {
    const empty = courseIndexSource([]);
    connectPublished({
      ...empty,
      readJson: async (key, options) =>
        key === COURSE_INDEX_MANIFEST_KEY
          ? { ...aCourseIndexManifest(), schemaVersion: 99 }
          : empty.readJson(key, options),
    });
    const reload = vi.fn();
    vi.spyOn(window, "location", "get").mockReturnValue({
      ...window.location,
      reload,
    });
    const { result } = renderHook(() => {
      useReloadWhenIndexStale();
      return { stale: useIndexStale(), search: useCourseSearch() };
    });
    await waitFor(() => expect(result.current.stale).toBe(true));
    expect(result.current.search).toMatchObject({ failed: true, stale: true });
    expect(reload).not.toHaveBeenCalled();
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(reload).toHaveBeenCalledTimes(1);
  });
});

/** The mock bucket, counting what's read from it, and able to go offline. */
function aServer() {
  const bucket = createBucketDataSource(mockDataSource);
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
  await waitFor(() => expect(client.isFetching()).toBe(0));
  await new Promise((resolve) => setTimeout(resolve, 0));
  await flushQueryStorage();
}

const inClient = (client: QueryClient) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };

const newestTerm = mockTermsFile.terms
  .map((t) => t.id)
  .sort()
  .at(-1);
const byTerm = (calendars: readonly { termId: string }[]) =>
  [...calendars].sort((a, b) => a.termId.localeCompare(b.termId));

describe("the term list and calendars (useFourYearFacts)", () => {
  beforeEach(() => {
    setQueryStorage(createMemoryQueryStorage());
    resetPageSource();
  });
  afterEach(() => {
    setQueryStorage(null);
    resetPageSource();
    onlineManager.setOnline(true);
  });

  it("reads them through Schedule's own queries, once for the page", async () => {
    const server = aServer();
    connectPublished(server.source);
    const client = createTestQueryClient();
    // What the scheduler's catalog store reads first.
    await client.fetchQuery(termsQuery(server.source));
    await settled(client);
    server.take();

    const { result } = renderHook(() => useFourYearFacts((f) => f), {
      wrapper: inClient(client),
    });
    await waitFor(() =>
      expect(result.current.calendars).toHaveLength(mockCalendars.length),
    );
    expect(result.current.latestTermId).toBe(newestTerm);
    // Only the active terms are listed: an archived one is the history's.
    expect([...result.current.listedTermIds]).toEqual(
      mockTermsFile.terms.filter((t) => t.status === "active").map((t) => t.id),
    );
    expect(byTerm(result.current.calendars)).toEqual(byTerm(mockCalendars));
    // Each calendar is in the query the scheduler and Home read.
    for (const c of mockCalendars)
      expect(
        client.getQueryData(calendarQuery(server.source, c.termId).queryKey),
      ).toEqual(c);
    await settled(client);
    // The term list wasn't read again; each calendar once.
    expect(server.take().sort()).toEqual(
      mockTermsFile.terms.map((t) => calendarKey(t.id)).sort(),
    );

    // Another part of the page (a column's foot) reads nothing more.
    const again = renderHook(() => useFourYearFacts((f) => f.latestTermId), {
      wrapper: inClient(client),
    });
    expect(again.result.current).toBe(newestTerm);
    await settled(client);
    expect(server.take()).toEqual([]);
  });

  it("keeps the same answer between renders while nothing changes", async () => {
    connectPublished(aServer().source);
    const client = createTestQueryClient();
    const { result, rerender } = renderHook(
      () => useFourYearFacts((f) => f.calendars),
      { wrapper: inClient(client) },
    );
    await waitFor(() =>
      expect(result.current).toHaveLength(mockCalendars.length),
    );
    const before = result.current;
    rerender();
    expect(result.current).toBe(before);
  });

  it("shows what this device saved when it's offline", async () => {
    const first = aServer();
    connectPublished(first.source);
    const before = createTestQueryClient();
    const seen = renderHook(() => useFourYearFacts((f) => f), {
      wrapper: inClient(before),
    });
    await waitFor(() =>
      expect(seen.result.current.calendars).toHaveLength(mockCalendars.length),
    );
    await settled(before);
    seen.unmount();

    // A new page, with no connection: the facts still come, from the disk.
    const later = aServer();
    later.goOffline();
    onlineManager.setOnline(false);
    connectPublished(later.source);
    const client = createTestQueryClient();
    const { result } = renderHook(() => useFourYearFacts((f) => f), {
      wrapper: inClient(client),
    });
    await waitFor(() =>
      expect(result.current.calendars).toHaveLength(mockCalendars.length),
    );
    expect(result.current.latestTermId).toBe(newestTerm);
    expect(byTerm(result.current.calendars)).toEqual(byTerm(mockCalendars));
  });

  it("is no newest term and no calendars when the term list can't load", async () => {
    const server = aServer();
    server.goOffline();
    onlineManager.setOnline(false);
    connectPublished(server.source);
    const client = createTestQueryClient();
    const { result } = renderHook(() => useFourYearFacts((f) => f), {
      wrapper: inClient(client),
    });
    await waitFor(() =>
      expect(
        client.getQueryState(termsQuery(server.source).queryKey)?.status,
      ).toBe("error"),
    );
    expect(result.current).toEqual({
      latestTermId: null,
      listedTermIds: new Set(),
      calendars: [],
    });
    expect(server.take()).toEqual([TERMS_KEY]);
  });
});

describe("startFourYear", () => {
  afterEach(() => {
    resetFourYearStart();
    resetPageSource();
  });

  it("reads from the source the page already has, as Schedule connected it", async () => {
    const server = aServer();
    connectPublished(server.source);
    await startFourYear();
    expect(usePublishedSource.getState().source).toBe(server.source);
  });
});

describe("docDepts", () => {
  it("includes what a credit or a course counts as, so their checks can read it", () => {
    const doc = aFourYear({
      entries: [
        aFourYearEntry({ code: "CMSC351" }),
        aFourYearCreditEntry({ id: "entry_ap", countsAs: "MATH140" }),
        aFourYearEntry({
          id: "entry_h",
          code: "CHEM131H",
          details: {
            title: "Honors Chemistry",
            genEds: [],
            countsAs: "BSCI170",
          },
        }),
      ],
    });
    expect(docDepts(doc)).toEqual(["BSCI", "CHEM", "CMSC", "MATH"]);
  });
});

describe("the plan's model", () => {
  it("carries which of the doc's departments are loading or failed, worked out once", async () => {
    connectPublished(withoutMath());
    const doc = aFourYear({
      entries: [
        aFourYearEntry({ code: "CMSC131" }),
        aFourYearEntry({ id: "entry_m", code: "MATH140" }),
      ],
    });
    const { result } = renderHook(() =>
      usePlanModel(doc, "2026-09-28", undefined),
    );
    expect(result.current.deptsLoading).toBe(true);
    await waitFor(() => expect(result.current.deptsLoading).toBe(false));
    expect([...result.current.deptsFailed]).toEqual(["MATH"]);
    expect(result.current.lookup.courses.has("CMSC131")).toBe(true);
  });
});
