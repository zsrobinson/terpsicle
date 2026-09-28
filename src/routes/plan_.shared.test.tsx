import "fake-indexeddb/auto";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
  stringifySearchWith,
} from "@tanstack/react-router";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Dexie from "dexie";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LOCAL_DB_NAME } from "~/core/schema";
import { encodeFourYearShare } from "~/core/share/four-year-share";
import {
  resetFourYearStart,
  startFourYear,
  useFourYearFacts,
} from "~/features/four-year/data";
import {
  INITIAL_FOUR_YEAR_STORE,
  useFourYear,
  whenSaved,
} from "~/features/four-year/store";
import {
  aFourYear,
  aFourYearEntry,
  aFourYearWildcardEntry,
  mockDataSource,
} from "~/fixtures";
import { track } from "~/lib/analytics";
import {
  INITIAL_COURSE_INDEX_STATE,
  useCourseIndex,
} from "~/state/course-index-store";
import { createBucketDataSource } from "~/state/data-source";
import { TerpsicleDb } from "~/state/db";
import { Toaster } from "~/ui/sonner";
import { TooltipProvider } from "~/ui/tooltip";
import { Route } from "./plan_.shared";

// /plan/shared on the fixtures' course index and a fake IndexedDB: a
// four-year plan read from its link, read-only, and Save a copy.

vi.mock("~/lib/analytics", async (original) => ({
  ...(await original<typeof import("~/lib/analytics")>()),
  track: vi.fn(),
}));

const SHARED = aFourYear({
  name: "Computer Science",
  firstTermId: "202608",
  entries: [
    aFourYearEntry({ id: "entry_cmsc131", term: "202608", code: "CMSC131" }),
    aFourYearWildcardEntry({ id: "entry_cmsc4xx", term: "202708" }),
  ],
  grades: { entry_cmsc131: "A" },
});

function renderShared(param: string) {
  void startFourYear({ source: createBucketDataSource(mockDataSource) });
  const root = createRootRoute();
  const shared = Route.update({
    id: "/plan/shared",
    path: "/plan/shared",
    getParentRoute: () => root,
  } as never);
  const plan = createRoute({
    getParentRoute: () => root,
    path: "/plan",
    component: () => <p>Plan page</p>,
  });
  const router = createRouter({
    routeTree: root.addChildren([shared, plan]),
    history: createMemoryHistory({
      initialEntries: [`/plan/shared?plan=${param}`],
    }),
    stringifySearch: stringifySearchWith(JSON.stringify),
  });
  render(
    <TooltipProvider delayDuration={0}>
      <RouterProvider router={router} />
      <Toaster />
    </TooltipProvider>,
  );
  return userEvent.setup();
}

beforeEach(async () => {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
  vi.mocked(track).mockClear();
  useFourYear.setState(INITIAL_FOUR_YEAR_STORE);
  useCourseIndex.setState(INITIAL_COURSE_INDEX_STATE);
  useFourYearFacts.setState({ latestTermId: null, calendars: [] });
  resetFourYearStart();
  await Dexie.delete(LOCAL_DB_NAME);
});

describe("a shared four-year plan", () => {
  it("reads without an account, with nothing to change", async () => {
    renderShared(encodeFourYearShare(SHARED));
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Computer Science",
      }),
    ).toBeVisible();
    expect(screen.getByText("Shared four-year plan")).toBeVisible();
    const fall = screen.getByRole("region", { name: /^Fall 2026$/ });
    expect(within(fall).getByText("CMSC131")).toBeVisible();
    // Never the grade, and no editing.
    expect(screen.queryByText("A")).toBeNull();
    expect(screen.queryByRole("button", { name: /^Add a course/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /options$/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Find a course" })).toBeNull();
    expect(track).toHaveBeenCalledWith("four_year_shared_opened", {
      outcome: "ok",
    });
  });

  it("Save a copy makes it one of yours, and opens Plan", async () => {
    const user = renderShared(encodeFourYearShare(SHARED));
    const save = await screen.findByRole("button", { name: "Save a copy" });
    await waitFor(() =>
      expect(save).not.toHaveAttribute("aria-disabled", "true"),
    );
    await user.click(save);
    expect(await screen.findByText("Plan page")).toBeVisible();
    await whenSaved();
    const db = new TerpsicleDb();
    await db.open();
    const [doc] = await db.fourYear.toArray();
    db.close();
    expect(doc).toMatchObject({
      name: "Computer Science",
      firstTermId: "202608",
      grades: {},
    });
    expect(doc?.entries.map((e) => e.kind)).toEqual(["course", "wildcard"]);
    expect(doc?.entries.map((e) => e.id)).not.toContain("entry_cmsc131");
    expect(useFourYear.getState().activeId).toBe(doc?.id);
    expect(track).toHaveBeenCalledWith("four_year_shared_saved", {});
  });

  it("says a damaged link is damaged", async () => {
    renderShared("1.nonsense");
    expect(
      await screen.findByText(/This share link is incomplete or damaged/),
    ).toBeVisible();
  });

  it("offers Reload for a link from a newer version", async () => {
    renderShared("9.abc");
    expect(
      await screen.findByText(/made by a newer version of Terpsicle/),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Reload" })).toBeVisible();
    expect(track).toHaveBeenCalledWith("four_year_shared_opened", {
      outcome: "newer-version",
    });
  });
});
