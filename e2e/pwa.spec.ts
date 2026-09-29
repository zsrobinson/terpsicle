import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  type BrowserContext,
  chromium,
  expect,
  type Page,
  type Route,
  test,
} from "@playwright/test";
import { scan } from "./axe";

// The installable app on `pnpm dev:mock`: the manifest, icons and head tags,
// /sw.js and what it does once registered, Chrome's own installability
// check (what Lighthouse reports), and the install prompt: offered once at a
// key moment, never again after it's closed (on an iPhone tab, a seat watch
// asks with the three steps to the Home Screen instead, V2 §6.7).

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";

let errors: string[] = [];
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
});
test.afterEach(() => {
  expect(errors).toEqual([]);
});

/**
 * Signed in (test mode, a throwaway person), with a watch asked for before
 * signing in, so the app starts it on load. The watch API is answered here
 * ("watching", after `gate` if given); the rest is the dev server's.
 */
async function watchesASeat(page: Page, gate?: Promise<void>) {
  await page.route("**/api/alerts/list", (route: Route) =>
    route.fulfill({ json: { status: "ok", watches: [] } }),
  );
  await page.route("**/api/alerts/watch", async (route: Route) => {
    await gate;
    await route.fulfill({
      json: {
        status: "watching",
        watch: {
          termId: "202701",
          sectionKey: "CMSC351-0101",
          createdAt: new Date().toISOString(),
          lastNotifiedAt: null,
        },
      },
    });
  });
  await page.goto("/schedule");
  const signedIn = await page.evaluate(async () => {
    const id = `e2e${Math.random().toString(36).slice(2, 12)}`;
    const response = await fetch("/api/auth/test-sign-in", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: id, return: "/schedule" }),
    });
    return ((await response.json()) as { status: string }).status;
  });
  expect(signedIn).toBe("signed-in");
  await page.evaluate(() =>
    sessionStorage.setItem(
      "terpsicle:pending-watch",
      JSON.stringify({
        termId: "202701",
        sectionKey: "CMSC351-0101",
        at: new Date().toISOString(),
      }),
    ),
  );
  await page.reload();
}

/** A new tab with its own watch to start (cookies are the context's). */
async function watchesAnotherSeat(page: Page) {
  await page.route("**/api/alerts/list", (route: Route) =>
    route.fulfill({ json: { status: "ok", watches: [] } }),
  );
  await page.route("**/api/alerts/watch", (route: Route) =>
    route.fulfill({
      json: {
        status: "watching",
        watch: {
          termId: "202701",
          sectionKey: "CMSC351-0101",
          createdAt: new Date().toISOString(),
          lastNotifiedAt: null,
        },
      },
    }),
  );
  await page.goto("/schedule");
  await page.evaluate(() =>
    sessionStorage.setItem(
      "terpsicle:pending-watch",
      JSON.stringify({
        termId: "202701",
        sectionKey: "CMSC351-0101",
        at: new Date().toISOString(),
      }),
    ),
  );
  await page.reload();
}

const watchingToast = (page: Page) => page.getByText("Watching CMSC351 0101");

/** Chrome's `beforeinstallprompt`, recording whether our dialog replays it. */
async function browserOffersInstall(page: Page) {
  await page.evaluate(() => {
    const event = new Event("beforeinstallprompt", { cancelable: true });
    Object.assign(event, {
      prompt: async () => {
        document.documentElement.dataset.installPrompted = "yes";
      },
      userChoice: Promise.resolve({ outcome: "dismissed" }),
    });
    window.dispatchEvent(event);
  });
}

const iphoneSetup = (page: Page) =>
  page.getByRole("dialog", { name: "Get notifications on your iPhone" });

const installDialog = (page: Page) =>
  page.getByRole("dialog", { name: "Put Terpsicle on your home screen" });

