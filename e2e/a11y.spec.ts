import { expect, type Page, test } from "@playwright/test";
import { scan } from "./axe";

// WCAG 2.2 AA with axe on `pnpm dev:mock?demo=1`: every tab and drill-in, in
// both themes, on desktop and (the `mobile` project) a phone with the
// sidebar in its drawer. Nothing is disabled; the one exclusion (the route
// map's canvas) is in ./axe.ts.

// Axe takes a second or two per scan, and each test scans several states.
test.describe.configure({ timeout: 120_000 });

let errors: string[] = [];

async function open(page: Page, path = "/schedule?demo=1") {
  errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(path);
  // The first load compiles the app on the dev server.
  await expect(page.getByRole("img", { name: "Terpsicle" })).toBeVisible({
    timeout: 20_000,
  });
  if (path.includes("demo"))
    await expect(
      calendar(page)
        .getByRole("button", { name: /^CMSC351 0301/ })
        .first(),
    ).toBeVisible({ timeout: 20_000 });
}

test.afterEach(() => {
  expect(errors).toEqual([]);
});

const calendar = (page: Page) =>
  page.getByRole("region", { name: "Week calendar" });

const TABS = [
  "Courses",
  "Search",
  "Problems",
  "Travel",
  "Blocks",
  "Generate",
  "Export",
] as const;

