import { expect, type Locator, type Page, test } from "@playwright/test";

// How blocks read on the demo plan (`/?demo=1`), on desktop and phones:
// labels at the top of tall blocks, and course codes that never give way.

let errors: string[] = [];
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/schedule?demo=1");
  await expect(
    calendar(page)
      .getByRole("button", { name: /^CMSC351 0301/ })
      .first(),
  ).toBeVisible();
});
test.afterEach(() => {
  expect(errors).toEqual([]);
});

const calendar = (page: Page) =>
  page.getByRole("region", { name: "Week calendar" });

/** Its first line's distance from its top edge, in px. */
async function labelOffset(block: Locator): Promise<number> {
  return block.evaluate((el) => {
    const first = el.firstElementChild;
    if (!first) throw new Error("empty block");
    return first.getBoundingClientRect().top - el.getBoundingClientRect().top;
  });
}

/** The element shows all of its text: nothing cut off or ellipsized. */
async function fullyShown(el: Locator): Promise<boolean> {
  return el.evaluate((node) => {
    const box = node.getBoundingClientRect();
    const parent = node.closest("button")?.getBoundingClientRect();
    return (
      node.scrollWidth <= node.clientWidth + 1 &&
      box.width > 0 &&
      (!parent || box.right <= parent.right + 1)
    );
  });
}

test("a class's label sits at the top of its block", async ({ page }) => {
  const blocks = calendar(page).locator("button[data-course]");
  const count = await blocks.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    // py-1 plus the border: the label starts right under the top edge.
    expect(await labelOffset(blocks.nth(i))).toBeLessThanOrEqual(6);
  }
});

test("a discussion's course code shows in full, however narrow the day", async ({
  page,
}) => {
  const discussions = calendar(page)
    .locator("button[data-course]")
    .filter({ hasText: "discussion" });
  const count = await discussions.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    const code = discussions.nth(i).locator("span").first();
    await expect(code).toHaveText(/^[A-Z]{4}\d{3}[A-Z]?$/);
    expect(await fullyShown(code)).toBe(true);
  }
});

test("side-by-side ghosts keep their section codes readable", async ({
  page,
}) => {
  await calendar(page)
    .getByRole("button", { name: /^CMSC351 0301/ })
    .first()
    .click();
  const ghosts = calendar(page).locator("[data-ghost]");
  await expect(ghosts.first()).toBeVisible();
  const count = await ghosts.count();
  for (let i = 0; i < count; i++) {
    const ghost = ghosts.nth(i);
    const code = await ghost.getAttribute("data-ghost");
    const label = ghost.locator("span").first();
    // "0201", or the full label when there's room ("0201–0203 · 3 sections").
    await expect(label).toContainText(code ?? "");
    const text = (await label.textContent()) ?? "";
    if (text === code) expect(await fullyShown(label)).toBe(true);
  }
});
