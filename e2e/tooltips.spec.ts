import { expect, type Page, test } from "@playwright/test";

// Every control has a tooltip (CLAUDE.md), and the kit's `WithTooltip` is
// the one way to give it one: it marks its trigger with `data-tooltip`. This
// walks each product's pages, signed out and signed in, and lists the
// visible controls that have none.
//
// Items inside an open menu or listbox (`menuitem`, `option`) are the
// exception: their text is their whole label, the menu's trigger has the
// tooltip, and one per option would cover the next (docs/decisions.md,
// "Tooltips on controls, not on menu options").

test.describe.configure({ timeout: 180_000 });

// Each full load asks /api/me, which has a per-IP hourly limit the whole
// suite shares: the scheduler's tabs are visited in place, not loaded.
const TABS = [
  "Courses",
  "Search",
  "Problems",
  "Travel",
  "Blocks",
  "Generate",
  "Register",
];

const SIGNED_OUT = [
  "/?stay",
  "/schedule/course/CMSC351?demo=1",
  "/reviews",
  "/reviews/cmsc351",
  "/chat",
  "/plan",
  "/todo",
  "/privacy",
  "/signin",
];

const SIGNED_IN = [
  "/chat",
  "/chat?term=202701&course=CMSC351",
  "/todo",
  "/todo/connect",
  "/settings",
  "/settings/notifications",
  "/reviews/mine",
];

const CONTROLS = [
  "button",
  "a[href]",
  "input:not([type=hidden])",
  "select",
  "textarea",
  "summary",
  ...[
    "button",
    "link",
    "tab",
    "checkbox",
    "radio",
    "switch",
    "combobox",
    "slider",
  ].map((role) => `[role=${role}]`),
].join(", ");

/** Visible controls on the page with no tooltip, as "tag "name"". */
async function untipped(page: Page): Promise<string[]> {
  return page.evaluate((selector) => {
    const out: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>(selector)) {
      const box = el.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;
      if (getComputedStyle(el).visibility === "hidden") continue;
      if (el.closest("[aria-hidden=true], [inert]")) continue;
      // The exception above: an open menu's items and a listbox's options.
      if (el.closest("[role=menu], [role=listbox]")) continue;
      // Its own tooltip, or its label's (a checkbox inside one, or a hidden
      // file input whose label is the box you press).
      if (el.closest("[data-tooltip]")) continue;
      const labels = (el as HTMLInputElement).labels;
      if (labels && [...labels].some((l) => l.closest("[data-tooltip]")))
        continue;
      const name = (
        el.getAttribute("aria-label") ??
        el.textContent ??
        el.getAttribute("placeholder") ??
        ""
      )
        .trim()
        .replace(/\s+/g, " ")
        .slice(0, 60);
      out.push(`${el.tagName.toLowerCase()} "${name}"`);
    }
    return out;
  }, CONTROLS);
}

async function settle(page: Page) {
  await page.waitForLoadState("load");
  // Skeletons give way to what they stand for.
  await expect(
    page.locator("[data-slot=row-skeleton], [data-slot=page-skeleton]"),
  ).toHaveCount(0, { timeout: 20_000 });
  await page.waitForTimeout(500);
}

async function audit(page: Page, paths: readonly string[]) {
  const missing: string[] = [];
  for (const path of paths) {
    await page.goto(path);
    await settle(page);
    for (const control of await untipped(page))
      missing.push(`${path}: ${control}`);
  }
  expect(missing, "controls without a tooltip").toEqual([]);
}

test("every control in the scheduler has a tooltip, on every tab", async ({
  page,
}) => {
  const missing: string[] = [];
  await page.goto("/schedule?demo=1");
  await settle(page);
  for (const tab of TABS) {
    // The rail's tab on desktop, the drawer's on phones: one of them shows.
    await page
      .getByRole("button", { name: new RegExp(`^${tab}`) })
      .filter({ visible: true })
      .first()
      .click();
    await settle(page);
    for (const control of await untipped(page))
      missing.push(`${tab}: ${control}`);
  }
  expect(missing, "controls without a tooltip").toEqual([]);
});

test("every control has a tooltip, signed out", async ({ page }) => {
  await audit(page, SIGNED_OUT);
});

test("every control has a tooltip, signed in", async ({ page, isMobile }) => {
  // Each project is its own person, as in the other signed-in specs.
  const userId = isMobile ? "tadmin" : "tstudent";
  await page.goto("/privacy");
  const status = await page.evaluate(async (id) => {
    const response = await fetch("/api/auth/test-sign-in", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: id, return: "/settings" }),
    });
    return response.status;
  }, userId);
  expect(status).toBe(200);
  await audit(page, SIGNED_IN);
});

test("every control in Notifications has a tooltip", async ({
  page,
  isMobile,
}) => {
  const userId = isMobile ? "tadmin" : "tstudent";
  await page.goto("/privacy");
  const status = await page.evaluate(async (id) => {
    const response = await fetch("/api/auth/test-sign-in", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: id, return: "/reviews" }),
    });
    return response.status;
  }, userId);
  expect(status).toBe(200);
  await page.goto("/reviews");
  await settle(page);
  await page.getByTestId("notifications-bell").click();
  await expect(
    page.getByRole("dialog", { name: "Notifications" }),
  ).toBeVisible();
  await settle(page);
  expect(await untipped(page), "controls without a tooltip").toEqual([]);
});
