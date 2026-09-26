import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, type Page, test } from "@playwright/test";

// Accessibility past what axe can see (docs/ACCESSIBILITY.md): the calendar
// from the keyboard, focus never hidden under sticky headers, forced colors,
// reflow at 320px, the page title and undo toasts that wait for you.

let errors: string[] = [];

async function open(page: Page, path = "/schedule?demo=1") {
  errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(path);
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
const focused = (page: Page) => page.locator(":focus");
const activeLayer = (page: Page) =>
  page.locator("#sidebar-panel > [data-layer][data-active]");

async function openCourse(page: Page, query: string, code: string) {
  await page.keyboard.press("/");
  await page.getByRole("combobox", { name: "Search courses" }).fill(query);
  await page.locator(`[data-course-result="${code}"]`).click();
  await expect(page.getByTestId("sections")).toBeVisible();
}

/**
 * True when the focused element's middle can be seen: nothing sticky (a
 * header, a footer, the drawer) is drawn over it (WCAG 2.4.11).
 */
function focusIsVisible(page: Page) {
  return page.evaluate(() => {
    const el = document.activeElement;
    if (!(el instanceof HTMLElement) || el === document.body) return true;
    const box = el.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return true;
    const x = box.left + box.width / 2;
    const y = box.top + box.height / 2;
    const top = document.elementFromPoint(x, y);
    // A tooltip opened by the focus itself doesn't count.
    if (top?.closest("[data-slot=tooltip-content],[role=tooltip]")) return true;
    return top !== null && (el === top || el.contains(top));
  });
}

test.describe("desktop", () => {
  test.skip(({ isMobile }) => isMobile, "keyboard on desktop");

  test("the calendar is one Tab stop, with arrows between days and times", async ({
    page,
  }) => {
    await open(page);
    // Skip to the calendar; the next Tab lands on the week's first class.
    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Tab");
    await expect(focused(page)).toHaveAccessibleName(
      /^STAT400 0101, Monday 10am/,
    );
    // The keys are described once, as focus first arrives.
    await expect(focused(page)).toHaveAccessibleDescription(
      /Arrow keys move around the calendar/,
    );
    await expect(
      calendar(page).locator("[data-nav-key][tabindex='0']"),
    ).toHaveCount(1);

    // ↓ goes through Monday in time order, the travel pill included, and
    // it says its verdict in words.
    await page.keyboard.press("ArrowDown");
    await expect(focused(page)).toHaveAccessibleName(
      /^8 min walk, tight\. ESJ to CSI/,
    );
    await page.keyboard.press("ArrowDown");
    await expect(focused(page)).toHaveAccessibleName(
      /^CMSC351 0301, Monday 11am/,
    );
    // The end of the day stays put.
    await page.keyboard.press("ArrowDown");
    await expect(focused(page)).toHaveAccessibleName(
      /^CMSC351 0301, Monday 11am/,
    );
    // → goes to the nearest class in time on the next day.
    await page.keyboard.press("ArrowRight");
    await expect(focused(page)).toHaveAccessibleName(/, Tuesday 9:30am/);
    await page.keyboard.press("End");
    await expect(focused(page)).toHaveAccessibleName(
      /^ECON200 0101, Tuesday 2pm/,
    );
    await page.keyboard.press("Home");
    await expect(focused(page)).toHaveAccessibleName(/, Tuesday 9:30am/);

    // Shift+Tab leaves the calendar (for the sidebar's edge), and Tab
    // comes back to where you were.
    await page.keyboard.press("Shift+Tab");
    await expect(focused(page)).toHaveAccessibleName("Sidebar width");
    await page.keyboard.press("Tab");
    await expect(focused(page)).toHaveAccessibleName(/, Tuesday 9:30am/);
  });

  test("ghosts are reached with the arrows, preview on focus, and Enter switches", async ({
    page,
  }) => {
    await open(page);
    const block = calendar(page)
      .getByRole("button", { name: /^CMSC351 0301, Monday/ })
      .first();
    await block.focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("region", { name: "CMSC351", exact: true }),
    ).toBeFocused();

    // Back on the calendar, the tab stop is the open course's class.
    await calendar(page).locator("[data-nav-key][tabindex='0']").focus();
    await expect(focused(page)).toHaveAccessibleName(/^CMSC351 0301, Monday/);
    // Monday: STAT400 10am (its ghost 0101 at 10 too), CMSC351 11am, then
    // ghosts 0401 at noon and 0201 at 2pm.
    await page.keyboard.press("ArrowDown");
    await expect(focused(page)).toHaveAccessibleName(/^Switch to 0401/);
    // Focusing a ghost previews it, like pointing at it.
    await expect(
      activeLayer(page).locator('[data-section="0401"]'),
    ).toHaveAttribute("data-state", "previewed");
    await page.keyboard.press("ArrowDown");
    await expect(focused(page)).toHaveAccessibleName(/^Switch to 0201/);
    await expect(
      activeLayer(page).locator('[data-section="0401"]'),
    ).not.toHaveAttribute("data-state", "previewed");

    // Enter switches, and focus moves to the class the ghost became.
    await page.keyboard.press("Enter");
    await expect(page.getByText("Switched CMSC351 to 0201")).toBeVisible();
    await expect(focused(page)).toHaveAccessibleName(
      /^CMSC351 0201, Monday 2pm/,
    );
  });

  test("the sidebar's ↑/↓/↵ still step through sections while a course is open", async ({
    page,
  }) => {
    await open(page);
    await openCourse(page, "cmsc 351", "CMSC351");
    await page.getByRole("button", { name: "More about this course" }).focus();
    await page.keyboard.press("ArrowDown");
    await expect(
      activeLayer(page).locator("[data-section][data-state='previewed']"),
    ).toHaveCount(1);
  });

  test("focus is never hidden under the sticky headers in a long list", async ({
    page,
  }) => {
    test.slow();
    await open(page);
    await openCourse(page, "engl 101", "ENGL101");
    const body = activeLayer(page).locator("[data-panel-body]");
    await activeLayer(page).getByRole("button", { name: "Bookmark" }).focus();
    let checked = 0;
    for (let i = 0; i < 60; i++) {
      await page.keyboard.press("Tab");
      const inside = await body.evaluate((el) =>
        el.contains(document.activeElement),
      );
      if (!inside) break;
      expect(
        await focusIsVisible(page),
        `Tab ${i + 1}: ${await focused(page).getAttribute("aria-label")}`,
      ).toBe(true);
      checked++;
    }
    // And coming back up, past the sticky group headers.
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press("Shift+Tab");
      expect(await focusIsVisible(page), `Shift+Tab ${i + 1}`).toBe(true);
    }
    expect(checked).toBeGreaterThan(30);
    expect(await body.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  });

  test("generate results keep focus clear of the footer", async ({ page }) => {
    await open(page);
    await page
      .getByRole("navigation", { name: "Sidebar tabs" })
      .getByRole("button", { name: "Generate" })
      .click();
    const field = page.getByRole("combobox", { name: "Add a course" });
    for (const code of ["CMSC351", "CMSC330", "STAT400"]) {
      await field.fill(code);
      await expect(
        page
          .getByRole("listbox", { name: "Suggested courses" })
          .getByRole("option")
          .first(),
      ).toContainText(code);
      await field.press("Enter");
    }
    await page.getByRole("button", { name: "Generate plans" }).click();
    const results = page.getByRole("list", { name: "Generated plans" });
    await expect(results.getByRole("listitem").first()).toBeVisible();
    await results.getByRole("checkbox").first().focus();
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press("Tab");
      if (
        !(await results.evaluate((el) => el.contains(document.activeElement)))
      )
        break;
      expect(await focusIsVisible(page), `Tab ${i + 1}`).toBe(true);
    }
  });

  test("the page title says where you are", async ({ page }) => {
    await open(page);
    await expect(page).toHaveTitle("Plan A · Spring 2027 · Terpsicle");
    await page
      .getByRole("navigation", { name: "Plans" })
      .getByRole("button", { name: "Plan B", exact: true })
      .click();
    await expect(page).toHaveTitle("Plan B · Spring 2027 · Terpsicle");
    await openCourse(page, "cmsc 351", "CMSC351");
    await expect(page).toHaveTitle("CMSC351 · Terpsicle");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await expect(page).toHaveTitle("Plan B · Spring 2027 · Terpsicle");
  });

  test("an undo toast waits while its button has focus", async ({ page }) => {
    test.slow();
    await open(page);
    await page.getByRole("button", { name: "Actions for STAT400" }).click();
    await page.getByRole("menuitem", { name: /Remove/ }).click();
    const toast = page.locator("[data-sonner-toast]");
    await expect(toast).toContainText("Removed STAT400");
    // Tab order reaches it after the page (the toasts come last); sonner's
    // Alt+T jumps there too. Here it's focused directly.
    await toast.getByRole("button", { name: "Undo" }).focus();
    // Past its 10 seconds, it's still there.
    await page.waitForTimeout(11_000);
    await expect(toast).toContainText("Removed STAT400");
    await page.keyboard.press("Enter");
    await expect(
      calendar(page)
        .getByRole("button", { name: /^STAT400 0101/ })
        .first(),
    ).toBeVisible();
  });
});

