import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { courseDept } from "~/core/catalog";
import type { Problem } from "~/core/schema";
import { demoPlanB, fixtureTermId, mockDataSource } from "~/fixtures";
import { useCatalog } from "./catalog-store";
import { createBucketDataSource, createDataReader } from "./data-source";
import { usePlanProblemsState } from "./hooks";
import { loadStores } from "./testing";
import { useWorkspace } from "./workspace-store";

// Problems while a term loads: as soon as the plan's own departments are in,
// and never "cancelled" for a section whose department isn't.

const TERM = fixtureTermId;
// Plan B has CMSC320 0301, which the catalog no longer lists (cancelled).
const CANCELLED = "CMSC320-0301";
const planDepts = [
  ...new Set(demoPlanB.courses.map((c) => courseDept(c.courseCode))),
];

const kinds = (problems: readonly Problem[]) => problems.map((p) => p.kind);

beforeEach(async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  await loadStores();
  useWorkspace.setState({
    plans: [demoPlanB],
    activePlanByTerm: { [TERM]: demoPlanB.id },
  });
});

describe("usePlanProblemsState", () => {
  it("is checking, not problem-free, until the plan's departments load", async () => {
    const { result } = renderHook(() => usePlanProblemsState());
    expect(result.current).toEqual({ problems: [], checking: true });

    // One of the plan's departments isn't enough.
    await act(() =>
      useCatalog.getState().ensureDepts(
        TERM,
        planDepts.filter((d) => d !== "CMSC"),
      ),
    );
    expect(result.current.checking).toBe(true);
    expect(result.current.problems).toEqual([]);
  });

  it("reports problems once the plan's departments are in, before the rest of the term", async () => {
    const { result } = renderHook(() => usePlanProblemsState());
    await act(() => useCatalog.getState().ensureDepts(TERM, planDepts));

    expect(useCatalog.getState().byTerm[TERM]?.complete).toBe(false);
    expect(result.current.checking).toBe(false);
    expect(kinds(result.current.problems)).toContain("cancelled");
    expect(JSON.stringify(result.current.problems)).toContain(CANCELLED);
  });

  it("never calls a section cancelled when its department failed to load", async () => {
    // Every CMSC file is missing: the department ends in "error".
    const source = createBucketDataSource({
      get: (key) =>
        key.includes("/dept/CMSC.")
          ? Promise.resolve(null)
          : mockDataSource.get(key),
    });
    useCatalog.getState().setReader(createDataReader(source));
    await useCatalog.getState().loadTerms();
    const { result } = renderHook(() => usePlanProblemsState());
    await act(() => useCatalog.getState().ensureDepts(TERM, planDepts));

    expect(useCatalog.getState().byTerm[TERM]?.depts.CMSC).toBe("error");
    expect(result.current.checking).toBe(false);
    expect(JSON.stringify(result.current.problems)).not.toContain(CANCELLED);
  });

  it("returns the same object while nothing changes", async () => {
    const { result, rerender } = renderHook(() => usePlanProblemsState());
    await act(() => useCatalog.getState().ensureDepts(TERM, planDepts));
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});
