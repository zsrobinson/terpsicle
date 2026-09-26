import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  stringifySearchWith,
} from "@tanstack/react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScheduleSearchSchema } from "~/core/schema/schedule-url";
import { useSearchStore } from "~/features/search/search-store";
import { demoPlan, demoPlanB } from "~/fixtures";
import { loadStores, seedDemoWorkspace, TEST_TERM_ID } from "~/state/testing";
import { useUi } from "~/state/ui-store";
import { useWorkspace } from "~/state/workspace-store";
import { goBack, openPlan } from "./actions";
import { bindScheduleUrl, desiredSearch } from "./schedule-url";

vi.mock("./analytics", () => ({ track: vi.fn() }));

// The URL sync against a real router on a memory history: what gets pushed,
// what replaces, and following Back and Forward into the stores.

function routerAt(url: string) {
  const root = createRootRoute();
  const schedule = createRoute({
    getParentRoute: () => root,
    path: "/schedule",
    validateSearch: ScheduleSearchSchema,
  });
  return createRouter({
    routeTree: root.addChildren([schedule]),
    history: createMemoryHistory({ initialEntries: [url] }),
    stringifySearch: stringifySearchWith(JSON.stringify),
  });
}

type Bound = Parameters<typeof bindScheduleUrl>[0];
let stop: (() => void) | undefined;
async function bind(url: string) {
  const router = routerAt(url);
  await router.load();
  stop = bindScheduleUrl(router as unknown as Bound);
  await settle();
  const history = router.history;
  const params = () => new URLSearchParams(history.location.search);
  return { history, params };
}

/** Lets the URL write (a microtask) and the router's load land. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const ui = () => useUi.getState();
const cmsc351 = { kind: "course", courseCode: "CMSC351" } as const;
const cmsc330 = { kind: "course", courseCode: "CMSC330" } as const;

beforeEach(async () => {
  await loadStores();
  seedDemoWorkspace();
});
afterEach(() => {
  stop?.();
  stop = undefined;
});

describe("the scheduler's URL", () => {
  it("writes where you are, replacing the entry it opened on", async () => {
    const { history, params } = await bind("/schedule");
    expect(history.length).toBe(1);
    expect(Object.fromEntries(params())).toEqual({
      term: TEST_TERM_ID,
      planId: demoPlan.id,
      tab: "courses",
    });
  });

  it("pushes each place, course to course, and Back retraces them", async () => {
    const { history, params } = await bind("/schedule");
    ui().openTab("search");
    await settle();
    ui().drill(cmsc351);
    await settle();
    ui().drill(cmsc330);
    await settle();
    expect(history.length).toBe(4);
    expect(params().get("course")).toBe("CMSC330");
    expect(ui().historyBack).toEqual({ label: "CMSC351", mono: true });

    // Back is the browser's: the stores follow the entry before.
    expect(goBack()).toBe(true);
    await settle();
    expect(ui().stack.at(-1)).toEqual(cmsc351);
    expect(ui().historyBack).toEqual({ label: "Search", mono: false });
    history.back();
    await settle();
    expect(ui()).toMatchObject({ tab: "search", stack: [] });
    history.forward();
    await settle();
    expect(ui().stack.at(-1)).toEqual(cmsc351);
    // Following never pushes.
    expect(history.length).toBe(4);
  });

  it("never pushes the same place twice", async () => {
    const { history } = await bind("/schedule");
    ui().drill(cmsc351);
    await settle();
    ui().drill({ ...cmsc351, tab: "grades" });
    ui().markNavigation();
    await settle();
    expect(history.length).toBe(2);
  });

  it("typing replaces; a filter chip pushes", async () => {
    const { history, params } = await bind("/schedule");
    ui().openTab("search");
    await settle();
    for (const q of ["c", "cm", "cmsc"]) {
      useSearchStore.getState().setQuery(TEST_TERM_ID, q);
      await settle();
    }
    expect(history.length).toBe(2);
    expect(params().get("q")).toBe("cmsc");

    const filters = useSearchStore.getState().byTerm[TEST_TERM_ID]?.filters;
    if (!filters) throw new Error("no filters");
    useSearchStore
      .getState()
      .setFilters(TEST_TERM_ID, { ...filters, levels: [300, 400] });
    await settle();
    expect(history.length).toBe(3);
    expect(params().get("level")).toBe("300,400");

    history.back();
    await settle();
    expect(useSearchStore.getState().byTerm[TEST_TERM_ID]).toMatchObject({
      query: "cmsc",
      filters: { levels: [] },
    });
  });

  it("a plan tab is a place; an edit that opens one replaces", async () => {
    const { history, params } = await bind("/schedule");
    openPlan(TEST_TERM_ID, demoPlanB.id);
    await settle();
    expect(history.length).toBe(2);
    expect(params().get("planId")).toBe(demoPlanB.id);
    history.back();
    await settle();
    expect(useWorkspace.getState().activePlanByTerm[TEST_TERM_ID]).toBe(
      demoPlan.id,
    );

    useWorkspace.getState().activatePlan(TEST_TERM_ID, demoPlanB.id);
    await settle();
    expect(history.length).toBe(2);
    expect(params().get("planId")).toBe(demoPlanB.id);
  });

  it("a link straight to a course gets the tab under it, so Back stays in the app", async () => {
    const { history, params } = await bind(
      `/schedule?term=${TEST_TERM_ID}&course=cmsc351`,
    );
    expect(ui()).toMatchObject({ tab: "courses", stack: [cmsc351] });
    expect(history.length).toBe(2);
    expect(params().get("course")).toBe("CMSC351");
    expect(ui().historyBack).toEqual({ label: "Courses", mono: false });

    history.back();
    await settle();
    expect(ui().stack).toEqual([]);
    expect(params().get("tab")).toBe("courses");
    expect(params().has("course")).toBe(false);
    expect(ui().historyBack).toBeNull();
  });

  it("the URL wins over what was saved, and a plan that isn't yours is dropped", async () => {
    useUi.setState({ tab: "travel", stack: [cmsc330] });
    const { params } = await bind(
      `/schedule?term=${TEST_TERM_ID}&tab=search&q=algo&planId=not-a-plan-of-mine`,
    );
    expect(ui()).toMatchObject({ tab: "search", stack: [] });
    expect(useSearchStore.getState().byTerm[TEST_TERM_ID]?.query).toBe("algo");
    expect(params().get("planId")).toBe(demoPlan.id);
  });

  it("describes a generated plan only while its results are here", () => {
    useUi.setState({
      tab: "generate",
      stack: [{ kind: "generated-plan", resultId: "r1" }],
    });
    expect(desiredSearch({})).toMatchObject({
      tab: "generate",
      result: "r1",
      view: undefined,
    });
  });
});