test.describe("forced colors", () => {
  test.use({ forcedColors: "active" });
  test.skip(({ isMobile }) => isMobile, "desktop");

  async function scan(page: Page, what: string) {
    await page.waitForTimeout(250);
    const { violations } = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .disableRules("region")
      .exclude(".maplibregl-canvas")
      .analyze();
    expect
      .soft(
        violations.map((v) => `${v.id}: ${v.nodes[0]?.target.join(" ")}`),
        `axe in forced colors: ${what}`,
      )
      .toEqual([]);
  }

  const style = (el: Locator, props: string[]) =>
    el.evaluate((node, names) => {
      const s = getComputedStyle(node);
      return Object.fromEntries(names.map((n) => [n, s.getPropertyValue(n)]));
    }, props);

  test("ghosts, rings and selected states stay visible", async ({ page }) => {
    await open(page);
    await scan(page, "the week");
    await openCourse(page, "cmsc 351", "CMSC351");
    await scan(page, "course details with ghosts");

    // Ghosts keep their dashed border; the course's own class, whose ring
    // is a shadow forced colors drop, gets a thicker border.
    const ghost = calendar(page).locator("[data-ghost]").first();
    expect(await style(ghost, ["border-top-style"])).toEqual({
      "border-top-style": "dashed",
    });
    const current = calendar(page)
      .getByRole("button", { name: /^CMSC351 0301, Monday/ })
      .first();
    expect(await style(current, ["border-top-width"])).toEqual({
      "border-top-width": "3px",
    });
    // The selected rail tab and the current section row are outlined.
    const rail = page
      .getByRole("navigation", { name: "Sidebar tabs" })
      .getByRole("button", { name: "Search" });
    expect((await style(rail, ["outline-style"]))["outline-style"]).toBe(
      "solid",
    );
    const row = activeLayer(page).locator('[data-section="0301"]');
    expect((await style(row, ["outline-style"]))["outline-style"]).toBe(
      "solid",
    );
    // A focused ghost shows the focus ring.
    await calendar(page).locator("[data-nav-key][tabindex='0']").focus();
    await page.keyboard.press("ArrowDown");
    await expect(focused(page)).toHaveAttribute("data-ghost", /.+/);
    // After its 150ms fade-in: mid-animation Chrome reports a thinner ring.
    await page.waitForTimeout(300);
    const ring = await style(focused(page), ["outline-style", "outline-width"]);
    expect(ring["outline-style"]).toBe("solid");
    expect(Number.parseFloat(ring["outline-width"] ?? "0")).toBeGreaterThan(1);
    // Seat meters and grade bars keep a visible fill.
    const bar = activeLayer(page).locator("[data-grade]").first();
    expect(await style(bar, ["forced-color-adjust"])).toEqual({
      "forced-color-adjust": "none",
    });
  });
});

