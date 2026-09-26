import "fake-indexeddb/auto";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Dexie from "dexie";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LOCAL_DB_NAME, type PlanSearch } from "~/core/schema";
import type { FourYearDoc } from "~/core/schema/four-year";
import {
  aFourYear,
  aFourYearEntry,
  aFourYearWildcardEntry,
  mockDataSource,
} from "~/fixtures";
import {
  INITIAL_COURSE_INDEX_STATE,
  useCourseIndex,
} from "~/state/course-index-store";
import { createBucketDataSource } from "~/state/data-source";
import { TerpsicleDb } from "~/state/db";
import { Toaster } from "~/ui/sonner";
import { TooltipProvider } from "~/ui/tooltip";
import { resetFourYearStart, startFourYear, useFourYearFacts } from "./data";
import { PlanPage } from "./plan-page";
import {
  INITIAL_FOUR_YEAR_STORE,
  useFourYear,
  validDocs,
  whenSaved,
} from "./store";

// /plan on the fixtures' course index and a fake IndexedDB. 2026-09-26 is in
// Fall 2026, so a plan from Fall 2025 has two done semesters and one in
// progress.

const NOW = "2026-09-26T16:00:00.000Z";

/** The route's URL state, kept in React state as the router would. */
function Harness({ initial }: { initial: PlanSearch }) {
  const [search, setSearch] = useState<PlanSearch>(initial);
  return (
    <PlanPage
      nav={{
        search,
        go: (patch) => setSearch((prev) => ({ ...prev, ...patch })),
      }}
    />
  );
}

function renderPlan(initial: PlanSearch = {}) {
  // Before the page's own call, which then shares this start.
  void startFourYear({ source: createBucketDataSource(mockDataSource) });
  const router = createRouter({
    routeTree: createRootRoute({
      component: () => <Harness initial={initial} />,
    }),
    history: createMemoryHistory({ initialEntries: ["/plan"] }),
  });
  render(
    <TooltipProvider delayDuration={0}>
      <RouterProvider router={router} />
      <Toaster />
    </TooltipProvider>,
  );
  return userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
}

async function seed(doc: FourYearDoc) {
  const db = new TerpsicleDb();
  await db.open();
  await db.fourYear.put(doc);
  db.close();
}

async function saved(): Promise<FourYearDoc[]> {
  await whenSaved();
  const db = new TerpsicleDb();
  await db.open();
  const rows = await db.fourYear.toArray();
  db.close();
  return rows;
}

/** A button in the toast that says `text`. */
function toastButton(text: string, name: string): HTMLElement {
  const toast = screen.getByText(text).closest("[data-sonner-toast]");
  if (!(toast instanceof HTMLElement)) throw new Error(`No toast "${text}"`);
  return within(toast).getByRole("button", { name });
}

const column = (name: string) =>
  screen.getByRole("region", { name: new RegExp(`^${name}$`) });

