import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isUnknownCourse } from "~/core/four-year/course-lookup";
import { courseIndexDeptKey } from "~/core/schema";
import { aCourseIndexEntry, FIXTURE_HASH } from "~/fixtures";
import { DataError, type DataSource } from "~/state/data-source";
import { courseIndexSource } from "~/state/query/course-index-testing";
import { connectPublished } from "~/state/query/published";
import { useCourseSearch, useIndexDepts, useIndexEntry } from "./data";

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