async function openTab(page: Page, isMobile: boolean, label: string) {
  if (isMobile) {
    const tabs = page.getByRole("navigation", { name: "Tabs", exact: true });
    const button = tabs.getByRole("button", { name: label });
    if ((await button.getAttribute("aria-pressed")) !== "true")
      await button.tap();
  } else {
    const rail = page.getByRole("navigation", { name: "Sidebar tabs" });
    const button = rail.getByRole("button", { name: label });
    if ((await button.getAttribute("aria-pressed")) !== "true")
      await button.click();
  }
  const nav = isMobile
    ? page.getByRole("navigation", { name: "Tabs", exact: true })
    : page.getByRole("navigation", { name: "Sidebar tabs" });
  await expect(nav.getByRole("button", { name: label })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  // Every panel has a heading; Courses is headed by the plan's name.
  await expect(
    page
      .getByRole("heading", { name: label === "Courses" ? "Plan A" : label })
      .first(),
  ).toBeVisible();
  // On a phone, raise a resting drawer so the whole panel is on screen.
  const drawer = page.locator("[data-vaul-drawer]");
  if (isMobile && (await drawer.getAttribute("data-snap")) === "peek") {
    await page.getByRole("button", { name: "Raise the panel" }).tap();
    await expect(drawer).toHaveAttribute("data-snap", "half");
  }
}

for (const scheme of ["light", "dark"] as const) {
  test.describe(`${scheme} theme`, () => {
    test.use({ colorScheme: scheme });

    test("first visit", async ({ page }) => {
      await open(page, "/schedule");
      await expect(page.getByTestId("first-visit")).toBeVisible();
      await scan(page, `first visit (${scheme})`);
    });

    test("pages outside the scheduler", async ({ page }) => {
      for (const path of ["/", "/privacy", "/reviews", "/schedule/nowhere"]) {
        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await scan(page, `${path} (${scheme})`);
      }
    });

    test("every tab", async ({ page, isMobile }) => {
      await open(page);
      for (const label of TABS) {
        await openTab(page, isMobile, label);
        await scan(page, `${label} tab (${scheme})`);
        if (label === "Blocks") {
          // The form waits behind "Add a block" while there are blocks.
          await page.getByRole("button", { name: "Add a block" }).click();
          await expect(
            page.getByRole("region", { name: "Add a block" }),
          ).toBeVisible();
          await scan(page, `Blocks form (${scheme})`);
        }
      }
    });

    test("search results and course details", async ({ page, isMobile }) => {
      await open(page);
      await openTab(page, isMobile, "Search");
      const box = page.getByRole("combobox", { name: "Search courses" });
      await box.fill("cmsc");
      await expect(page.locator("[data-course-result]").first()).toBeVisible();
      await scan(page, `search results (${scheme})`);

      await box.fill("cmsc 351");
      await page.locator('[data-course-result="CMSC351"]').click();
      await expect(
        page.getByRole("heading", { name: "Algorithms" }),
      ).toBeVisible();
      await scan(page, `course details: sections and ghosts (${scheme})`);
      await page
        .locator('[data-section="0101"]')
        .getByRole("button", { name: /^Watch for a seat/ })
        .click();
      await expect(
        page.getByRole("textbox", { name: "Your email" }),
      ).toBeVisible();
      await scan(page, `seat alert popover (${scheme})`);
      await page.keyboard.press("Escape");
      // One page: the description, reviews and grades open in place.
      await page
        .getByRole("button", { name: "More about this course" })
        .click();
      await page.getByRole("button", { name: "Reviews" }).first().click();
      await page.getByRole("button", { name: "Grades ↓" }).click();
      await expect(page.getByTestId("grade-bars")).toBeVisible();
      // Back to the top: mid-scroll, rows slide under the sticky Sections
      // bar, and axe counts a row's button half under it as a small target.
      await page
        .locator("[data-layer][data-active] [data-panel-body]")
        .evaluate((el) => el.scrollTo(0, 0));
      await scan(page, `course details: opened up (${scheme})`);

      // A course with one section, and one with many.
      for (const [query, code] of [
        ["cmsc 401", "CMSC401"],
        ["engl 101", "ENGL101"],
      ] as const) {
        // `/` goes back to Search from the drill-in.
        await page.keyboard.press("/");
        await box.fill(query);
        await page.locator(`[data-course-result="${code}"]`).click();
        await expect(page.getByTestId("sections")).toBeVisible();
        await scan(page, `course details: ${code} (${scheme})`);
      }
    });

    test("the calendar from the keyboard: a focused ghost and its preview", async ({
      page,
      isMobile,
    }) => {
      test.skip(isMobile, "keyboard on desktop");
      await open(page);
      await calendar(page)
        .getByRole("button", { name: /^CMSC351 0301, Monday/ })
        .first()
        .click();
      await calendar(page).locator("[data-nav-key][tabindex='0']").focus();
      await page.keyboard.press("ArrowDown");
      await expect(page.locator(":focus")).toHaveAttribute("data-ghost", /.+/);
      await scan(page, `focused ghost (${scheme})`);
      // A merged ghost's popover, opened from the keyboard.
      await page.keyboard.press("Escape");
      await page.keyboard.press("/");
      await page
        .getByRole("combobox", { name: "Search courses" })
        .fill("engl 101");
      await page.locator('[data-course-result="ENGL101"]').click();
      await calendar(page)
        .getByRole("button", { name: /sections of ENGL101 to choose from/ })
        .first()
        .focus();
      await page.keyboard.press("Enter");
      await expect(
        page.getByRole("dialog", { name: "Sections of ENGL101" }),
      ).toBeVisible();
      await scan(page, `merged ghost popover (${scheme})`);
    });

    test("menus and popovers", async ({ page, isMobile }) => {
      await open(page);
      await page
        .getByRole("button", { name: /options$/ })
        .first()
        .click();
      await expect(page.getByRole("menu")).toBeVisible();
      await scan(page, `plan menu (${scheme})`);
      await page.keyboard.press("Escape");

      await page.getByRole("button", { name: "New plan" }).click();
      await expect(page.getByRole("menu")).toBeVisible();
      await scan(page, `new plan menu (${scheme})`);
      await page.keyboard.press("Escape");

      await openTab(page, isMobile, "Courses");
      await page.getByRole("button", { name: /color/i }).first().click();
      await scan(page, `color picker (${scheme})`);
      await page.keyboard.press("Escape");
    });

    test("travel settings and connection details", async ({
      page,
      isMobile,
    }) => {
      await open(page);
      await openTab(page, isMobile, "Travel");
      const sidebar = isMobile
        ? page.locator("[data-vaul-drawer]")
        : page.getByRole("complementary", { name: "Sidebar" });
      await sidebar
        .getByRole("button", { name: /^CMSC330 to ECON200/ })
        .first()
        .click();
      await expect(page.getByTestId("route-drawing")).toBeVisible();
      await scan(page, `connection details (${scheme})`);

      await sidebar
        .getByRole("button", {
          name: "Change your pace or use accessible routes",
        })
        .click();
      await expect(
        sidebar.getByRole("switch", { name: /Accessible routes/ }),
      ).toBeVisible();
      await scan(page, `travel settings (${scheme})`);
    });

    test("generate results and details", async ({ page, isMobile }) => {
      test.slow();
      await open(page);
      await openTab(page, isMobile, "Generate");
      const field = page.getByRole("combobox", { name: "Add a course" });
      for (const code of ["CMSC351", "CMSC330"]) {
        await field.fill(code);
        await expect(
          page
            .getByRole("listbox", { name: "Suggested courses" })
            .getByRole("option")
            .first(),
        ).toContainText(code);
        await field.press("Enter");
        await expect(page.getByTestId(`gen-course-${code}`)).toBeVisible();
      }
      // A wildcard too: its suggestion, chip, and what each plan took.
      await field.fill("CMSC4XX");
      await expect(
        page
          .getByRole("listbox", { name: "Suggested courses" })
          .getByRole("option")
          .first(),
      ).toContainText("Any CMSC 400-level");
      await scan(page, `generate wildcard suggestion (${scheme})`);
      await field.press("Enter");
      await expect(page.getByTestId("gen-wildcard-CMSC4XX")).toBeVisible();
      await page.getByRole("button", { name: "Generate plans" }).click();
      const results = page.getByRole("list", { name: "Generated plans" });
      await expect(results.getByRole("listitem").first()).toBeVisible();
      await scan(page, `generate results (${scheme})`);
      await results.getByRole("button").first().click();
      await expect(
        page.getByRole("navigation", { name: "Breadcrumb" }),
      ).toContainText("Option 1");
      await scan(page, `generated plan details (${scheme})`);
    });
  });
}

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("menus and the drawer don't animate", async ({ page, isMobile }) => {
    await open(page);
    await page.getByRole("button", { name: "New plan" }).click();
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    expect(
      await menu.evaluate((el) => getComputedStyle(el).animationName),
    ).toBe("none");
    await page.keyboard.press("Escape");
    if (isMobile) {
      const drawer = page.locator("[data-vaul-drawer]");
      await page.getByRole("button", { name: "Raise the panel" }).tap();
      expect(
        await drawer.evaluate((el) => getComputedStyle(el).transitionDuration),
      ).toMatch(/^0s(, 0s)*$/);
    }
  });
});
