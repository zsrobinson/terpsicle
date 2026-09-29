import { expect, type Page, test } from "@playwright/test";

// Terpsicle Reviews in two columns (owner, 2026-09-29), on `pnpm dev:mock`:
// the search as an autocomplete over the page, the smaller one in the family
// bar past the front door, the review box that knows what you took, the
// front door's narrow column of your classes, and the family bar's
// product tabs folded to their marks.
//
// The demo's plan (Spring 2027, the mock term) is copied into Summer 2026, a
// term that's over and that the Schedule of Classes still lists (only those
// terms' schedules count), so its CMSC351 section, Keiko Ashdown's, is a
// class you took.

let errors: string[] = [];
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
});
test.afterEach(() => {
  expect(errors).toEqual([]);
});

const bar = (page: Page) => page.locator("[data-slot=app-bar]");

/** The page's code is running: the account has answered. */
async function hydrated(page: Page) {
  await expect(
    bar(page).getByRole("button", { name: /^(Sign in|Account: )/ }),
  ).toBeVisible();
}

/** The demo's main plan on this device, copied into Summer 2026. */
async function tookLastSummer(page: Page) {
  await page.goto("/schedule/courses?demo=1");
  await expect(
    page.getByRole("banner").getByRole("button", { name: "Share" }),
  ).toBeVisible();
  // Saved to IndexedDB, which Reviews reads.
  await page.waitForTimeout(1000);
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open("terpsicle");
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    const plans = await new Promise<{ order: number }[]>((resolve) => {
      const all = db.transaction("plans").objectStore("plans").getAll();
      all.onsuccess = () => resolve(all.result);
    });
    const main = plans.sort((a, b) => a.order - b.order)[0];
    const tx = db.transaction("plans", "readwrite");
    tx.objectStore("plans").put({
      ...main,
      // In place of the demo's own summer plan, so it's the term's main plan.
      id: "plan_demo_summer",
      termId: "202605",
      name: "Summer plan",
    });
    await new Promise((resolve) => {
      tx.oncomplete = resolve;
    });
    db.close();
  });
}

/** Signs in as a throwaway person, who has written nothing. */
async function signIn(page: Page, id: string) {
  const status = await page.evaluate(async (userId) => {
    const response = await fetch("/api/auth/test-sign-in", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, return: "/reviews" }),
    });
    return response.status;
  }, id);
  expect(status).toBe(200);
}

test("the search's results open over the page, and the keys move through them", async ({
  page,
}) => {
  await page.goto("/reviews");
  await hydrated(page);
  const box = page.getByRole("combobox", {
    name: "Search instructors and courses",
  });
  await box.fill("ashdown");
  const results = page.getByRole("listbox");
  await expect(
    results.getByRole("option", { name: /Keiko Ashdown/ }),
  ).toHaveAttribute("href", "/reviews/ashdown-keiko");
  // Over the page, not in its place: the page is all still there, at its
  // address. (While the results are open, Base UI hides the rest of the
  // page from screen readers, as a combobox's popup does, so it's found by
  // its text here.)
  await expect(page.locator("h2", { hasText: "Most taken" })).toBeVisible();
  await expect(page.locator("h2", { hasText: "Recent reviews" })).toHaveCount(
    1,
  );
  await expect(page).toHaveURL(/\/reviews$/);

  // ↓ and ↑ move through the results.
  const highlighted = results.locator("[role=option][data-highlighted]");
  await box.press("ArrowDown");
  await expect(highlighted).toHaveCount(1);
  const first = await highlighted.textContent();
  await box.press("ArrowDown");
  await expect(highlighted).not.toHaveText(first ?? "");
  await expect(box).toHaveAttribute("aria-activedescendant", /.+/);

  // Esc closes the results and leaves what you typed.
  await box.press("Escape");
  await expect(results).toBeHidden();
  await expect(box).toHaveValue("ashdown");
  await expect(box).toBeFocused();

  // Enter opens the highlighted one, or the first.
  await box.fill("cmsc 351");
  await expect(results.getByRole("option").first()).toHaveAccessibleName(
    /CMSC351\s*Algorithms/,
  );
  await box.press("Enter");
  await expect(page).toHaveURL(/\/reviews\/cmsc351$/);
  await expect(
    page.getByRole("heading", { name: "CMSC351 Algorithms", level: 1 }),
  ).toBeVisible();
});

