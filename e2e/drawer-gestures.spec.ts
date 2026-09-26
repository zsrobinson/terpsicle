import { expect, type Page, test } from "@playwright/test";

// The phone drawer under a finger. A downward drag in the drawer, or on the
// calendar at its top, used to run on into the page and pull it to refresh
// (the owner: "dragging down in the slider tries to reload the page").
// Headless Chromium has no pull-to-refresh, so these check its causes: the
// page's overscroll settings, and that the drawer, not the browser, takes a
// pull on a list that's already at its top. Nothing may reload or move
// through history meanwhile.

test.skip(({ isMobile }) => !isMobile, "phone layout");

let errors: string[] = [];
let navigations: string[] = [];

/** What the page notes about its own history (`watchHistory`). */
interface HistoryWatch {
  /** Set once the page has loaded; a reload starts a document without it. */
  __sameDocument?: true;
  /** Every URL the app wrote with `pushState`/`replaceState`. */
  __appUrls?: string[];
  __popstates?: number;
}

/**
 * The app writes its own URL as people move around (`?tab=search`,
 * `&q=cmsc`: src/app/README.md, "URL state"), and those show up as
 * navigations too. So rather than "no navigation at all", the page records
 * the URLs it wrote itself and every `popstate`, before any of its code runs.
 */
function watchHistory() {
  const w = window as unknown as HistoryWatch;
  w.__appUrls = [];
  w.__popstates = 0;
  for (const name of ["pushState", "replaceState"] as const) {
    const original = history[name].bind(history);
    history[name] = (
      state: unknown,
      unused: string,
      url?: string | URL | null,
    ) => {
      if (url != null) w.__appUrls?.push(new URL(url, location.href).href);
      original(state, unused, url);
    };
  }
  addEventListener("popstate", () => {
    w.__popstates = (w.__popstates ?? 0) + 1;
  });
}

test.beforeEach(async ({ page }) => {
  errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(watchHistory);
  await page.goto("/schedule");
  await expect(page.getByRole("img", { name: "Terpsicle" })).toBeVisible();
  // A first visit opens the drawer to half, on the first-visit guide.
  await expect(drawer(page)).toHaveAttribute("data-snap", "half");
  await page.evaluate(() => {
    (window as unknown as HistoryWatch).__sameDocument = true;
  });
  navigations = [];
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) navigations.push(frame.url());
  });
});

test.afterEach(async ({ page }, testInfo) => {
  expect(errors).toEqual([]);
  // A skipped test (desktop) never opened the page.
  if (testInfo.expectedStatus === "skipped") return;
  // No reload and no history swipe, whatever the gesture:
  // - a reload is a new document, which hasn't been marked;
  // - a swipe back or forward fires popstate (within the app) or loads
  //   another document (out of it);
  // - and every navigation is a URL the app wrote itself, never another.
  const seen = await page.evaluate(() => {
    const w = window as unknown as HistoryWatch;
    return {
      sameDocument: w.__sameDocument === true,
      popstates: w.__popstates ?? 0,
      appUrls: w.__appUrls ?? [],
    };
  });
  expect(seen.sameDocument, "the page reloaded").toBe(true);
  expect(seen.popstates, "history moved back or forward").toBe(0);
  expect(navigations.filter((url) => !seen.appUrls.includes(url))).toEqual([]);
});

const drawer = (page: Page) => page.locator("[data-vaul-drawer]");
const tabs = (page: Page) =>
  page.getByRole("navigation", { name: "Tabs", exact: true });

interface Point {
  x: number;
  y: number;
}

/**
 * One finger from `from` to `to`, through the browser's real touch input
 * (so it scrolls, and cancels pointers, as a phone would). `held` runs
 * before the finger lifts.
 */
async function drag(
  page: Page,
  from: Point,
  to: Point,
  held?: () => Promise<void>,
): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  const touch = (
    type: "touchStart" | "touchMove" | "touchEnd",
    points: Point[],
  ) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points });
  await touch("touchStart", [from]);
  const steps = 16;
  for (let i = 1; i <= steps; i++) {
    await touch("touchMove", [
      {
        x: from.x + ((to.x - from.x) * i) / steps,
        y: from.y + ((to.y - from.y) * i) / steps,
      },
    ]);
    // A frame per step, so it reads as a drag rather than a jump.
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(resolve)),
    );
  }
  await held?.();
  await touch("touchEnd", []);
  await cdp.detach();
}

