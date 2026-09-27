import { expect, type Page, test } from "@playwright/test";
import { scan } from "./axe";

// "Send feedback" (docs/FEEDBACK.md) on the mock app, against the real
// Worker and local D1: a bug with its screenshot, whose private block
// labels are painted over; Undo; the phone drawer; axe on the open sheet;
// and the admin's pinned notes. Each run's words are its own, so runs and
// the two projects can share the local database.

let errors: string[] = [];

test.beforeEach(async ({ page }) => {
  errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
});

test.afterEach(() => {
  expect(errors).toEqual([]);
});

// Screenshots of the whole page, on a busy machine.
test.describe.configure({ timeout: 90_000 });

const calendar = (page: Page) =>
  page.getByRole("region", { name: "Week calendar" });

const sheet = (page: Page) =>
  page.getByRole("dialog", { name: "Send feedback" });

async function openDemo(page: Page) {
  await page.goto("/schedule?demo=1");
  await expect(
    calendar(page)
      .getByRole("button", { name: /^CMSC351 0301/ })
      .first(),
  ).toBeVisible();
}

/**
 * Opens the sheet: the top bar's button on desktop, the account menu's
 * "Send feedback" on phones (the bar has no room for another button).
 */
async function openSheet(page: Page, isMobile: boolean) {
  if (isMobile) {
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.getByRole("menuitem", { name: "Send feedback" }).click();
  } else await page.getByTestId("feedback-button").click();
  await expect(sheet(page)).toBeVisible();
}

/**
 * Closes it as people do: Esc on desktop, a tap above the drawer on phones
 * (where a tapped control's tooltip would take an Esc first).
 */
async function closeSheet(page: Page, isMobile: boolean) {
  if (isMobile) await page.touchscreen.tap(195, 40);
  else await page.keyboard.press("Escape");
  await expect(sheet(page)).toBeHidden();
}

/** A unique note, so a check finds this run's own item. */
const unique = (words: string) =>
  `${words} ${Math.random().toString(36).slice(2, 8)}`;

test("a bug goes with its screenshot, labels blacked out, and Undo takes it back", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "the phone drawer has its own test");
  await openDemo(page);
  const block = calendar(page).locator("button[data-private]").first();
  await expect(block).toBeVisible();
  const box = await block.boundingBox();
  if (!box) throw new Error("the block has no box");

  await page.getByRole("button", { name: "Feedback" }).click();
  await expect(sheet(page)).toBeVisible();
  const shot = page.getByTestId("feedback-shot");
  await expect(shot).toBeVisible({ timeout: 30_000 });

  // The block's pixels in the image the sheet will send: one flat color,
  // so no letter of its label survives.
  const colors = await shot.evaluate(async (img: HTMLImageElement, rect) => {
    const bitmap = await createImageBitmap(await (await fetch(img.src)).blob());
    const scale = bitmap.width / window.innerWidth;
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas");
    ctx.drawImage(bitmap, 0, 0);
    // Inset past the box's anti-aliased edge.
    const x = Math.ceil((rect.x + 3) * scale);
    const y = Math.ceil((rect.y + 3) * scale);
    const w = Math.floor((rect.width - 6) * scale);
    const h = Math.floor((rect.height - 6) * scale);
    const data = ctx.getImageData(x, y, w, h).data;
    const seen = new Set<string>();
    // Lossy WebP wobbles a little: round each channel to 16 levels.
    for (let i = 0; i < data.length; i += 4)
      seen.add(
        [data[i], data[i + 1], data[i + 2]]
          .map((v) => Math.round((v ?? 0) / 16))
          .join(","),
      );
    return seen.size;
  }, box);
  expect(colors).toBeLessThanOrEqual(2);

  const words = unique("The route map stays blank");
  await sheet(page).getByLabel("What happened?").fill(words);
  await sheet(page)
    .getByLabel(/What did you expect\?/)
    .fill("A map");
  const sent = page.waitForResponse("**/api/feedback/send");
  await sheet(page).getByRole("button", { name: "Send" }).click();
  const response = await sent;
  expect(response.status()).toBe(200);
  const body = response.request().postDataJSON() as {
    kind: string;
    text: string;
    screenshot?: { type: string };
    context?: { actions: unknown[] };
  };
  expect(body).toMatchObject({ kind: "bug", text: words });
  expect(body.screenshot?.type).toMatch(/^image\/(webp|png)$/);
  expect(body.context?.actions.length).toBeGreaterThan(0);
  await expect(sheet(page)).toBeHidden();

  await expect(page.getByText("Sent. Thanks for telling us.")).toBeVisible();
  const undone = page.waitForResponse("**/api/feedback/undo");
  await page.getByRole("button", { name: "Undo" }).click();
  expect(await (await undone).json()).toEqual({ status: "undone" });
  await expect(
    page.getByText("Unsent. Your words are back in Send feedback."),
  ).toBeVisible();
  // The words are back for another try.
  await page.getByRole("button", { name: "Feedback" }).click();
  await expect(sheet(page).getByLabel("What happened?")).toHaveValue(words);
});

