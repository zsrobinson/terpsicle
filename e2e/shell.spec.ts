import { expect, type Page, test } from "@playwright/test";
import { encodeShare } from "../src/core/share/share";

// The M3 shell on `pnpm dev:mock`: first visit, plan tabs with undo, the
// collapsible sidebar, the shared-link pill and the phone drawer.

const TAB_LABELS = [
  "Courses",
  "Search",
  "Problems",
  "Travel",
  "Blocks",
  "Generate",
  "Register",
];

let errors: string[] = [];

test.beforeEach(async ({ page }) => {
  errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
});

test.afterEach(() => {
  expect(errors).toEqual([]);
});

async function open(page: Page, path = "/schedule") {
  await page.goto(path);
  await expect(page.locator('[data-slot="app-bar"]')).toBeVisible();
}

const planTabs = (page: Page) =>
  page.getByRole("navigation", { name: "Plans" }).getByRole("listitem");

test.describe("desktop", () => {
  test.skip(({ isMobile }) => isMobile, "desktop layout");

  test("first visit lands in the app with an empty Plan A", async ({
    page,
  }) => {
    await open(page);
    await expect(planTabs(page)).toHaveText(["Plan A"]);
    await expect(
      page.getByRole("button", { name: /Spring 2027/ }),
    ).toBeVisible();
    // The Courses tab is headed by the plan it lists.
    await expect(page.getByRole("heading", { name: "Plan A" })).toBeVisible();
    await expect(page.getByTestId("first-visit")).toBeVisible();
    // The bar's credits show from 1536px; narrower, Share has their room and
    // the Courses panel's header says them.
    await expect(page.getByText("0 credits", { exact: true })).toBeHidden();
    await page.setViewportSize({ width: 1600, height: 900 });
    await expect(page.getByText("0 credits", { exact: true })).toBeVisible();
    await expect(
      page
        .getByRole("navigation", { name: "Sidebar tabs" })
        .getByRole("button"),
    ).toHaveText(TAB_LABELS);
  });

  test("the calendar fills the height, with nothing below it", async ({
    page,
  }) => {
    await open(page);
    const calendar = page.getByRole("region", { name: "Week calendar" });
    for (const day of ["Mon", "Tue", "Wed", "Thu", "Fri"])
      await expect(calendar.getByText(day, { exact: true })).toBeVisible();
    const box = await calendar.boundingBox();
    const viewport = page.viewportSize();
    if (!box || !viewport) throw new Error("calendar or viewport not measured");
    expect(box.y + box.height).toBeCloseTo(viewport.height, 0);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("create, rename, duplicate and delete plans, with undo", async ({
    page,
  }) => {
    await open(page);
    await page.getByRole("button", { name: "New plan" }).click();
    await page.getByRole("menuitem", { name: /Empty plan/ }).click();
    await expect(planTabs(page)).toHaveText(["Plan A", "Plan B"]);

    await planTabs(page).filter({ hasText: "Plan B" }).dblclick();
    await page.keyboard.type("Mornings off");
    await page.keyboard.press("Enter");
    await expect(planTabs(page)).toHaveText(["Plan A", "Mornings off"]);

    await page.getByRole("button", { name: "Mornings off options" }).click();
    await page.getByRole("menuitem", { name: "Duplicate" }).click();
    await expect(planTabs(page)).toHaveText([
      "Plan A",
      "Mornings off",
      "Copy of Mornings off",
    ]);

    await page
      .getByRole("button", { name: "Copy of Mornings off options" })
      .click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await expect(planTabs(page)).toHaveText(["Plan A", "Mornings off"]);
    // No confirmation dialog, just a way back.
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await expect(page.getByText("Deleted Copy of Mornings off")).toBeVisible();
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(planTabs(page)).toHaveText([
      "Plan A",
      "Mornings off",
      "Copy of Mornings off",
    ]);

    // Keyboard undo, then everything survives a reload.
    await page.keyboard.press("ControlOrMeta+z");
    await expect(planTabs(page)).toHaveText(["Plan A", "Mornings off"]);
    await page.reload();
    await expect(planTabs(page)).toHaveText(["Plan A", "Mornings off"]);
  });

  test("at 1100px, plan tabs never run under the bar's status", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1100, height: 720 });
    // Signed in, where the account and sync status take the most room.
    await page.goto("/privacy");
    await page.evaluate(async () => {
      await fetch("/api/auth/test-sign-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: `e2enarrow${Math.random().toString(36).slice(2, 8)}`,
          return: "/schedule",
        }),
      });
    });
    await open(page);
    await expect(
      page.getByRole("banner").getByRole("button", { name: /^Account/ }),
    ).toBeVisible();
    for (let i = 0; i < 4; i++) {
      await page.getByRole("button", { name: "New plan" }).click();
      await page.getByRole("menuitem", { name: /Empty plan/ }).click();
    }
    // The plans' last control ends before the status starts: the nav's own
    // box stays in its column even when its tabs spill past it.
    const last = page
      .getByRole("navigation", { name: "Plans" })
      .getByRole("button", { name: "New plan" });
    const problems = page
      .getByRole("banner")
      .getByRole("button", { name: /problem/i })
      .first();
    const end = await last.boundingBox();
    const status = await problems.boundingBox();
    expect(end && status && end.x + end.width <= status.x).toBe(true);
  });

  test("three plan tabs fit whole at 1440px and two at 1280px, never under the status", async ({
    page,
  }) => {
    // Signed in (the account, bell and sync status take the most room), with
    // the demo's courses (credits and problems in the status) and three plans
    // loaded straight at 1440px, as someone opens the app.
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/privacy");
    await page.evaluate(async () => {
      await fetch("/api/auth/test-sign-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: `e2eroom${Math.random().toString(36).slice(2, 8)}`,
          return: "/schedule",
        }),
      });
    });
    await open(page, "/schedule?demo=1");
    await expect(
      page.getByRole("banner").getByRole("button", { name: /^Account/ }),
    ).toBeVisible();
    await expect(planTabs(page)).toHaveText(["Plan A", "Plan B"]);
    await page.getByRole("button", { name: "New plan" }).click();
    await page.getByRole("menuitem", { name: /Empty plan/ }).click();
    const nav = page.getByRole("navigation", { name: "Plans" });
    const problems = page
      .getByRole("banner")
      .getByRole("button", { name: /problem/i })
      .first();
    const clearOfStatus = async () => {
      const end = await nav
        .getByRole("button", { name: "New plan" })
        .boundingBox();
      const status = await problems.boundingBox();
      return end !== null && status !== null && end.x + end.width <= status.x;
    };
    /** The visible tabs whose names show whole, not cut to "Pla…". */
    const wholeTabs = () =>
      nav.evaluate(
        (el) =>
          [...el.querySelectorAll("li .truncate")].filter(
            (name) => name.scrollWidth <= name.clientWidth,
          ).length,
      );

    await expect(planTabs(page)).toHaveText(["Plan A", "Plan B", "Plan C"]);
    await expect.poll(wholeTabs).toBe(3);
    await expect(nav.getByRole("button", { name: /more plans?$/ })).toHaveCount(
      0,
    );
    expect(await clearOfStatus()).toBe(true);

    await page.setViewportSize({ width: 1280, height: 800 });
    await expect.poll(wholeTabs).toBeGreaterThanOrEqual(2);
    expect(await clearOfStatus()).toBe(true);

    await page.setViewportSize({ width: 1100, height: 720 });
    await expect.poll(clearOfStatus).toBe(true);
  });

  test("clicking the open tab collapses the sidebar; any tab reopens it", async ({
    page,
  }) => {
    await open(page);
    const rail = page.getByRole("navigation", { name: "Sidebar tabs" });
    const sidebar = page.getByRole("complementary", { name: "Sidebar" });
    const calendar = page.getByRole("region", { name: "Week calendar" });
    const before = (await calendar.boundingBox())?.width ?? 0;

    await rail.getByRole("button", { name: "Courses" }).click();
    await expect(sidebar).toBeHidden();
    expect((await calendar.boundingBox())?.width ?? 0).toBeGreaterThan(before);

    await rail.getByRole("button", { name: "Travel" }).click();
    await expect(sidebar).toBeVisible();
    await expect(page.getByRole("heading", { name: "Travel" })).toBeVisible();

    // Remembered on the next visit.
    await page.keyboard.press("5");
    await page.reload();
    await expect(page.getByRole("heading", { name: "Blocks" })).toBeVisible();
  });

  test("on a short screen every rail tab can be reached", async ({ page }) => {
    // A phone on its side is wider than 768px, so it gets this layout, and
    // Chrome leaves it 304px of height (Pixel 7). The rail's last tabs ran
    // off the bottom with no way to scroll to them (the mobile lab's rotate
    // scenario on Android), and a phone has no keyboard for 6 and 7.
    await page.setViewportSize({ width: 863, height: 304 });
    await open(page);
    const rail = page.getByRole("navigation", { name: "Sidebar tabs" });
    const last = rail.getByRole("button", { name: "Register" });
    // Scrolled the way a person can (a wheel or a finger), not by script.
    const box = await rail.boundingBox();
    if (!box) throw new Error("no rail");
    await page.mouse.move(box.x + box.width / 2, box.y + 100);
    await page.mouse.wheel(0, 400);
    await expect(last).toBeInViewport();
    await last.click();
    await expect(
      page.getByRole("heading", { name: "Register", exact: true }),
    ).toBeVisible();
  });

  test("a shared link shows read-only, and Save a copy keeps it", {
    tag: "@critical",
  }, async ({ page }) => {
    const payload = {
      v: 1 as const,
      termId: "202605",
      name: "Alex's summer",
      sections: ["CMSC131-0101"],
    };
    const param = encodeShare(payload);
    await open(page, `/schedule?plan=${param}`);

    // The pill in the top bar, and the panel names it the same way (not the
    // sharer's name for it, which could read as one of your plans).
    await expect(
      page.getByRole("banner").getByText("Shared plan"),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Shared plan" }),
    ).toBeVisible();
    await expect(page.getByText("Summer 2026")).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Plans" })).toHaveCount(
      0,
    );

    await page.getByRole("button", { name: "Save a copy" }).click();
    await expect(page).toHaveURL((url) => !url.searchParams.has("plan"));
    // The pill and the heading, not the toast ("Saved a copy of the shared plan").
    await expect(page.getByText("Shared plan", { exact: true })).toHaveCount(0);
    await expect(planTabs(page)).toHaveText(["Alex's summer"]);
    await expect(
      page.getByRole("button", { name: /Summer 2026/ }),
    ).toBeVisible();
  });

  test("✕ on a shared link goes back to your own plans", async ({ page }) => {
    const param = encodeShare({
      v: 1,
      termId: "202701",
      sections: ["CMSC351-0101"],
    });
    await open(page, `/schedule?plan=${param}`);
    await page.getByRole("button", { name: "Close shared plan" }).click();
    await expect(page).toHaveURL((url) => !url.searchParams.has("plan"));
    await expect(planTabs(page)).toHaveText(["Plan A"]);
  });
});

