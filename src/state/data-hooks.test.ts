import { onlineManager, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  calendarKey,
  PLANETTERP_MANIFEST_KEY,
  type PlanetTerpManifest,
  planetTerpDeptKey,
} from "~/core/schema";
import {
  aPlanetTerpDept,
  archivedFixtureTermId,
  fixtureTermId,
  MOCK_GRADES_THROUGH,
  mockDataSource,
  mockPlanetTerpDepts,
  mockRouteGeometries,
} from "~/fixtures";
import { useCatalog } from "./catalog-store";
import {
  useAcademicCalendar,
  useCampus,
  useInstructors,
  useLoadedPlanetTerp,
  usePlanetTerpStatus,
  useRouteGeometry,
} from "./data-hooks";
import {
  createBucketDataSource,
  DataError,
  type DataSource,
} from "./data-source";
import { connectPublished } from "./query/published";
import { createTestQueryClient } from "./query/testing";
import { loadStores } from "./testing";

// The data hooks beyond the term catalog, against the fixtures' mock bucket
// (the same files `pnpm dev:mock` serves).

beforeEach(async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  await loadStores();
});

describe("useInstructors", () => {
  it("loads a department's PlanetTerp file", async () => {
    const dept = mockPlanetTerpDepts[0]?.dept ?? "CMSC";
    const { result } = renderHook(() => useInstructors(dept));
    await waitFor(() => expect(result.current.state).toBe("ready"));
    expect(result.current.data?.dept).toBe(dept);
    // With the manifest's word on how current PlanetTerp is.
    expect(result.current.source).toMatchObject({
      status: "stale",
      gradesThrough: MOCK_GRADES_THROUGH,
    });
  });

  it("is ready with nothing for a department PlanetTerp doesn't cover", async () => {
    const { result } = renderHook(() => useInstructors("ZZZZ"));
    await waitFor(() => expect(result.current.state).toBe("ready"));
    expect(result.current.data).toBeNull();
  });

  it("is idle without a department", () => {
    const { result } = renderHook(() => useInstructors(null));
    expect(result.current).toEqual({
      data: null,
      state: "idle",
      source: null,
      retry: expect.any(Function),
    });
  });
});

describe("useAcademicCalendar", () => {
  it("loads a published calendar", async () => {
    const { result } = renderHook(() => useAcademicCalendar(fixtureTermId));
    await waitFor(() => expect(result.current.state).toBe("ready"));
    expect(result.current.calendar?.status).toBe("published");
  });

  it("treats a calendar that isn't published yet as a real state", async () => {
    const { result } = renderHook(() =>
      useAcademicCalendar(archivedFixtureTermId),
    );
    await waitFor(() => expect(result.current.state).toBe("ready"));
    expect(result.current.calendar?.status).toBe("not-published");
  });
});

describe("useCampus", () => {
  it("loads buildings and routes", async () => {
    const { result } = renderHook(() => useCampus());
    await waitFor(() => expect(result.current.state).toBe("ready"));
    expect(result.current.campus.routes).not.toBeNull();
  });
});

describe("useRouteGeometry", () => {
  it("loads a connection's path", async () => {
    const g = mockRouteGeometries[0];
    if (!g) throw new Error("The mock bucket has route geometry");
    const { result } = renderHook(() => useRouteGeometry(g.from, g.to, g.mode));
    await waitFor(() => expect(result.current.state).toBe("ready"));
    expect(result.current.geometry?.lengthFeet).toBe(g.lengthFeet);
  });

  it("has no geometry when there's no file, so no map is drawn", async () => {
    const { result } = renderHook(() =>
      useRouteGeometry("NOPE", "NADA", "standard"),
    );
    await waitFor(() => expect(result.current.state).toBe("error"));
    expect(result.current.geometry).toBeNull();
  });
});

describe("reading without loading", () => {
  it("useCampus(false) and useLoadedPlanetTerp read only what something else loaded", async () => {
    const client = createTestQueryClient();
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, children);
    const dept = mockPlanetTerpDepts[0]?.dept ?? "CMSC";
    const readers = renderHook(
      () => ({ campus: useCampus(false), planetTerp: useLoadedPlanetTerp() }),
      { wrapper },
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(client.isFetching()).toBe(0);
    expect(readers.result.current.campus.state).toBe("idle");
    expect(readers.result.current.planetTerp.size).toBe(0);

    // Something on screen loads them (the shell, a course's details).
    const loaders = renderHook(
      () => ({ campus: useCampus(), instructors: useInstructors(dept) }),
      { wrapper },
    );
    await waitFor(() => {
      expect(loaders.result.current.campus.state).toBe("ready");
      expect(loaders.result.current.instructors.state).toBe("ready");
    });
    await waitFor(() =>
      expect(readers.result.current.planetTerp.get(dept)?.dept).toBe(dept),
    );
    expect(readers.result.current.campus.campus.routes).not.toBeNull();
  });
});