test("the sheet passes axe in both themes, and Esc keeps the draft", async ({
  page,
  isMobile,
}) => {
  await openDemo(page);
  const open = () => openSheet(page, isMobile);
  await open();
  await expect(page.getByTestId("feedback-shot")).toBeVisible({
    timeout: 30_000,
  });
  await scan(page, "feedback sheet");
  await sheet(page).getByTestId("feedback-screenshot").uncheck();
  await expect(
    sheet(page).getByText(
      "Without a screenshot, it's harder to see what you saw.",
    ),
  ).toBeVisible();
  // Clicked into, as a person would (a tooltip would take the first Esc).
  await sheet(page).getByLabel("What happened?").click();
  await sheet(page).getByLabel("What happened?").fill("Half a thought");
  await closeSheet(page, isMobile);
  await page.emulateMedia({ colorScheme: "dark" });
  await open();
  await expect(sheet(page).getByLabel("What happened?")).toHaveValue(
    "Half a thought",
  );
  await scan(page, "feedback sheet, dark");
});

test("phones get a drawer, from the menu or the header's icon", async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, "phones only");
  await openDemo(page);
  // The scheduler's bar has no room: it's in the account menu.
  await expect(page.getByTestId("feedback-button")).toHaveCount(0);
  await openSheet(page, true);
  await sheet(page).getByRole("radio", { name: "Suggest a feature" }).tap();
  await expect(sheet(page).getByLabel("What would help?")).toBeVisible();
  await closeSheet(page, true);

  // Elsewhere, the header's icon, alone.
  await page.goto("/reviews");
  const button = page.getByRole("button", { name: "Send feedback" });
  await expect(button).toBeVisible();
  await expect(button).not.toContainText("Feedback");
  await button.tap();
  await expect(sheet(page)).toBeVisible();
  await expect(sheet(page).getByLabel("What happened?")).toBeVisible();
});

test("it's on product pages, not on / or /privacy", async ({ page }) => {
  await page.goto("/reviews");
  await expect(page.getByTestId("feedback-button")).toBeVisible();
  await page.goto("/privacy");
  await expect(
    page.getByRole("heading", { name: "Privacy", level: 1 }),
  ).toBeVisible();
  await expect(page.getByTestId("feedback-button")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Feedback", level: 2 }),
  ).toBeVisible();
});

test("the admin pins a note on an element, sees its dot, and undoes it", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "pinning is for the owner's desktop reviews");
  await page.goto(
    `/auth/test?return=${encodeURIComponent("/schedule?demo=1")}`,
  );
  await page.getByRole("button", { name: "Sign in as Test Admin" }).click();
  await expect(
    calendar(page)
      .getByRole("button", { name: /^CMSC351 0301/ })
      .first(),
  ).toBeVisible();

  await page.getByRole("button", { name: "Feedback" }).click();
  await sheet(page).getByRole("radio", { name: "Pin a note" }).click();
  await sheet(page)
    .getByRole("button", { name: "Pick something to pin" })
    .click();
  await expect(sheet(page)).toBeHidden();
  await expect(
    page.getByText("Click anything to pin a note on it"),
  ).toBeVisible();

  const target = page.getByRole("heading", { name: "Plan A", level: 2 });
  await target.hover();
  await expect(page.getByTestId("feedback-pick-outline")).toBeVisible();
  await target.click();
  const note = unique("Make this bolder");
  await page.getByRole("textbox", { name: "Note" }).fill(note);
  const pinned = page.waitForResponse("**/api/feedback/pin");
  await page.getByRole("button", { name: "Pin", exact: true }).click();
  const response = await pinned;
  expect(response.status()).toBe(200);
  const body = response.request().postDataJSON() as {
    element: { selector: string; text: string };
    context: { theme: string };
    screenshot?: unknown;
    elementShot?: unknown;
  };
  expect(body.element.text).toContain("Plan A");
  expect(body.screenshot).toBeDefined();
  expect(body.elementShot).toBeDefined();
  // The selector finds the element again.
  expect(
    await page.evaluate(
      (selector) => document.querySelector(selector)?.textContent ?? "",
      body.element.selector,
    ),
  ).toContain("Plan A");

  await expect(page.getByText("Pinned.")).toBeVisible();
  const dot = page.getByRole("button", { name: new RegExp(`: ${note}$`) });
  await expect(dot).toBeVisible();

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(dot).toHaveCount(0);
});
