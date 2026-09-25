import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  archivedFixtureTermId,
  fixtureTermId,
  mockPlanetTerpDepts,
  mockRouteGeometries,
} from "~/fixtures";
import {
  useAcademicCalendar,
  useCampus,
  useInstructors,
  useRouteGeometry,
} from "./data-hooks";
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
  });

  it("is ready with nothing for a department PlanetTerp doesn't cover", async () => {
    const { result } = renderHook(() => useInstructors("ZZZZ"));
    await waitFor(() => expect(result.current.state).toBe("ready"));
    expect(result.current.data).toBeNull();
  });

  it("is idle without a department", () => {
    const { result } = renderHook(() => useInstructors(null));
    expect(result.current).toEqual({ data: null, state: "idle" });
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