describe("a manifest naming a file the server deleted", () => {
  /** The mock bucket, whose PlanetTerp manifest moves CMSC to a new hash after `moveAfter` reads. */
  function movingServer(options: { moveAfter: number; newFile: boolean }) {
    const bucket = createBucketDataSource(mockDataSource);
    let manifestReads = 0;
    const source: DataSource = {
      ...bucket,
      readJson: async (key, readOptions) => {
        if (key === PLANETTERP_MANIFEST_KEY) {
          manifestReads++;
          const manifest = (await bucket.readJson(key)) as PlanetTerpManifest;
          if (manifestReads <= options.moveAfter) return manifest;
          return {
            ...manifest,
            departments: manifest.departments.map((d) =>
              d.code === "CMSC" ? { ...d, hash: MOVED } : d,
            ),
          };
        }
        if (key.startsWith("planetterp/dept/CMSC.")) {
          if (key === planetTerpDeptKey("CMSC", MOVED) && options.newFile)
            return aPlanetTerpDept({ dept: "CMSC" });
          throw new DataError(key, "missing", "deleted");
        }
        return bucket.readJson(key, readOptions);
      },
    };
    return { source, manifestReads: () => manifestReads };
  }
  const MOVED = "0000000000000007";

  it("asks for the manifest again and loads the new file, loading all the while", async () => {
    const server = movingServer({ moveAfter: 1, newFile: true });
    connectPublished(server.source);
    const states: string[] = [];
    const { result } = renderHook(() => {
      const instructors = useInstructors("CMSC");
      states.push(instructors.state);
      return { instructors, status: usePlanetTerpStatus("CMSC") };
    });
    await waitFor(() => expect(result.current.instructors.state).toBe("ready"));
    expect(result.current.instructors.data?.dept).toBe("CMSC");
    expect(states).not.toContain("error");
    expect(result.current.status.failed).toBe(false);
    expect(server.manifestReads()).toBe(2);
  });

  it("asks once per file: still gone, it says the file didn't load", async () => {
    const server = movingServer({ moveAfter: 1, newFile: false });
    connectPublished(server.source);
    const { result } = renderHook(() => ({
      instructors: useInstructors("CMSC"),
      status: usePlanetTerpStatus("CMSC"),
    }));
    await waitFor(() => expect(result.current.instructors.state).toBe("error"));
    expect(result.current.status.failed).toBe(true);
    // The first read, then one more for each file that came back missing
    // (the old hash, then the new one), and no more.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(server.manifestReads()).toBe(3);
  });

  it("asks once, and says so, when the manifest still names the missing file", async () => {
    const server = movingServer({ moveAfter: 99, newFile: false });
    connectPublished(server.source);
    const states: string[] = [];
    const { result } = renderHook(() => {
      const instructors = useInstructors("CMSC");
      states.push(instructors.state);
      return instructors;
    });
    await waitFor(() => expect(result.current.state).toBe("error"));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(server.manifestReads()).toBe(2);
    // Loading until the manifest's answer was in, then the failure.
    expect(states.indexOf("error")).toBe(states.length - 1);
  });
});

describe("a newer format than this tab reads", () => {
  it("marks the tab out of date, as the catalog does, so it offers Reload", async () => {
    const bucket = createBucketDataSource(mockDataSource);
    connectPublished({
      ...bucket,
      readJson: async (key, options) => {
        const raw = await bucket.readJson(key, options);
        return key === PLANETTERP_MANIFEST_KEY ||
          key === calendarKey(fixtureTermId)
          ? { ...(raw as object), schemaVersion: 99 }
          : raw;
      },
    });
    expect(useCatalog.getState().appStale).toBe(false);
    const { result } = renderHook(() => ({
      instructors: useInstructors("CMSC"),
      calendar: useAcademicCalendar(fixtureTermId),
    }));
    await waitFor(() => {
      expect(result.current.instructors.state).toBe("error");
      expect(result.current.calendar.state).toBe("error");
    });
    expect(useCatalog.getState().appStale).toBe(true);
  });
});

describe("offline with nothing saved", () => {
  it("says the file failed instead of loading until the connection's back", async () => {
    const offline: DataSource = {
      kind: "mock",
      readJson: async (key) => {
        throw new DataError(key, "network", "offline");
      },
      readBinary: async (key) => {
        throw new DataError(key, "network", "offline");
      },
    };
    connectPublished(offline);
    onlineManager.setOnline(false);
    try {
      // The factories' own retry policy, not the test client's.
      const { result } = renderHook(() => ({
        instructors: useInstructors("CMSC"),
        calendar: useAcademicCalendar(fixtureTermId),
        campus: useCampus(),
      }));
      await waitFor(() => {
        expect(result.current.instructors.state).toBe("error");
        expect(result.current.calendar.state).toBe("error");
        expect(result.current.campus.state).toBe("error");
      });
    } finally {
      onlineManager.setOnline(true);
    }
  });
});
