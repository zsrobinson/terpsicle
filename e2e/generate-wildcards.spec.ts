import { expect, type Page, test } from "@playwright/test";

// Wildcards in Generate on `pnpm dev:mock?demo=1`, on desktop and in the
// phone drawer: type CMSC4XX and DSHS, generate, and see which course each
// plan took for each.

let errors: string[] = [];
test.beforeEach(async ({ page }) => {
  // A gen-ed reads every department of the term, and the first load
  // compiles the app: both take a while with several workers on one server.
  test.slow();
  errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/schedule?demo=1");
  await expect(
    page
      .getByRole("region", { name: "Week calendar" })
      .getByRole("button", { name: /^CMSC351 0301/ })
      .first(),
  ).toBeVisible({ timeout: 20_000 });
});
test.afterEach(() => {
  expect(errors).toEqual([]);
});

async function openGenerate(page: Page, isMobile: boolean) {
  if (isMobile) {
    await page
      .getByRole("navigation", { name: "Tabs", exact: true })
      .getByRole("button", { name: "Generate" })
      .tap();
    const drawer = page.locator("[data-vaul-drawer]");
    if ((await drawer.getAttribute("data-snap")) === "peek") {
      await page.getByRole("button", { name: "Raise the panel" }).tap();
      await expect(drawer).toHaveAttribute("data-snap", "half");
    }
  } else {
    await page
      .getByRole("navigation", { name: "Sidebar tabs" })
      .getByRole("button", { name: "Generate" })
      .click();
  }
  await expect(
    page.getByRole("heading", { name: "Generate" }).first(),
  ).toBeVisible();
}

/** Types into the course field and takes the first suggestion. */
async function add(page: Page, query: string, first: string | RegExp) {
  const field = page.getByRole("combobox", { name: "Add a course" });
  await field.fill(query);
  await expect(
    page
      .getByRole("listbox", { name: "Suggested courses" })
      .getByRole("option")
      .first(),
  ).toContainText(first);
  await field.press("Enter");
}

test("generate with CMSC4XX and any DSHS course", async ({
  page,
  isMobile,
}) => {
  await openGenerate(page, isMobile);
  await add(page, "CMSC351", "CMSC351");
  await add(page, "cmsc4xx", "Any CMSC 400-level");
  await expect(page.getByTestId("gen-wildcard-CMSC4XX")).toBeVisible();
  await add(page, "DSHS", /Any DSHS course.*History and Social Sciences/);
  await expect(page.getByTestId("gen-wildcard-gen-ed:DSHS")).toBeVisible();

  await page.getByRole("button", { name: "Generate plans" }).click();
  await expect(
    page.getByText(
      "1 course + Any CMSC 400-level + Any DSHS course · compact days",
    ),
  ).toBeVisible();
  const results = page.getByRole("list", { name: "Generated plans" });
  const first = results.getByTestId("generated-plan").first();
  // Each plan names the course it took for each wildcard.
  await expect(first).toContainText(
    /with CMSC4\d\d[A-Z]? \+ [A-Z]{4}\d{3}[A-Z]?/,
  );

  await first.getByRole("button").click();
  await expect(
    page.getByRole("navigation", { name: "Breadcrumb" }),
  ).toContainText("Option 1");
  const picked = page.getByRole("list", { name: "Picked for your wildcards" });
  await expect(picked).toContainText("for Any CMSC 400-level");
  await expect(picked).toContainText("for Any DSHS course");
});

test("a pattern with nothing to pick from says so", async ({
  page,
  isMobile,
}) => {
  await openGenerate(page, isMobile);
  const field = page.getByRole("combobox", { name: "Add a course" });
  await field.fill("ARTTXXX");
  const option = page
    .getByRole("listbox", { name: "Suggested courses" })
    .getByRole("option")
    .first();
  await expect(option).toContainText("Spring 2027 has no ARTT courses.");
  await expect(option).toHaveAttribute("aria-disabled", "true");
  await field.press("Enter");
  await expect(page.getByTestId("gen-wildcard-ARTTXXX")).toHaveCount(0);
});