/** A plan from Fall 2025 with CMSC351 in Spring 2027 and a placeholder in Fall 2027. */
const PLAN = aFourYear({
  firstTermId: "202508",
  entries: [
    aFourYearEntry({ id: "entry_cmsc351", term: "202701", code: "CMSC351" }),
    aFourYearWildcardEntry({ id: "entry_cmsc4xx", term: "202708" }),
  ],
});

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(NOW));
  // Radix menus measure; happy-dom has no layout.
  window.matchMedia = ((query: string) => ({
    matches: query === "(min-width: 1024px)",
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
  useFourYear.setState(INITIAL_FOUR_YEAR_STORE);
  useCourseIndex.setState(INITIAL_COURSE_INDEX_STATE);
  useFourYearFacts.setState({ latestTermId: null, calendars: [] });
  resetFourYearStart();
  await Dexie.delete(LOCAL_DB_NAME);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the first visit", () => {
  it("offers two ways in, and starts a plan from the semester you pick", async () => {
    const user = renderPlan();
    expect(await screen.findByText("Plan your four years")).toBeVisible();
    expect(screen.getByText("Coming next")).toBeVisible();
    expect(screen.getByLabelText("I started at UMD in")).toHaveValue("202608");

    await user.selectOptions(
      screen.getByLabelText("I started at UMD in"),
      "202508",
    );
    await user.click(screen.getByRole("button", { name: "Start planning" }));

    expect(await screen.findByText("My plan")).toBeVisible();
    for (const term of ["Before UMD", "Fall 2025", "Spring 2029"])
      expect(screen.getByRole("heading", { name: term })).toBeVisible();
    expect(within(column("Fall 2025")).getByText("Done")).toBeVisible();
    expect(within(column("Fall 2026")).getByText("In progress")).toBeVisible();
    expect(within(column("Spring 2027")).getByText("Planned")).toBeVisible();
    expect(screen.getByText("0 of 120 credits")).toBeVisible();

    const [doc] = await saved();
    expect(doc).toMatchObject({ name: "My plan", firstTermId: "202508" });
  });
});

describe("a saved plan", () => {
  it("shows its blocks with credits and titles from the course index", async () => {
    await seed(PLAN);
    renderPlan();
    const spring = await screen.findByRole("region", { name: /^Spring 2027$/ });
    expect(within(spring).getByText("CMSC351")).toBeVisible();
    expect(await within(spring).findByText("Algorithms")).toBeVisible();
    expect(within(spring).getByText("3 cr")).toBeVisible();
    const fall = column("Fall 2027");
    expect(within(fall).getByText("CMSC4XX")).toBeVisible();
    expect(within(fall).getByText("Any CMSC 400-level")).toBeVisible();
    expect(await screen.findByText("6 of 120 credits")).toBeVisible();
  });

  it("adds a course from Search to the semester you picked, with Undo", async () => {
    await seed(PLAN);
    const user = renderPlan();
    await user.click(
      await screen.findByRole("button", { name: "Add a course to Fall 2026" }),
    );
    const box = screen.getByRole("searchbox", { name: "Search courses" });
    await waitFor(() => expect(box).toHaveFocus());
    expect(screen.getByText(/Adding to/)).toHaveTextContent(
      "Adding to Fall 2026",
    );
    await user.type(box, "cmsc 42");
    await user.click(
      await screen.findByRole("button", { name: "Add CMSC420 to Fall 2026" }),
    );
    expect(within(column("Fall 2026")).getByText("CMSC420")).toBeVisible();
    expect(await screen.findByText("Added CMSC420 to Fall 2026")).toBeVisible();
    expect((await saved())[0]?.entries).toHaveLength(3);

    await user.click(toastButton("Added CMSC420 to Fall 2026", "Undo"));
    expect(within(column("Fall 2026")).queryByText("CMSC420")).toBeNull();
    expect((await saved())[0]?.entries).toHaveLength(2);
  });

  it("adds a placeholder for a pattern, then picks a course for it", async () => {
    await seed(PLAN);
    const user = renderPlan({ tab: "search", semester: "202801" });
    const box = await screen.findByRole("searchbox", {
      name: "Search courses",
    });
    await user.type(box, "cmsc4xx");
    await user.click(
      await screen.findByRole("button", { name: "Add CMSC4XX to Spring 2028" }),
    );
    const spring = column("Spring 2028");
    expect(within(spring).getByText("CMSC4XX")).toBeVisible();

    await user.click(
      within(spring).getByRole("button", { name: /^CMSC4XX 3 cr/ }),
    );
    expect(await screen.findByText(/Picking a course for/)).toBeVisible();
    await user.click(
      await screen.findByRole("button", { name: "Use CMSC420 for CMSC4XX" }),
    );
    await waitFor(() =>
      expect(within(spring).getByText("CMSC420")).toBeVisible(),
    );
    expect(within(spring).queryByText("CMSC4XX")).toBeNull();
  });

  it("moves a block with the keyboard through its menu, and ⌘Z takes it back", async () => {
    await seed(PLAN);
    const user = renderPlan();
    (await screen.findByRole("button", { name: "CMSC351 options" })).focus();
    await user.keyboard("{Enter}");
    (await screen.findByRole("menuitem", { name: "Move to…" })).focus();
    await user.keyboard("{ArrowRight}");
    (await screen.findByRole("menuitem", { name: /^Fall 2027/ })).focus();
    await user.keyboard("{Enter}");
    expect(within(column("Fall 2027")).getByText("CMSC351")).toBeVisible();
    expect(within(column("Spring 2027")).queryByText("CMSC351")).toBeNull();

    await user.keyboard("{Control>}z{/Control}");
    await user.keyboard("{Meta>}z{/Meta}");
    await waitFor(() =>
      expect(within(column("Spring 2027")).getByText("CMSC351")).toBeVisible(),
    );
  });

  it("removes a block from its menu, with Undo in the toast", async () => {
    await seed(PLAN);
    const user = renderPlan();
    await user.click(
      await screen.findByRole("button", { name: "CMSC351 options" }),
    );
    await user.click(
      await screen.findByRole("menuitem", { name: "Remove from Spring 2027" }),
    );
    expect(within(column("Spring 2027")).queryByText("CMSC351")).toBeNull();
    expect(
      await screen.findByText("Removed CMSC351 from Spring 2027"),
    ).toBeVisible();
  });

  it("deletes the plan without asking, and Undo brings it back", async () => {
    await seed(PLAN);
    const user = renderPlan();
    await user.click(await screen.findByRole("button", { name: /^My plan/ }));
    await user.click(await screen.findByRole("menuitem", { name: "Delete" }));
    expect(await screen.findByText("Plan your four years")).toBeVisible();
    await user.click(toastButton("Deleted My plan", "Undo"));
    expect(await screen.findByText("CMSC351")).toBeVisible();
  });

  it("lists GenEd progress, and Find a course searches that GenEd", async () => {
    await seed(PLAN);
    const user = renderPlan();
    const writing = await screen.findByRole("region", {
      name: "Fundamental Studies",
    });
    expect(within(writing).getByText("Academic Writing")).toBeVisible();
    await user.click(
      within(writing).getAllByRole("button", {
        name: "Find a course",
      })[0] as HTMLElement,
    );
    expect(await screen.findByText(/Courses that count for/)).toHaveTextContent(
      "Courses that count for FSAW",
    );
  });

  it("shows problems quietly in their tab", async () => {
    await seed(
      aFourYear({
        firstTermId: "202508",
        entries: [
          aFourYearEntry({
            id: "entry_cmsc999",
            term: "202701",
            code: "CMSC999",
          }),
        ],
      }),
    );
    const user = renderPlan();
    await user.click(await screen.findByRole("tab", { name: /Problems/ }));
    expect(
      await screen.findByRole("button", { name: "CMSC999 isn't in Testudo" }),
    ).toBeVisible();
    expect(
      within(column("Spring 2027")).getByRole("listitem", {
        name: "CMSC999, has a problem",
      }),
    ).toBeVisible();
  });
});

describe("validDocs", () => {
  it("skips rows that don't validate, oldest first", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const older = aFourYear({
      id: "fouryear_old",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const newer = aFourYear({ id: "fouryear_new" });
    expect(validDocs([newer, { id: "x" }, older]).map((d) => d.id)).toEqual([
      "fouryear_old",
      "fouryear_new",
    ]);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});