test.describe("phone", () => {
  test.skip(({ isMobile }) => !isMobile, "phone layout");

  const drawer = (page: Page) => page.locator("[data-workbench-drawer]");
  const drawerTop = async (page: Page) =>
    (await drawer(page).evaluate((el) => el.getBoundingClientRect().top)) ?? 0;

  test("the same shell, with the sidebar in a bottom drawer", async ({
    page,
  }) => {
    await open(page);
    const tabs = page.getByRole("navigation", { name: "Tabs", exact: true });
    await expect(tabs.getByRole("button")).toHaveText(TAB_LABELS);
    await expect(
      page.getByRole("region", { name: "Week calendar" }),
    ).toBeVisible();
    // A first visit's plan is empty: the drawer opens to half, far enough to
    // show the first-visit guide's two ways in.
    await expect(drawer(page)).toHaveAttribute("data-snap", "half");
    await expect(page.getByTestId("first-visit")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Search for a course" }),
    ).toBeInViewport();
    await expect(
      page.getByRole("button", { name: "Generate plans" }),
    ).toBeInViewport();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("tapping a tab raises the drawer to half, the handle to full", {
    tag: "@phone",
  }, async ({ page }) => {
    // With a populated plan there is no adaptive first-visit rise to race.
    await open(page, "/schedule?demo=1");
    const viewport = page.viewportSize();
    if (!viewport) throw new Error("no viewport");
    const tabs = page.getByRole("navigation", { name: "Tabs", exact: true });
    await expect(drawer(page)).toHaveAttribute("data-snap", "peek");

    await tabs.getByRole("button", { name: "Search" }).tap();
    await expect(drawer(page)).toHaveAttribute("data-snap", "half");
    await expect(page.getByRole("heading", { name: "Search" })).toBeVisible();
    await expect
      .poll(() => drawerTop(page))
      .toBeCloseTo(viewport.height / 2, -1);

    await page.getByRole("button", { name: "Raise the panel" }).tap();
    await expect(drawer(page)).toHaveAttribute("data-snap", "full");
    await expect.poll(() => drawerTop(page)).toBeCloseTo(48, -1);

    // Tapping the open tab lowers it again.
    await tabs.getByRole("button", { name: "Search" }).tap();
    await expect(drawer(page)).toHaveAttribute("data-snap", "peek");

    // At peek the search box still shows; tapping it raises the drawer all
    // the way, so the results aren't typed below the screen's edge or under
    // the keyboard (e2e/drawer-keyboard.spec.ts).
    await page.getByRole("combobox", { name: "Search courses" }).tap();
    await expect(drawer(page)).toHaveAttribute("data-snap", "full");
    await page.keyboard.type("cmsc 401");
    await expect(
      page.locator('[data-course-result="CMSC401"]'),
    ).toBeInViewport();
  });

  test("a shorter phone first visit shows both ways to start", {
    tag: "@phone",
  }, async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 659 });
    await open(page);
    await expect(page.getByTestId("first-visit")).toBeVisible();
    // The guide cannot fit at half; this is intentional, not a tab's rise.
    await expect(drawer(page)).toHaveAttribute("data-snap", "full");
    await expect(
      page.getByRole("button", { name: "Search for a course" }),
    ).toBeInViewport();
    await expect(
      page.getByRole("button", { name: "Generate plans" }),
    ).toBeInViewport();
  });
});