async function centerOf(page: Page, selector: string): Promise<Point> {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) throw new Error(`${selector} isn't on screen`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/**
 * Search results for "cmsc": a long list, at the top. Typing raised the
 * drawer all the way (e2e/drawer-keyboard.spec.ts).
 */
async function searchResults(page: Page) {
  await tabs(page).getByRole("button", { name: "Search" }).tap();
  await page.getByRole("combobox", { name: "Search courses" }).fill("cmsc");
  const results = page.locator("#search-results");
  await expect(results.locator("[data-course-result]").first()).toBeVisible();
  await expect(drawer(page)).toHaveAttribute("data-snap", "full");
  return results;
}

/** vaul's snap animation takes 0.5 s; a drag before it ends is ignored. */
const settle = (page: Page) => page.waitForTimeout(600);

test("the page can't scroll, rubber-band or pull to refresh", async ({
  page,
}) => {
  const style = (selector: string) =>
    page
      .locator(selector)
      .first()
      .evaluate((el) => {
        const s = getComputedStyle(el);
        return {
          overscroll: s.overscrollBehaviorY,
          overflow: s.overflowY,
          touch: s.touchAction,
        };
      });

  for (const root of ["html", "body"]) {
    const s = await style(root);
    expect(s.overscroll, root).toBe("none");
    expect(s.overflow, root).toBe("hidden");
  }
  // The scrollers keep their own scrolling but never hand it to the page.
  expect((await style("[data-vaul-drawer] [data-panel-body]")).overscroll).toBe(
    "contain",
  );
  expect((await style("[data-calendar-scroll]")).overscroll).toBe("contain");
  await searchResults(page);
  expect((await style("#search-results")).overscroll).toBe("contain");

  // vaul makes the drawer `touch-action: none` so it can follow a finger;
  // ours still lets a pinch zoom the page, and so does the viewport.
  expect((await style("[data-vaul-drawer]")).touch).toBe("pinch-zoom");
  const viewport = await page
    .locator('meta[name="viewport"]')
    .getAttribute("content");
  expect(viewport).not.toMatch(/user-scalable\s*=\s*(no|0)|maximum-scale/);
});

test("pulling a list down at its top lowers the drawer", async ({ page }) => {
  const results = await searchResults(page);
  await settle(page);
  expect(await results.evaluate((el) => el.scrollTop)).toBe(0);

  // The browser cancels the pointer when it takes a drag for a scroll, and
  // that's the drag that ran on into pull-to-refresh.
  await page.evaluate(() => {
    const w = window as Window & { cancelled?: number };
    w.cancelled = 0;
    addEventListener("pointercancel", () => {
      w.cancelled = (w.cancelled ?? 0) + 1;
    });
  });
  const top = () =>
    drawer(page).evaluate((el) => el.getBoundingClientRect().top);
  const before = await top();
  const box = await results.boundingBox();
  if (!box) throw new Error("no results");
  const start = { x: box.x + box.width / 2, y: box.y + 30 };
  await drag(page, start, { x: start.x, y: start.y + 200 }, async () => {
    // Mid-drag, the drawer follows the finger.
    expect(await top()).toBeGreaterThan(before + 150);
  });
  expect(
    await page.evaluate(() => (window as { cancelled?: number }).cancelled),
  ).toBe(0);
  // Down from full it rests lower: half, or peek for a quick flick.
  await expect(drawer(page)).toHaveAttribute("data-snap", /^(half|peek)$/);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test("dragging the grabber moves the drawer up and down", async ({ page }) => {
  const grabber = '[data-vaul-drawer] button[aria-label$="the panel"]';
  const top = () =>
    drawer(page).evaluate((el) => el.getBoundingClientRect().top);
  await settle(page);
  // Down from half: it follows the finger, then rests at peek.
  const before = await top();
  let at = await centerOf(page, grabber);
  await drag(page, at, { x: at.x, y: at.y + 200 }, async () => {
    expect(await top()).toBeGreaterThan(before + 150);
  });
  await expect(drawer(page)).toHaveAttribute("data-snap", "peek");

  await settle(page);
  at = await centerOf(page, grabber);
  await drag(page, at, { x: at.x, y: 60 });
  await expect(drawer(page)).toHaveAttribute("data-snap", "full");

  await settle(page);
  at = await centerOf(page, grabber);
  await drag(page, at, { x: at.x, y: at.y + 250 });
  await expect(drawer(page)).toHaveAttribute("data-snap", "half");
});

test("a scrolled list scrolls under a finger; the drawer stays", async ({
  page,
}) => {
  const results = await searchResults(page);
  await settle(page);

  const box = await results.boundingBox();
  if (!box) throw new Error("no results");
  const x = box.x + box.width / 2;
  // Finger up: the list scrolls.
  await drag(page, { x, y: box.y + box.height - 40 }, { x, y: box.y + 40 });
  await expect
    .poll(() => results.evaluate((el) => el.scrollTop))
    .toBeGreaterThan(100);
  await expect(drawer(page)).toHaveAttribute("data-snap", "full");

  // Finger down while it's scrolled: the list scrolls back.
  const scrolled = await results.evaluate((el) => el.scrollTop);
  await drag(page, { x, y: box.y + 40 }, { x, y: box.y + 200 });
  await expect
    .poll(() => results.evaluate((el) => el.scrollTop))
    .toBeLessThan(scrolled);
  await expect(drawer(page)).toHaveAttribute("data-snap", "full");
});

test("scrolling a list back up leaves the drawer where it is", async ({
  page,
}) => {
  // On a phone (the mobile lab's url-bar scenario, Android Chrome), a finger
  // moving down on a scrolled list reached vaul as a few pointer moves
  // before the browser took the scroll and cancelled the pointer. vaul
  // dragged the drawer for those moves, took the pointerout that follows a
  // cancel for a release, and read it as a flick down: the drawer dropped to
  // half or peek. Headless Chromium cancels before any move, so this plays
  // the phone's sequence after a real touch: moves, cancel, pointerout.
  const results = await searchResults(page);
  await settle(page);
  await results.evaluate((el) => el.scrollTo({ top: 600 }));
  await expect.poll(() => results.evaluate((el) => el.scrollTop)).toBe(600);
  const box = await results.boundingBox();
  if (!box) throw new Error("no results");
  const at = { x: box.x + box.width / 2, y: box.y + 200 };

  const pointerId = page.evaluate(
    () =>
      new Promise<number>((resolve) =>
        addEventListener("pointerdown", (e) => resolve(e.pointerId), {
          once: true,
          capture: true,
        }),
      ),
  );
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [at],
  });
  await results.evaluate(
    (el, { id, x, y }) => {
      const send = (type: string, dy: number) =>
        el.dispatchEvent(
          new PointerEvent(type, {
            pointerId: id,
            pointerType: "touch",
            isPrimary: true,
            bubbles: true,
            cancelable: true,
            clientX: x,
            clientY: y + dy,
          }),
        );
      for (const dy of [6, 14, 26, 40]) send("pointermove", dy);
      send("pointercancel", 40);
      send("pointerout", 40);
    },
    { id: await pointerId, ...at },
  );
  // The browser owns the touch now: it ends without a tap.
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchCancel",
    touchPoints: [],
  });
  await cdp.detach();
  await settle(page);
  await expect(drawer(page)).toHaveAttribute("data-snap", "full");
  expect(
    await drawer(page).evaluate((el) => el.getBoundingClientRect().top),
  ).toBeLessThanOrEqual(48 + 1);
});

test("the calendar scrolls, and a pull at its top goes nowhere", async ({
  page,
}) => {
  // The open tab again lowers the drawer, leaving the calendar the screen.
  await tabs(page).getByRole("button", { name: "Courses" }).tap();
  await expect(drawer(page)).toHaveAttribute("data-snap", "peek");
  const scroller = page.locator("[data-calendar-scroll]");
  const box = await scroller.boundingBox();
  if (!box) throw new Error("no calendar");
  const x = box.x + box.width / 2;
  if (await scroller.evaluate((el) => el.scrollHeight > el.clientHeight)) {
    await drag(page, { x, y: box.y + box.height - 20 }, { x, y: box.y + 40 });
    await expect
      .poll(() => scroller.evaluate((el) => el.scrollTop))
      .toBeGreaterThan(0);
    await scroller.evaluate((el) => el.scrollTo({ top: 0 }));
  }
  await drag(page, { x, y: box.y + 40 }, { x, y: box.y + 400 });
  expect(await scroller.evaluate((el) => el.scrollTop)).toBe(0);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await expect(drawer(page)).toHaveAttribute("data-snap", "peek");
});