test.describe("reflow", () => {
  // 1280px at 400% zoom: 320 wide. Nothing scrolls sideways, and everything
  // can still be reached.
  test.use({ viewport: { width: 320, height: 640 } });

  const noSidewaysScroll = (page: Page) =>
    page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    );

  test("at 320px wide, nothing scrolls sideways", async ({ page }) => {
    await open(page);
    expect(await noSidewaysScroll(page)).toBe(true);
    await page.keyboard.press("/");
    await page
      .getByRole("combobox", { name: "Search courses" })
      .fill("cmsc 330");
    // The filter chips wrap rather than hide off the edge.
    const level = page.getByRole("button", { name: "Level" });
    await expect(level).toBeInViewport({ ratio: 1 });
    expect(await noSidewaysScroll(page)).toBe(true);
    await page.locator('[data-course-result="CMSC330"]').click();
    await expect(page.getByTestId("sections")).toBeVisible();
    expect(await noSidewaysScroll(page)).toBe(true);
  });

  test("at 320×256, raising the drawer shows the panel and its list", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 256 });
    await open(page);
    await page.keyboard.press("/");
    await page.getByRole("combobox", { name: "Search courses" }).fill("cmsc");
    // Half the screen couldn't show anything under the tabs: the drawer
    // opens all the way, and the panel scrolls as a whole.
    const first = page.locator("[data-course-result]").first();
    await first.scrollIntoViewIfNeeded();
    await expect(first).toBeInViewport();
    await first.click();
    await expect(page.getByTestId("sections")).toBeAttached();
    expect(await noSidewaysScroll(page)).toBe(true);
  });
});
