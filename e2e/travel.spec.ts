import { expect, type Page, test } from "@playwright/test";
import { OPEN_VIEW } from "./sidebar";

// The Travel tab and connection details on `pnpm dev:mock?demo=1`. Mock mode
// has no map tiles, so the route is drawn without them (an SVG of UMD's real
// path); the MapLibre map is checked against live data by hand (PR notes).

test.skip(({ isMobile }) => isMobile, "desktop interactions");

let errors: string[] = [];
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/schedule?demo=1");
  await expect(
    calendar(page)
      .getByRole("button", { name: /^CMSC351 0301/ })
      .first(),
  ).toBeVisible();
});
test.afterEach(() => {
  expect(errors).toEqual([]);
});

const calendar = (page: Page) =>
  page.getByRole("region", { name: "Week calendar" });
const sidebar = (page: Page) =>
  page.getByRole("complementary", { name: "Sidebar" });
/** Monday's STAT400 (ESJ) → CMSC351 (CSI) pill: 1,999 ft in a 10-minute gap. */
const mondayPill = (page: Page) =>
  calendar(page).locator('[data-day="M"] [data-verdict]').first();

test("pace changes the pills; a pill opens its details", async ({ page }) => {
  await page.getByRole("button", { name: "Travel", exact: true }).click();
  // Connections first; the settings are one line that opens in place.
  await expect(
    sidebar(page).getByRole("button", {
      name: /^STAT400 to CMSC351, Mon, Wed and Fri: Tight/,
    }),
  ).toBeVisible();
  await sidebar(page)
    .getByRole("button", {
      name: /Typical pace · no extra time · standard routes/,
    })
    .click();
  await expect(mondayPill(page)).toHaveText("8 min");
  await expect(mondayPill(page)).toHaveAttribute("data-verdict", "tight");

  await sidebar(page).getByRole("button", { name: "Slower, 2.5 mph" }).click();
  await expect(mondayPill(page)).toHaveText("10 min");
  await sidebar(page).getByRole("button", { name: "+2 min" }).click();
  await expect(mondayPill(page)).toHaveText("12 min");
  await expect(mondayPill(page)).toHaveAttribute(
    "data-verdict",
    "insufficient",
  );

  await mondayPill(page).click();
  await expect(page.locator(OPEN_VIEW)).toContainText("Connection");
  await expect(page.getByTestId("verdict")).toContainText(
    "Not enough time12 min to get there, 10 min between classes. You'd be about 2 min late.",
  );
  // The fixtures have no route geometry for ESJ → CSI: no map, one quiet line.
  await expect(page.getByText("Map unavailable for this route")).toBeVisible();
  await expect(
    sidebar(page).getByRole("region", { name: "Sections that fix this" }),
  ).toContainText("STAT400 0201");
});

test("details draw UMD's route; Accessible routes changes the estimate", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Travel", exact: true }).click();
  await sidebar(page)
    .getByRole("button", { name: /^CMSC330 to ECON200/ })
    .first()
    .click();
  const route = page.getByTestId("route-drawing");
  await expect(route).toBeVisible();
  await expect(route).toHaveAccessibleName("Walking route from IRB to VMH");
  await expect(
    page.getByText("4,262 ft at 3.0 mph = 16.1 min, rounded up to 17 min"),
  ).toBeVisible();

  await sidebar(page)
    .getByRole("button", { name: "Change your pace or use accessible routes" })
    .click();
  const toggle = sidebar(page).getByRole("switch", {
    name: /Accessible routes/,
  });
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  // The accessible ESJ → CSI path is longer: 9 min instead of 8.
  await expect(mondayPill(page)).toHaveText("9 min");
  await expect(page.getByText(/step-free/i)).toHaveCount(0);
});
