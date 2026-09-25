import { expect, type Page, test } from "@playwright/test";

// The draggable sidebar (owner decision 3, docs/UX-REVIEW.md §1.2): drag its
// edge between 320 and 480px, the calendar takes the rest, the width is
// remembered, a double-click resets it. Phones have the drawer instead, which
// makes room for the calendar when details open (UX-REVIEW §3.6).

let errors: string[] = [];
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
});
test.afterEach(() => {
  expect(errors).toEqual([]);
});

async function open(page: Page) {
  await page.goto("/?demo=1");
  await expect(page.getByRole("img", { name: "Terpsicle" })).toBeVisible();
}

const sidebar = (page: Page) =>
  page.getByRole("complementary", { name: "Sidebar" });
const handle = (page: Page) =>
  page.getByRole("separator", { name: "Sidebar width" });
const widthOf = async (page: Page) =>
  Math.round((await sidebar(page).boundingBox())?.width ?? 0);

test.describe("desktop", () => {
  test.skip(({ isMobile }) => isMobile, "desktop layout");

  test("drag the edge to resize, clamped; it's remembered; double-click resets", async ({
    page,
  }) => {
    await open(page);
    const calendar = page.getByRole("region", { name: "Week calendar" });
    const calendarBefore = (await calendar.boundingBox())?.width ?? 0;
    expect(await widthOf(page)).toBe(360);

    const box = await handle(page).boundingBox();
    if (!box) throw new Error("no resize handle");
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 60, y, { steps: 6 });
    await page.mouse.up();
    await expect.poll(() => widthOf(page)).toBe(420);
    expect((await calendar.boundingBox())?.width ?? 0).toBeCloseTo(
      calendarBefore - 60,
      -1,
    );

    // Past the limit stops at 480.
    await page.mouse.move(x + 60, y);
    await page.mouse.down();
    await page.mouse.move(x + 400, y, { steps: 6 });
    await page.mouse.up();
    await expect.poll(() => widthOf(page)).toBe(480);

    await page.reload();
    await expect(sidebar(page)).toBeVisible();
    expect(await widthOf(page)).toBe(480);

    await handle(page).dblclick();
    await expect.poll(() => widthOf(page)).toBe(360);
  });

  test("resize from the keyboard, and collapsing still works", async ({
    page,
  }) => {
    await open(page);
    await handle(page).focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => widthOf(page)).toBe(392);
    await expect(handle(page)).toHaveAttribute("aria-valuenow", "392");
    await page.keyboard.press("Home");
    await expect.poll(() => widthOf(page)).toBe(320);

    // Clicking the open tab still hides the sidebar, handle and all.
    const rail = page.getByRole("navigation", { name: "Sidebar tabs" });
    await rail.getByRole("button", { name: "Courses" }).click();
    await expect(sidebar(page)).toBeHidden();
    await expect(handle(page)).toBeHidden();
  });
});

test("phones have the drawer, not a resize handle", async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, "phone layout");
  await open(page);
  await expect(handle(page)).toHaveCount(0);
});

test("on a phone, course details lower a full drawer to half, so the ghosts show", async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, "phone layout");
  await open(page);
  const drawer = page.locator("[data-snap]");
  // Peek → half → full.
  while ((await drawer.getAttribute("data-snap")) !== "full")
    await page.getByRole("button", { name: "Raise the panel" }).click();
  await page.getByTestId("course-row-CMSC351").click();
  await expect(
    page.getByRole("navigation", { name: "Breadcrumb" }),
  ).toContainText("CMSC351");
  await expect(drawer).toHaveAttribute("data-snap", "half");
});
