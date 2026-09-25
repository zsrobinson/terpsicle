import { expect, test } from "@playwright/test";

const TAB_LABELS = [
  "Courses",
  "Search",
  "Problems",
  "Travel",
  "Blocks",
  "Generate",
  "Export",
];

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByText("terpsicle", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("loads the shell with the week calendar", async ({ page }) => {
  const calendar = page.getByRole("region", { name: "Week calendar" });
  await expect(calendar).toBeVisible();
  for (const day of ["Mon", "Tue", "Wed", "Thu", "Fri"]) {
    await expect(calendar.getByText(day, { exact: true })).toBeVisible();
  }
});

test("shows every tab with a text label", async ({ page, isMobile }) => {
  const tabs = page.getByRole("navigation", {
    name: isMobile ? "Tabs" : "Sidebar tabs",
    exact: true,
  });
  await expect(tabs.getByRole("button")).toHaveText(TAB_LABELS);
});

test("fits the viewport without scrolling sideways", async ({ page }) => {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test("the calendar fills the height, with nothing below it", async ({
  page,
}) => {
  const calendar = page.getByRole("region", { name: "Week calendar" });
  const box = await calendar.boundingBox();
  const viewport = page.viewportSize();
  if (!box || !viewport) throw new Error("calendar or viewport not measured");
  const tabStrip = page.getByRole("navigation", { name: "Tabs", exact: true });
  const below = (await tabStrip.isVisible())
    ? ((await tabStrip.boundingBox())?.height ?? 0)
    : 0;
  expect(box.y + box.height).toBeCloseTo(viewport.height - below, 0);
});