test.describe("installable app", () => {
  test("serves the manifest, its icons and the head tags", async ({
    page,
    request,
  }) => {
    const response = await request.get("/manifest.webmanifest");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain(
      "application/manifest+json",
    );
    const manifest = (await response.json()) as {
      icons: { src: string; sizes: string; purpose?: string }[];
    };
    // Built from the tokens by scripts/pwa-manifest.ts.
    expect(manifest).toMatchObject({
      id: "/",
      name: "Terpsicle",
      start_url: "/home",
      scope: "/",
      display: "standalone",
      theme_color: expect.stringMatching(/^#/),
    });
    expect(manifest.icons.map((icon) => icon.src)).toEqual([
      "/icons/icon-192.png",
      "/icons/icon-512.png",
      "/icons/icon-maskable-512.png",
    ]);
    for (const src of [
      ...manifest.icons.map((icon) => icon.src),
      "/icons/apple-touch-icon.png",
      "/icons/badge-72.png",
    ]) {
      const icon = await request.get(src);
      expect(icon.status(), src).toBe(200);
      expect(icon.headers()["content-type"], src).toBe("image/png");
    }

    // The installed app opens on Home, and apps installed before it came
    // still open on the scheduler: both must be pages, not a 404.
    for (const path of ["/home", "/schedule"]) {
      const start = await request.get(path);
      expect(start.status(), path).toBe(200);
      expect(start.headers()["content-type"], path).toContain("text/html");
    }

    // Every page links the manifest, the landing page included (V2 §3.1).
    await page.goto("/");
    const head = page.locator("head");
    await expect(head.locator('link[rel="manifest"]')).toHaveAttribute(
      "href",
      "/manifest.webmanifest",
    );
    await expect(head.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
      "href",
      "/icons/apple-touch-icon.png",
    );
    await expect(
      head.locator('meta[name="apple-mobile-web-app-capable"]'),
    ).toHaveAttribute("content", "yes");
    await expect(
      head.locator('meta[name="apple-mobile-web-app-title"]'),
    ).toHaveAttribute("content", "Terpsicle");
    await expect(
      head.locator('meta[name="apple-mobile-web-app-status-bar-style"]'),
    ).toHaveAttribute("content", "default");
    // One per system theme (the router's head tags would keep only one).
    expect(
      await head
        .locator('meta[name="theme-color"]')
        .evaluateAll((metas) => metas.map((m) => m.getAttribute("media"))),
    ).toEqual([
      "(prefers-color-scheme: light)",
      "(prefers-color-scheme: dark)",
    ]);
  });

  test("serves the service worker at the root, always revalidated", async ({
    request,
  }) => {
    const response = await request.get("/sw.js");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("text/javascript");
    expect(response.headers()["cache-control"]).toBe("no-cache");
    const script = await response.text();
    for (const handler of ['"push"', '"notificationclick"', '"fetch"'])
      expect(script).toContain(handler);
  });

  test("Chrome finds it installable (Lighthouse's installability check)", async ({
    browserName,
    isMobile,
    baseURL,
  }) => {
    test.skip(browserName !== "chromium" || isMobile, "Chrome, once");
    // Incognito windows can't install, and a test's context is one: use a
    // real profile.
    const profile = mkdtempSync(path.join(tmpdir(), "terpsicle-pwa-"));
    let context: BrowserContext | undefined;
    try {
      context = await chromium.launchPersistentContext(profile, {
        executablePath: test.info().project.use.launchOptions?.executablePath,
      });
      const page = context.pages()[0] ?? (await context.newPage());
      await page.goto(baseURL ?? "/");
      const cdp = await context.newCDPSession(page);
      await expect
        .poll(async () => (await cdp.send("Page.getAppManifest")).url)
        .toContain("/manifest.webmanifest");
      const manifest = await cdp.send("Page.getAppManifest");
      expect(manifest.errors).toEqual([]);
      const { installabilityErrors } = await cdp.send(
        "Page.getInstallabilityErrors",
      );
      expect(installabilityErrors).toEqual([]);
    } finally {
      await context?.close();
      rmSync(profile, { recursive: true, force: true });
    }
  });
});

test.describe("install prompt", () => {
  test.describe("on iPhone", () => {
    test.use({ userAgent: IPHONE_SAFARI });

    // V2 §6.7: on an iPhone tab, a seat watch's ask is the three steps to
    // the Home Screen, which are the install prompt's steps too.
    test("shows the steps once when a seat watch turns on, then never again", async ({
      page,
      context,
    }) => {
      await watchesASeat(page);
      await expect(watchingToast(page)).toBeVisible({ timeout: 15_000 });
      const sheet = iphoneSetup(page);
      await expect(sheet).toBeVisible();
      await expect(sheet).toContainText(
        "iPhone only sends notifications to apps on your Home Screen.",
      );
      await expect(sheet).toContainText("Tap Share in Safari's bar");
      await expect(sheet).toContainText("Choose Add to Home Screen");
      await expect(sheet).toContainText(
        "Open Terpsicle from your Home Screen. We'll ask once, right there.",
      );
      for (const colorScheme of ["light", "dark"] as const) {
        await page.emulateMedia({ colorScheme });
        await scan(page, `the iPhone setup sheet (${colorScheme})`);
      }
      await page.emulateMedia({ colorScheme: "light" });
      await sheet.getByRole("button", { name: "Got it" }).click();
      await expect(sheet).toBeHidden();

      // The same tab, and then a new one: neither the sheet nor the install
      // dialog again.
      for (const next of [page, await context.newPage()]) {
        await watchesAnotherSeat(next);
        await expect(watchingToast(next)).toBeVisible({ timeout: 15_000 });
        // The sheet's code loads lazily: give it time to show if it would.
        await next.waitForTimeout(1000);
        await expect(iphoneSetup(next)).toHaveCount(0);
        await expect(installDialog(next)).toHaveCount(0);
      }
    });

    test("shows the install dialog's steps at a sign-in's first on this device", async ({
      page,
    }) => {
      await page.goto(`/auth/test?return=${encodeURIComponent("/schedule")}`);
      await page
        .getByRole("button", { name: "Sign in as Test Student" })
        .click();
      const dialog = installDialog(page);
      await expect(dialog).toBeVisible({ timeout: 15_000 });
      await expect(dialog).toContainText(
        "Open it from your home screen, like an app",
      );
      await expect(dialog).toContainText("Tap Add to Home Screen");
      await dialog.getByRole("button", { name: "Got it" }).click();
      await expect(dialog).toBeHidden();
    });
  });

  test("replays Chrome's own prompt from the dialog", async ({ page }) => {
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await watchesASeat(page, gate);
    await browserOffersInstall(page);
    release();

    const dialog = installDialog(page);
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(
      "Get notified when a seat opens or a classmate replies",
    );
    await dialog.getByRole("button", { name: "Install" }).click();
    await expect(page.locator("html")).toHaveAttribute(
      "data-install-prompted",
      "yes",
    );
    // Declined in Chrome's prompt: the dialog closes with it.
    await expect(dialog).toBeHidden();
  });

  test("the app always offers Install app where installing works", async ({
    page,
    isMobile,
  }) => {
    await page.goto("/schedule");
    await expect(page.getByRole("img", { name: "Terpsicle" })).toBeVisible();
    // Phones: the drawer is a lazy chunk. Opened before it mounts, a menu
    // sits under the drawer's layer, which takes Esc, so the menu stays open
    // and the second press of "Sign in" below closes it instead.
    if (isMobile)
      await expect(page.locator("[data-workbench-drawer]")).toBeVisible();
    const entry = isMobile
      ? page.getByRole("menuitem", { name: "Install app" })
      : page.getByRole("button", { name: "Install app" });
    // Phones have one menu for the account and the theme: signed out (with
    // sign-in on, as in mock mode) its button is "Sign in". Desktop has the
    // icon at the foot of the rail.
    const openMenu = async () => {
      if (isMobile) await page.getByRole("button", { name: "Sign in" }).click();
    };

    // Chrome hasn't offered to install: nothing to show.
    await openMenu();
    await expect(entry).toHaveCount(0);
    if (isMobile) await page.keyboard.press("Escape");

    await browserOffersInstall(page);
    await openMenu();
    await entry.click();
    const dialog = installDialog(page);
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Not now" }).click();
    await expect(dialog).toBeHidden();
  });
});
