import { expect, type Page, test } from "@playwright/test";
import { lowerPlanDrawer } from "./plan-drawer";
import { liveToasts } from "./toasts";

// Reviews as production has it once our pages are off (docs/decisions.md,
// "Reviews link out to PlanetTerp"): the purple tab keeps its place among
// the five and opens PlanetTerp in a new tab, with an arrow and a tooltip
// saying so; the phone's tab bar, the product menu and the marketing page
// do the same. Schedule's reviews preview is PlanetTerp's, credited, with
// its ways out; Plan's course menu and Home's "Review your instructors"
// rows open PlanetTerp, and a row has its own Dismiss. Mock mode keeps our
// pages on so their code keeps running, so this spec answers /api/me with
// them off.

let errors: string[] = [];
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/me", async (route) => {
    // A busy dev server can drop one: ask again once.
    const response = await route.fetch().catch(() => route.fetch());
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

test("Schedule's preview is PlanetTerp's, credited, and leads there", async ({
  page,
  isMobile,
}) => {
  await page.goto("/schedule/course/CMSC351?demo=1");
  const button = page
    .getByRole("button", { name: "Reviews", exact: true })
    .first();
  // On a phone, course details sit in the workbench drawer, a sheet's opener.
  if (isMobile) await button.tap();
  else await button.click();
  const preview = page.locator("[data-instructor]").first();
  await expect(preview).toBeVisible();
  await expect(preview.getByTestId("pt-credit")).toHaveText(
    /^From PlanetTerp: ratings, reviews and grades\./,
  );
  const all = preview.getByRole("link", {
    name: /^Read all [\d,]+ on PlanetTerp$/,
  });
  await expect(all).toHaveAttribute(
    "href",
    /^https:\/\/planetterp\.com\/professor\/[a-z_]+$/,
  );
  await expect(all).toHaveAttribute("target", "_blank");
  await expect(all.locator("[data-outside-arrow]")).toBeVisible();
  await expect(
    preview.getByRole("link", { name: "Review on PlanetTerp" }),
  ).toHaveAttribute("target", "_blank");
  // Nothing in it leads to our own pages.
  await expect(preview.getByRole("link", { name: "View reviews" })).toHaveCount(
    0,
  );
});

test("Plan's course menu opens the course on PlanetTerp", async ({
  page,
  isMobile,
}) => {
  await page.clock.setFixedTime(new Date("2026-09-26T16:00:00Z"));
  await page.goto("/plan");
  await page.getByLabel("I started at UMD in").click();
  await page.getByRole("option", { name: "Fall 2025" }).click();
  await page.getByRole("button", { name: "or add courses yourself" }).click();
  if (isMobile)
    await page
      .getByRole("navigation", { name: "Semesters" })
      .getByRole("button", { name: "Fall 2026" })
      .click();
  const fall = page.getByRole("region", { name: "Fall 2026", exact: true });
  await fall.getByRole("button", { name: "Add a course to Fall 2026" }).click();
  await page.getByRole("searchbox", { name: "Search courses" }).fill("CMSC351");
  await page
    .getByRole("button", { name: "Add CMSC351 to Fall 2026", exact: true })
    .click();
  if (isMobile) await lowerPlanDrawer(page);
  await fall.getByRole("button", { name: "CMSC351 options" }).click();
  const item = page.getByRole("menuitem", { name: /Reviews on PlanetTerp/ });
  await expect(item).toHaveAttribute(
    "href",
    "https://planetterp.com/course/CMSC351",
  );
  await expect(item).toHaveAttribute("target", "_blank");
  await expect(
    page.getByRole("menuitem", { name: "View reviews" }),
  ).toHaveCount(0);
});

test("Home's instructors to review open PlanetTerp, and each can be dismissed", async ({
  page,
}) => {
  // Late in Spring 2027, the demo's term: its instructors are reviewable.
  await page.clock.setFixedTime(new Date("2027-05-10T13:00:00Z"));
  await page.goto("/schedule/courses?demo=1");
  // The demo's plans load from the mock catalog, slowly on a busy machine.
  await expect(
    page.getByRole("banner").getByRole("button", { name: "Share" }),
  ).toBeVisible({ timeout: 15_000 });
  // Saved to IndexedDB, which Home reads.
  await page.waitForTimeout(1000);
  await page.goto("/home");
  const section = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Review your instructors" }),
  });
  await expect(section).toBeVisible();
  await expect(
    section.getByRole("link", { name: /^PlanetTerp/ }),
  ).toHaveAttribute("href", "https://planetterp.com");
  const rows = section.getByRole("listitem");
  const first = rows.first().getByRole("link");
  await expect(first).toHaveAttribute(
    "href",
    /^https:\/\/planetterp\.com\/(professor|course)\//,
  );
  await expect(first).toHaveAttribute("target", "_blank");
  const dismiss = rows.first().getByRole("button", { name: /^Dismiss / });
  const label = await dismiss.getAttribute("aria-label");
  await dismiss.click();
  await expect(section.getByRole("button", { name: label ?? "" })).toHaveCount(
    0,
  );
  // Undo puts them back.
  await liveToasts(page).getByRole("button", { name: "Undo" }).click();
  await expect(
    section.getByRole("button", { name: label ?? "" }),
  ).toBeVisible();
});
