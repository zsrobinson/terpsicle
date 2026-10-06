import { expect, type Page, test } from "@playwright/test";

// Reviews as production has it once our pages are off (docs/decisions.md,
// "Reviews link out to PlanetTerp"): the purple tab keeps its place among
// the five and opens PlanetTerp in a new tab, with an arrow and a tooltip
// saying so; the phone's tab bar, the product menu and the marketing page
// do the same. Mock mode keeps our pages on so their code keeps running, so
// this spec answers /api/me with them off.

let errors: string[] = [];
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/me", async (route) => {
    const response = await route.fetch();
    const json = await response.json();
    json.flags.reviewsPages = false;
    await route.fulfill({ response, json });
  });
  // e2e never touches the network: PlanetTerp is a stand-in page.
  await page
    .context()
    .route("https://planetterp.com/**", (route) =>
      route.fulfill({ contentType: "text/html", body: "<h1>PlanetTerp</h1>" }),
    );
});
test.afterEach(() => {
  expect(errors).toEqual([]);
});

const PLANETTERP = "https://planetterp.com";
const TOOLTIP = "Reviews on PlanetTerp. Opens in a new tab.";

/** A link to PlanetTerp that opens a new tab with no handle back. */
async function linksOut(link: ReturnType<Page["getByRole"]>) {
  await expect(link).toHaveAttribute("href", PLANETTERP);
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  await expect(link.locator("[data-outside-arrow]")).toBeVisible();
}

test("the family bar's purple tab opens PlanetTerp in a new tab", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "the phone's tab bar has its own test");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/schedule");
  const tabs = page.getByRole("navigation", { name: "Products" });
  const reviews = tabs.getByRole("link", { name: "Reviews on PlanetTerp" });
  await linksOut(reviews);
  // The rest are still our own pages.
  await expect(tabs.getByRole("link", { name: "Chat" })).toHaveAttribute(
    "href",
    "/chat",
  );

  await reviews.hover();
  await expect(page.getByRole("tooltip")).toHaveText(TOOLTIP);
  const opened = page.waitForEvent("popup");
  await reviews.click();
  const popup = await opened;
  await expect(popup).toHaveURL(`${PLANETTERP}/`);
  // This page stays where it was.
  await expect(page).toHaveURL(/\/schedule/);

  // Narrower, in the product menu, it says where it goes.
  await page.setViewportSize({ width: 900, height: 800 });
  await page
    .getByRole("button", { name: /Schedule/ })
    .first()
    .click();
  const item = page.getByRole("menuitem", { name: /^Reviews/ });
  await expect(item).toContainText("On PlanetTerp");
  await linksOut(item);
});

test("the phone's Reviews tab opens PlanetTerp in a new tab", async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, "the tab bar is a phone's");
  await page.goto("/schedule");
  const bar = page.getByRole("navigation", { name: "Tab bar" });
  const reviews = bar.getByRole("link", { name: "Reviews on PlanetTerp" });
  await linksOut(reviews);
  // Still six tabs, Reviews in its place.
  await expect(bar.getByRole("link")).toHaveCount(6);
  await expect(bar.getByRole("link").nth(2)).toHaveAttribute(
    "href",
    PLANETTERP,
  );
});

test("the marketing page's Reviews step says it's PlanetTerp's", async ({
  page,
}) => {
  await page.goto("/?stay");
  const step = page.locator("section#reviews");
  await linksOut(step.getByRole("link", { name: "Reviews on PlanetTerp" }));
  await expect(step).toContainText("PlanetTerp rating");
  await expect(step).not.toContainText("anonymous");
});
