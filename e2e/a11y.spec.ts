import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

// WCAG 2.2 AA with axe on `pnpm dev:mock?demo=1`: every tab and drill-in, in
// both themes, on desktop and (the `mobile` project) a phone with the
// sidebar in its drawer. Nothing is disabled; the one exclusion is below.

const TAGS = [
  "wcag2a",
  "wcag2aa",
  "wcag21a",
  "wcag21aa",
  "wcag22aa",
  "best-practice",
];

// The route map is a MapLibre <canvas>: axe can't read pixels, and its
// tile labels come from the map style, not our tokens. The map has a text
// alternative (the connection's words above it), so leave the canvas out.
const EXCLUDE = [".maplibregl-canvas"];

// The `region` rule (all content inside a landmark) only: menus, popovers
// and tooltips are floating layers portaled to the end of <body> so they
// stack above everything. They're reached from their trigger (focus moves
// in, or aria-describedby), never by landmark, so the rule doesn't apply to
// them. Every other rule still checks them.
const FLOATING = "[data-radix-popper-content-wrapper]";

async function scan(page: Page, what: string) {
  // Let entry animations (drill-in slide, popovers) finish: axe reads
  // colors mid-fade as low contrast.
  await page.waitForTimeout(250);
  let everything = new AxeBuilder({ page })
    .withTags(TAGS)
    .disableRules("region");
  let region = new AxeBuilder({ page }).withRules("region").exclude(FLOATING);
  for (const selector of EXCLUDE) {
    everything = everything.exclude(selector);
    region = region.exclude(selector);
  }
  const violations = [
    ...(await everything.analyze()).violations,
    ...(await region.analyze()).violations,
  ];
  const summary = violations.map((v) => ({
    rule: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.slice(0, 6).map((n) => ({
      target: n.target.join(" "),
      summary: n.failureSummary?.split("\n").slice(0, 3).join(" "),
    })),
  }));
  if (summary.length > 0)
    await test.info().attach(`axe: ${what}`, {
      body: JSON.stringify(summary, null, 2),
      contentType: "application/json",
    });
  expect.soft(summary, `axe violations: ${what}`).toEqual([]);
}

// Axe takes a second or two per scan, and each test scans several states.
test.describe.configure({ timeout: 120_000 });

let errors: string[] = [];

async function open(page: Page, path = "/?demo=1") {
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
      await open(page, "/");
      await expect(page.getByTestId("first-visit")).toBeVisible();
      await scan(page, `first visit (${scheme})`);
    });

    test("every tab", async ({ page, isMobile }) => {
      await open(page);
      for (const label of TABS) {
        await openTab(page, isMobile, label);
        await scan(page, `${label} tab (${scheme})`);
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
      for (const tab of ["Instructors", "Grades", "About"]) {
        await page.getByRole("tab", { name: tab }).click();
        await scan(page, `course details: ${tab} (${scheme})`);
      }
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
