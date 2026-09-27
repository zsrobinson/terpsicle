import "fake-indexeddb/auto";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
  stringifySearchWith,
} from "@tanstack/react-router";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { track } from "~/app/analytics";
import { isApple } from "~/app/shortcuts";
import { LOCAL_DB_NAME } from "~/core/schema";
import type { FourYearDoc } from "~/core/schema/four-year";
import { FLAGS_OFF, useAccount } from "~/features/auth/account-store";
import {
  resetFourYearStart,
  startFourYear,
  useFourYearFacts,
} from "~/features/four-year/data";
import {
  INITIAL_FOUR_YEAR_STORE,
  useFourYear,
  validDocs,
  whenSaved,
} from "~/features/four-year/store";
import {
  aFourYear,
  aFourYearEntry,
  aFourYearWildcardEntry,
  aPlan,
  aPlanCourse,
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
import { Route } from "./plan";
import { Route as ImportRoute } from "./plan.import";
import { Route as GenEdRoute } from "./plan.index";
import { Route as ProblemsRoute } from "./plan.problems";
import { Route as SamplesRoute } from "./plan.samples";
import { Route as SearchRoute } from "./plan.search";

// /plan on the fixtures' course index and a fake IndexedDB. 2026-09-26 is in
// Fall 2026, so a plan from Fall 2025 has two done semesters and one in
// progress.

vi.mock("~/app/analytics", async (original) => ({
  ...(await original<typeof import("~/app/analytics")>()),
  track: vi.fn(),
}));

const NOW = "2026-09-26T16:00:00.000Z";

let router: ReturnType<typeof createRouter>;

/**
 * The real `/plan` routes (the layout's search schema, a route per view,
 * the old `?tab=` redirect, push and replace, Back) on a memory history.
 */
function renderPlan(initial = "/plan") {
  // Before the page's own call, which then shares this start.
  void startFourYear({ source: createBucketDataSource(mockDataSource) });
  const root = createRootRoute();
  const plan = Route.update({
    id: "/plan",
    path: "/plan",
    getParentRoute: () => root,
  } as never);
  const views = (
    [
      [GenEdRoute, "/"],
      [ProblemsRoute, "/problems"],
      [SearchRoute, "/search"],
      [SamplesRoute, "/samples"],
      [ImportRoute, "/import"],
    ] as const
  ).map(([view, path]) =>
    view.update({ id: path, path, getParentRoute: () => plan } as never),
  );
  router = createRouter({
    routeTree: root.addChildren([plan.addChildren(views)]),
    history: createMemoryHistory({ initialEntries: [initial] }),
    // As src/router.tsx writes search params.
    stringifySearch: stringifySearchWith(JSON.stringify),
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
    matches: false,
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
    expect(
      screen.getByRole("button", { name: "Paste your transcript" }),
    ).toBeVisible();
    expect(screen.queryByText("Coming next")).toBeNull();
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

  it("adds the top result with Enter, once: then it says Added", async () => {
    await seed(PLAN);
    const user = renderPlan();
    await user.click(
      await screen.findByRole("button", { name: "Add a course to Fall 2026" }),
    );
    const box = screen.getByRole("searchbox", { name: "Search courses" });
    await waitFor(() => expect(box).toHaveFocus());
    await user.type(box, "cmsc 42");
    // The top result's button shows the shortcut.
    const top = await screen.findByRole("button", {
      name: "Add CMSC420 to Fall 2026",
    });
    expect(
      within(screen.getByRole("list", { name: "Courses" }))
        .getAllByRole("button", { name: /^Add / })
        .at(0),
    ).toBe(top);
    await user.hover(top);
    expect(
      await screen.findByRole("tooltip", {
        name: "Add CMSC420 to Fall 2026 ↵",
      }),
    ).toBeInTheDocument();

    await user.type(box, "{Enter}");
    expect(within(column("Fall 2026")).getByText("CMSC420")).toBeVisible();
    expect(await screen.findByText("Added CMSC420 to Fall 2026")).toBeVisible();
    expect((await saved())[0]?.entries).toHaveLength(3);

    // Already there: a quiet "Added" instead of a second Add.
    expect(
      screen.queryByRole("button", { name: "Add CMSC420 to Fall 2026" }),
    ).toBeNull();
    const row = screen
      .getAllByTestId("plan-search-added")[0]
      ?.closest("li") as HTMLElement;
    expect(within(row).getByText("CMSC420")).toBeVisible();
    expect(row).toHaveTextContent("Added to Fall 2026");

    // Enter again says so and adds nothing.
    await user.type(box, "{Enter}");
    expect(
      await screen.findByText("CMSC420's already in Fall 2026"),
    ).toBeVisible();
    expect(within(column("Fall 2026")).getAllByText("CMSC420")).toHaveLength(1);
    expect((await saved())[0]?.entries).toHaveLength(3);
  });

  it("shows a course in another semester as addable here", async () => {
    await seed(PLAN);
    const user = renderPlan("/plan?tab=search&semester=202608");
    const box = await screen.findByRole("searchbox", {
      name: "Search courses",
    });
    await user.type(box, "cmsc351");
    // CMSC351 is in Spring 2027; adding it to Fall 2026 is a choice, not a duplicate.
    expect(
      await screen.findByRole("button", { name: "Add CMSC351 to Fall 2026" }),
    ).toBeVisible();
    expect(screen.getByText("In Spring 2027")).toBeVisible();
    expect(screen.queryByTestId("plan-search-added")).toBeNull();
  });

  it("adds a placeholder for a pattern, then picks a course for it", async () => {
    await seed(PLAN);
    const user = renderPlan("/plan?tab=search&semester=202801");
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

    await user.keyboard(isApple ? "{Meta>}z{/Meta}" : "{Control>}z{/Control}");
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
    await user.click(await screen.findByRole("button", { name: /^Problems/ }));
    expect(
      await screen.findByRole("button", { name: "CMSC999 isn't in Testudo" }),
    ).toBeVisible();
    expect(
      within(column("Spring 2027")).getByRole("button", {
        name: /^CMSC999.*has a problem/,
      }),
    ).toBeVisible();
  });
});

describe("View schedule", () => {
  const NEXT = aFourYear({
    firstTermId: "202508",
    entries: [
      aFourYearEntry({ id: "entry_cmsc351", term: "202701", code: "CMSC351" }),
      aFourYearEntry({ id: "entry_math141", term: "202701", code: "MATH141" }),
    ],
  });

  it("sits on the next semester only, and hands it to the scheduler", async () => {
    await seed(NEXT);
    renderPlan();
    const spring = await screen.findByRole("region", { name: /^Spring 2027$/ });
    const link = within(spring).getByRole("link", { name: "View schedule" });
    expect(link).toHaveAttribute(
      "href",
      "/schedule/courses?term=202701&from=plan",
    );
    expect(
      within(column("Fall 2026")).queryByRole("link", {
        name: "View schedule",
      }),
    ).toBeNull();
    expect(
      within(column("Fall 2027")).queryByRole("link", {
        name: "View schedule",
      }),
    ).toBeNull();
  });

  it("counts what the linked plan has placed, and follows it as the scheduler changes it", async () => {
    await seed(NEXT);
    const db = new TerpsicleDb();
    await db.plans.put(
      aPlan({
        id: "plan_linked_a",
        termId: "202701",
        courses: [aPlanCourse({ courseCode: "CMSC351" })],
      }),
    );
    renderPlan();
    const spring = await screen.findByRole("region", { name: /^Spring 2027$/ });
    expect(
      await within(spring).findByText("From Plan A: 1 of 2 placed"),
    ).toBeVisible();
    // The scheduler, in another tab, places MATH141.
    await db.plans.update("plan_linked_a", {
      courses: [
        aPlanCourse({ courseCode: "CMSC351" }),
        aPlanCourse({ courseCode: "MATH141" }),
      ],
    });
    expect(
      await within(spring).findByText("From Plan A: 2 of 2 placed"),
    ).toBeVisible();
    db.close();
  });

  it("says so, instead of linking, while Testudo doesn't list the term", async () => {
    await seed(NEXT);
    renderPlan();
    const spring = await screen.findByRole("region", { name: /^Spring 2027$/ });
    await act(() => useFourYearFacts.setState({ latestTermId: "202608" }));
    expect(within(spring).getByText("Not on Testudo yet")).toBeVisible();
    expect(
      within(spring).queryByRole("link", { name: "View schedule" }),
    ).toBeNull();
  });
});

describe("links to the other products", () => {
  afterEach(() => useAccount.setState({ flags: FLAGS_OFF }));

  it("View todos sits on the semester in progress, while Todo is on", async () => {
    useAccount.setState({ flags: { ...FLAGS_OFF, todo: true } });
    await seed(PLAN);
    renderPlan();
    const fall = await screen.findByRole("region", { name: /^Fall 2026$/ });
    expect(
      within(fall).getByRole("link", { name: "View todos" }),
    ).toHaveAttribute("href", "/todo");
    expect(
      within(column("Spring 2027")).queryByRole("link", { name: "View todos" }),
    ).toBeNull();
    await userEvent
      .setup()
      .click(within(fall).getByRole("link", { name: "View todos" }));
    expect(track).toHaveBeenCalledWith("cross_link_clicked", {
      from: "plan",
      to: "todo",
    });
  });

  it("has no View todos while Todo is off", async () => {
    await seed(PLAN);
    renderPlan();
    const fall = await screen.findByRole("region", { name: /^Fall 2026$/ });
    expect(within(fall).queryByRole("link", { name: "View todos" })).toBeNull();
  });

  it("a course block's menu has View reviews, while Reviews is on", async () => {
    useAccount.setState({ flags: { ...FLAGS_OFF, reviews: "on" } });
    await seed(PLAN);
    const user = renderPlan();
    await user.click(
      await screen.findByRole("button", { name: "CMSC351 options" }),
    );
    expect(
      await screen.findByRole("menuitem", { name: "View reviews" }),
    ).toHaveAttribute("href", "/reviews/courses/CMSC351");
    await user.click(screen.getByRole("menuitem", { name: "View reviews" }));
    expect(track).toHaveBeenCalledWith("cross_link_clicked", {
      from: "plan",
      to: "reviews",
    });
  });

  it("a placeholder's menu has no View reviews", async () => {
    useAccount.setState({ flags: { ...FLAGS_OFF, reviews: "on" } });
    await seed(PLAN);
    const user = renderPlan();
    await user.click(
      await screen.findByRole("button", { name: "CMSC4XX options" }),
    );
    await screen.findByRole("menuitem", { name: "Pick a course" });
    expect(screen.queryByRole("menuitem", { name: "View reviews" })).toBeNull();
  });
});

describe("reordering", () => {
  it("moves a block up within its semester from the menu", async () => {
    await seed(
      aFourYear({
        firstTermId: "202508",
        entries: [
          aFourYearEntry({
            id: "entry_cmsc351",
            term: "202701",
            code: "CMSC351",
          }),
          aFourYearEntry({
            id: "entry_cmsc420",
            term: "202701",
            code: "CMSC420",
          }),
        ],
      }),
    );
    const user = renderPlan();
    await user.click(
      await screen.findByRole("button", { name: "CMSC420 options" }),
    );
    expect(screen.queryByRole("menuitem", { name: "Move down" })).toBeNull();
    await user.click(await screen.findByRole("menuitem", { name: "Move up" }));
    const codes = within(column("Spring 2027"))
      .getAllByRole("button", { name: /options$/ })
      .map((b) => b.getAttribute("aria-label"));
    expect(codes).toEqual(["CMSC420 options", "CMSC351 options"]);
  });
});

describe("the URL", () => {
  it("keeps the search in it, and Back from a course lands on the same results", async () => {
    await seed(PLAN);
    const user = renderPlan("/plan?tab=search");
    const box = await screen.findByRole("searchbox", {
      name: "Search courses",
    });
    await user.type(box, "cmsc42");
    await waitFor(() =>
      expect(router.state.location.search).toMatchObject({ q: "cmsc42" }),
    );
    await user.click(
      await screen.findByRole("button", { name: /^CMSC420 3 cr/ }),
    );
    expect(
      await screen.findByRole("heading", { name: "CMSC420" }),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Back to Search" }));
    await waitFor(() =>
      expect(router.state.location.search).toMatchObject({ q: "cmsc42" }),
    );
    expect(router.state.location.search).not.toHaveProperty("course");
    expect(
      await screen.findByRole("searchbox", { name: "Search courses" }),
    ).toHaveValue("cmsc42");
    // The in-app Back went back: Forward reopens the course.
    router.history.forward();
    expect(
      await screen.findByRole("heading", { name: "CMSC420" }),
    ).toBeVisible();
  });

  it("sends an old ?tab= link to its view's route, keeping the rest", async () => {
    await seed(PLAN);
    renderPlan("/plan?tab=search&q=cmsc42");
    expect(
      await screen.findByRole("searchbox", { name: "Search courses" }),
    ).toHaveValue("cmsc42");
    expect(router.state.location.pathname).toBe("/plan/search");
    expect(router.state.location.search).toEqual({ q: "cmsc42" });
  });

  it("makes each view on the rail a route, and Back returns to the last", async () => {
    await seed(PLAN);
    const user = renderPlan();
    const rail = await screen.findByRole("navigation", { name: "Plan views" });
    await user.click(within(rail).getByRole("button", { name: /^Problems/ }));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/plan/problems"),
    );
    expect(
      within(rail).getByRole("button", { name: /^Problems/ }),
    ).toHaveAttribute("aria-pressed", "true");
    await user.click(within(rail).getByRole("button", { name: "Samples" }));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/plan/samples"),
    );
    router.history.back();
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/plan/problems"),
    );
    expect(
      await screen.findByRole("region", { name: "Prerequisites and credits" }),
    ).toBeVisible();
  });

  it("hides the sidebar when the open view is clicked again, and any view brings it back", async () => {
    await seed(PLAN);
    const user = renderPlan();
    const rail = await screen.findByRole("navigation", { name: "Plan views" });
    const gened = within(rail).getByRole("button", { name: "GenEd" });
    await user.click(gened);
    expect(
      screen.getByRole("complementary", { hidden: true }),
    ).not.toBeVisible();
    expect(gened).toHaveAttribute("aria-pressed", "false");
    await user.keyboard("3");
    await waitFor(() =>
      expect(router.state.location.pathname).toBe("/plan/search"),
    );
    expect(
      screen.getByRole("complementary", { name: "Sidebar" }),
    ).toBeVisible();
  });

  it("closes a course opened by a link in place", async () => {
    await seed(PLAN);
    const user = renderPlan("/plan?course=CMSC351");
    await user.click(
      await screen.findByRole("button", { name: "Back to GenEd" }),
    );
    await waitFor(() =>
      expect(router.state.location.search).not.toHaveProperty("course"),
    );
    expect(router.state.location.pathname).toBe("/plan");
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