test("every result for a search is a page of its own", async ({ page }) => {
  await page.goto("/reviews");
  await hydrated(page);
  const box = page.getByRole("combobox", {
    name: "Search instructors and courses",
  });
  await box.fill("CMSC");
  await page
    .getByRole("listbox")
    .getByRole("option", { name: /Every CMSC course/ })
    .click();
  await expect(page).toHaveURL(/\/reviews\?q=CMSC$/);
  await expect(
    page.getByRole("heading", { name: "CMSC courses", level: 2 }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("list", { name: "Courses" })
      .getByRole("link", { name: /CMSC351\s*Algorithms/ }),
  ).toHaveAttribute("href", "/reviews/cmsc351");
});

test("past the front door, the bar has the search", async ({
  page,
  isMobile,
}) => {
  await page.goto("/reviews");
  await hydrated(page);
  // The front door has its own big box, and the bar none.
  await expect(bar(page).getByRole("combobox")).toHaveCount(0);
  await expect(
    bar(page).getByRole("button", { name: "Search reviews" }),
  ).toHaveCount(0);

  await page.goto("/reviews/cmsc351");
  await hydrated(page);
  let box = bar(page).getByRole("combobox", {
    name: "Search instructors and courses",
  });
  if (isMobile) {
    // A phone's bar has the magnifier; the search opens in a sheet.
    await expect(box).toBeHidden();
    await bar(page).getByRole("button", { name: "Search reviews" }).click();
    const sheet = page.getByRole("dialog", { name: "Search reviews" });
    box = sheet.getByRole("combobox", {
      name: "Search instructors and courses",
    });
    await expect(box).toBeFocused();
  }
  await box.fill("ashdown");
  await page
    .getByRole("listbox")
    .getByRole("option", { name: /Keiko Ashdown/ })
    .click();
  await expect(page).toHaveURL(/\/reviews\/ashdown-keiko$/);
  await expect(
    page.getByRole("heading", { name: "Keiko Ashdown", level: 1 }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("the review box names the class you took, and the form starts from its term", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "the same box on phones; one writer is enough");
  await tookLastSummer(page);
  await signIn(page, "e2ereviewbox");
  await page.goto("/reviews/cmsc351");
  const box = page.getByRole("region", {
    name: "You took CMSC351 with Keiko Ashdown in Summer 2026",
  });
  await expect(box).toContainText("How did it go?");
  await box.getByRole("button", { name: "Write a review" }).click();
  const form = page.getByRole("form", { name: "Write a review" });
  await expect(form).toContainText("Keiko Ashdown");
  await expect(form.getByLabel("When you took it")).toContainText(
    "Summer 2026",
  );

  // Signed out, the box asks, and never guesses.
  await page.context().clearCookies();
  await page.goto("/reviews/ashdown-keiko?course=CMSC351");
  await hydrated(page);
  const asking = page.getByRole("region", {
    name: /^Took CMSC351 with Keiko Ashdown\?$/,
  });
  await expect(asking).toContainText(
    "Sign in with your UMD account to review it.",
  );
});

test("the front door's narrow column lists the classes you took", async ({
  page,
  isMobile,
}) => {
  await tookLastSummer(page);
  await page.goto("/reviews");
  await hydrated(page);
  const yours = page.getByRole("list", { name: "Classes to review" });
  // Signed out: theirs to read about, and one quiet line on signing in.
  await expect(
    page.getByRole("heading", { name: "Classes you took", level: 2 }),
  ).toBeVisible();
  const row = yours.getByRole("link", { name: /Keiko Ashdown in CMSC351/ });
  await expect(row).toHaveAttribute(
    "href",
    "/reviews/ashdown-keiko?course=CMSC351",
  );
  await expect(
    page.getByText("Sign in with your UMD account to review them."),
  ).toBeVisible();
  if (!isMobile) {
    // Beside the page's own lists, not under them.
    const side = await yours.boundingBox();
    const main = await page
      .getByRole("heading", { name: "Most taken" })
      .boundingBox();
    expect(side?.x ?? 0).toBeGreaterThan((main?.x ?? 0) + 400);
  }

  // Signed in: each one a step from the form.
  await signIn(page, isMobile ? "e2eyoursphone" : "e2eyoursdesk");
  await page.goto("/reviews");
  await expect(
    page.getByRole("heading", { name: "Review your classes", level: 2 }),
  ).toBeVisible();
  await expect(row).toHaveAttribute(
    "href",
    "/reviews/ashdown-keiko?course=CMSC351&write=1",
  );
  await row.click();
  await expect(
    page.getByRole("form", { name: "Write a review" }),
  ).toBeVisible();
});

test("the bar's other products fold to their marks until you reach for them", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "phones have the tab bar");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/reviews/cmsc351");
  await hydrated(page);
  const tabs = bar(page).getByRole("navigation", { name: "Products" });
  const width = (name: string) =>
    tabs
      .getByRole("link", { name })
      .locator("[data-tab-name]")
      .evaluate((el) => el.getBoundingClientRect().width);
  // At rest: Reviews keeps its name; the others are just their marks, and
  // still named for a screen reader, with their tooltips.
  await expect(tabs.getByRole("link", { name: "Reviews" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect.poll(() => width("Reviews")).toBeGreaterThan(30);
  await expect.poll(() => width("Schedule")).toBeLessThan(1);
  await expect(tabs.getByRole("link", { name: "Schedule" })).toHaveAttribute(
    "data-tooltip",
    "",
  );

  // Hovering the tabs opens every name.
  await tabs.hover();
  await expect.poll(() => width("Schedule")).toBeGreaterThan(30);
  await page.mouse.move(700, 600);
  await expect.poll(() => width("Schedule")).toBeLessThan(1);

  // So does tabbing into them.
  await tabs.getByRole("link", { name: "Chat" }).focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect.poll(() => width("Chat")).toBeGreaterThan(20);

  // Other products' bars keep their names.
  await page.goto("/todo");
  await hydrated(page);
  await expect.poll(() => width("Schedule")).toBeGreaterThan(30);
});
