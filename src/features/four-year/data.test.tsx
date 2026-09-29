import { onlineManager, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isUnknownCourse } from "~/core/four-year/course-lookup";
import { COURSE_INDEX_MANIFEST_KEY, courseIndexDeptKey } from "~/core/schema";
import {
  aCourseIndexEntry,
  aCourseIndexManifest,
  aFourYear,
  aFourYearCreditEntry,
  aFourYearEntry,
  FIXTURE_HASH,
} from "~/fixtures";
import { DataError, type DataSource } from "~/state/data-source";
import { courseIndexSource } from "~/state/query/course-index-testing";
import { connectPublished, publishedKey } from "~/state/query/published";
import { createTestQueryClient } from "~/state/query/testing";
import {
  docDepts,
  useCourseSearch,
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
