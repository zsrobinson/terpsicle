import { expect, test } from "@playwright/test";

// A first visit to a course link (DATA.md §5.1): the course's department is
// fetched ahead of the rest of the term, and its details show while the
// other departments are still on their way. Search waits for all of them.
// The mock data is fetched over HTTP here (`MOCK_DATA_OVER_HTTP_KEY` in
// src/state/data-source.ts), so `page.route` can hold files back.

const DEPT_FILE = /\/data\/catalog\/\d+\/dept\/([A-Z]{4})\.[0-9a-f]{16}\.json$/;

let errors: string[] = [];
test.beforeEach(({ page }) => {
  errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
});
test.afterEach(() => {
  expect(errors).toEqual([]);
});

test.skip(({ isMobile }) => isMobile, "the data path is the same on phones");

test("a course link shows its details before the rest of the catalog loads", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("terpsicle:mock-data", "http"),
  );
  const requested: string[] = [];
  let finished = 0;
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(DEPT_FILE, async (route) => {
    const dept = DEPT_FILE.exec(route.request().url())?.[1] ?? "";
    requested.push(dept);
    // Every department but the course's waits until the test lets it go.
    if (dept !== "CMSC") await held;
    await route.continue();
  });
  page.on("requestfinished", (request) => {
    if (DEPT_FILE.test(request.url())) finished++;
  });

  await page.goto("/schedule?term=202701&course=CMSC216");

  await expect(
    page.getByText("Introduction to Computer Systems").first(),
  ).toBeVisible();
  // Only the course's department has arrived: the details didn't wait for
  // the rest of the term, which may not even be requested yet.
  expect(requested[0]).toBe("CMSC");
  expect(finished).toBe(1);
  // The rest follows in the background, and stays held back.
  await expect.poll(() => requested.length).toBeGreaterThan(1);
  expect(finished).toBe(1);

  // Search waits for the whole term rather than answer from one department.
  await page.keyboard.press("/");
  const box = page.getByRole("combobox", { name: "Search courses" });
  await box.fill("engl 101");
  await expect(page.getByTestId("search-loading")).toBeVisible();

  release();
  await expect(page.locator('[data-course-result="ENGL101"]')).toBeVisible();
  await expect.poll(() => finished).toBe(requested.length);
});
