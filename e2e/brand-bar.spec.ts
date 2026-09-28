import { expect, type Page, test } from "@playwright/test";

// The family bar's brand pieces (the owner, 2026-09-28): the "Early access"
// chip and its note, the coffee button beside Feedback (a link in the
// account menu on phones), the ink monogram, and `/`'s header, which never
// says "Sign in" to someone who's signed in.

let errors: string[] = [];

test.beforeEach(async ({ page }) => {
  errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
});

test.afterEach(() => {
  expect(errors).toEqual([]);
});

const bar = (page: Page) => page.locator('[data-slot="app-bar"]');
const NOTE = "Terpsicle's still in active development, so things may change.";

/** The page's code is running: "Sign in" appears once /api/me answers. */
async function hydrated(page: Page) {
  await expect(
    bar(page).getByRole("button", { name: "Sign in" }),
  ).toBeVisible();
}

async function signIn(page: Page, path: string) {
  await page.goto(`/auth/test?return=${encodeURIComponent(path)}`);
  await page.getByRole("button", { name: "Sign in as Test Student" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/auth"));
}

test("the bar says Early access, and the product menu says why", async ({
  page,
  isMobile,
}) => {
  await page.goto("/reviews");
  await hydrated(page);
  const chip = bar(page).getByTestId("early-access").filter({ visible: true });
  if (isMobile) {
    // A phone's bar keeps the room; the product menu says it.
    await expect(chip).toHaveCount(0);
    await bar(page)
      .getByRole("button", { name: /^Terpsicle/ })
      .click();
    await expect(page.getByRole("menu").getByText(NOTE)).toBeVisible();
  } else {
    await expect(chip).toHaveCount(1);
    await expect(chip).toContainText("Early access");
    await chip.hover();
    await expect(page.getByRole("tooltip")).toContainText(NOTE);
  }
});

test("the coffee button opens its note and links out", async ({
  page,
  isMobile,
}) => {
  await page.goto("/reviews");
  await hydrated(page);
  await expect(page.getByTestId("feedback-button")).toBeVisible();
  let link = page.getByRole("link", { name: "Buy me a coffee" });
  if (isMobile) {
    // No room in a phone's bar: it's in the account menu.
    await expect(page.getByTestId("coffee-button")).toHaveCount(0);
    await bar(page).getByRole("button", { name: "Sign in" }).click();
    link = page.getByRole("menuitem", { name: "Buy me a coffee" });
  } else {
    const button = page.getByTestId("coffee-button");
    await expect(button).toHaveAccessibleName("Support Terpsicle");
    await button.click();
    await expect(
      page
        .getByRole("dialog")
        .getByText(
          "Does Terpsicle help you out? Support its development by buying its developer a coffee.",
        ),
    ).toBeVisible();
  }
  await expect(link).toHaveAttribute(
    "href",
    "https://buymeacoffee.com/zsrobinson",
  );
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", /noopener/);
});

test("signed in, / offers the account and the way back, never Sign in", async ({
  page,
}) => {
  await page.goto("/?stay");
  const header = page.getByRole("banner");
  await expect(header.getByRole("link", { name: "Sign in" })).toBeVisible();

  await signIn(page, "/?stay");
  await expect(
    header.getByRole("link", { name: "Open Terpsicle" }),
  ).toBeVisible();
  await expect(
    header.getByRole("button", { name: "Account: Test Student" }),
  ).toBeVisible();
  await expect(header.getByText("Sign in", { exact: true })).toHaveCount(0);
});

test("the monogram is ink: black in light, paper in dark", async ({ page }) => {
  await signIn(page, "/reviews");
  const monogram = bar(page)
    .getByRole("button", { name: /^Account: / })
    .locator("span", { hasText: /^TS$/ });
  await expect(monogram).toBeVisible();
  const colors = () =>
    monogram.evaluate((el) => {
      const style = getComputedStyle(el);
      return { bg: style.backgroundColor, fg: style.color };
    });
  expect(await colors()).toEqual({
    bg: "rgb(16, 15, 15)",
    fg: "rgb(255, 252, 240)",
  });
  await page.emulateMedia({ colorScheme: "dark" });
  await expect
    .poll(colors)
    .toEqual({ bg: "rgb(255, 252, 240)", fg: "rgb(16, 15, 15)" });
});
