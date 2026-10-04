import { expect, type Locator, type Page, test } from "@playwright/test";
import { scan } from "./axe";

// The kit's popups on /admin/kit (docs/COHESION.md §3): each opened from its
// control, scanned with axe in both themes, and closed with Esc back onto
// what opened it. The pieces have unit tests in src/components/ui; this is
// them in a browser, on the kit's own page.

test.describe.configure({ timeout: 120_000 });

let errors: string[] = [];

async function openKit(page: Page, view: "popups" | "controls") {
  await page.goto(
    `/auth/test?return=${encodeURIComponent(`/admin/kit?view=${view}`)}`,
  );
  await page.getByRole("button", { name: "Sign in as Test Admin" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Page kit" }),
  ).toBeVisible();
}

test.beforeEach(({ page }) => {
  errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
});

test.afterEach(() => {
  expect(errors).toEqual([]);
});

/** Opens a popup, scans it, and closes it with Esc. */
async function check(
  page: Page,
  what: string,
  popup: Locator,
  open: () => Promise<void>,
) {
  await open();
  await expect(popup).toBeVisible();
  await scan(page, what);
  await page.keyboard.press("Escape");
  await expect(popup).toBeHidden();
}

for (const scheme of ["light", "dark"] as const) {
  test(`every popup passes axe and gives focus back on Esc (${scheme})`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await openKit(page, "popups");

    // A tooltip, from the keyboard, with its shortcut. (First: a popup that
    // closes hands focus back and quiets tooltips for a moment.)
    await page.locator("[data-kit-tooltip]").focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    await expect(page.getByRole("tooltip")).toHaveText("Search courses/");
    await scan(page, `tooltip (${scheme})`);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("tooltip")).toHaveCount(0);

    const plan = page.getByRole("button", { name: "Plan A" });
    await check(page, `menu (${scheme})`, page.getByRole("menu"), () =>
      plan.click(),
    );
    await expect(plan).toBeFocused();
    await expect(plan).not.toHaveAttribute("data-popup-open");

    await check(page, `context menu (${scheme})`, page.getByRole("menu"), () =>
      page.getByText("Right-click for its menu").click({ button: "right" }),
    );

    const share = page.getByRole("button", { name: "Share" });
    await check(
      page,
      `popover (${scheme})`,
      page.getByRole("dialog", { name: "Share Plan A" }),
      () => share.click(),
    );
    await expect(share).toBeFocused();

    const install = page.getByRole("button", { name: "Install Terpsicle" });
    await check(
      page,
      `dialog (${scheme})`,
      page.getByRole("dialog", { name: "Put Terpsicle on your home screen" }),
      () => install.click(),
    );
    await expect(install).toBeFocused();
    // Focus came back without its tooltip popping up over the page.
    await expect(page.getByRole("tooltip")).toHaveCount(0);
  });
}

test("a select picks from the keyboard and shows the label", {
  tag: "@critical",
}, async ({ page }) => {
  await openKit(page, "controls");
  const term = page.getByRole("combobox", { name: "Term" });
  await expect(term).toHaveText("Spring 2027");
  await term.focus();
  await page.keyboard.press("ArrowDown");
  const list = page.getByRole("listbox");
  await expect(list).toBeVisible();
  await scan(page, "select");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Enter");
  await expect(list).toBeHidden();
  await expect(term).toHaveText("Fall 2026");
  await expect(term).toBeFocused();
});

test("a tooltip opens for a pointer, never for a finger", async ({
  page,
  isMobile,
}) => {
  await openKit(page, "popups");
  const search = page.getByRole("button", { name: "Search courses" });
  if (isMobile) {
    await search.tap();
    await page.waitForTimeout(800);
    await expect(page.getByRole("tooltip")).toHaveCount(0);
  } else {
    await search.hover();
    await expect(page.getByRole("tooltip")).toHaveText("Search courses/");
  }
});
