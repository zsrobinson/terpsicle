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
  "Export",
];

let errors: string[] = [];

test.beforeEach(async ({ page }) => {
  errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
});

test.afterEach(() => {
  expect(errors).toEqual([]);
});

async function open(page: Page, path = "/") {
  await page.goto(path);
  await expect(page.getByRole("img", { name: "Terpsicle" })).toBeVisible();
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

  test("a shared link shows read-only, and Save a copy keeps it", async ({
    page,
  }) => {
    const payload = {
      v: 1 as const,
      termId: "202605",
      name: "Alex's summer",
      sections: ["CMSC131-0101"],
    };
    const param = encodeShare(payload);
    await open(page, `/?plan=${param}`);

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
    await open(page, `/?plan=${param}`);
    await page.getByRole("button", { name: "Close shared plan" }).click();
    await expect(page).toHaveURL((url) => !url.searchParams.has("plan"));
    await expect(planTabs(page)).toHaveText(["Plan A"]);
  });
});

test.describe("phone", () => {
  test.skip(({ isMobile }) => !isMobile, "phone layout");

  const drawer = (page: Page) => page.locator("[data-vaul-drawer]");
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

  test("tapping a tab raises the drawer to half, the handle to full", async ({
    page,
  }) => {
    await open(page);
    const viewport = page.viewportSize();
    if (!viewport) throw new Error("no viewport");
    const tabs = page.getByRole("navigation", { name: "Tabs", exact: true });

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

    // At peek the search box still shows; tapping it raises the drawer, so
    // the results aren't typed below the screen's edge.
    await page.getByRole("combobox", { name: "Search courses" }).tap();
    await expect(drawer(page)).toHaveAttribute("data-snap", "half");
    await page.keyboard.type("cmsc 401");
    await expect(
      page.locator('[data-course-result="CMSC401"]'),
    ).toBeInViewport();
  });
});
