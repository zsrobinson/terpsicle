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

// The installable app on `pnpm dev:mock`: the manifest, icons and head tags,
// /sw.js and what it does once registered, Chrome's own installability
// check (what Lighthouse reports), and the install prompt: offered once when
// a seat alert turns on, never again after it's closed.

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";
const TOKEN = "t".repeat(43);

let errors: string[] = [];
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
});
test.afterEach(() => {
  expect(errors).toEqual([]);
});

/** The confirm link's API call, answered "confirmed" (after `gate`, if given). */
async function confirmsAlert(page: Page, gate?: Promise<void>) {
  await page.route("**/api/alerts/confirm", async (route: Route) => {
    await gate;
    await route.fulfill({
      json: {
        status: "confirmed",
        termId: "202701",
        sectionKey: "CMSC131-0101",
        subscriptionId: "s".repeat(22),
        manageToken: "m".repeat(43),
      },
    });
  });
}

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
      start_url: "/schedule",
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
      "/apple-touch-icon.png",
      "/icons/badge-72.png",
    ]) {
      const icon = await request.get(src);
      expect(icon.status(), src).toBe(200);
      expect(icon.headers()["content-type"], src).toBe("image/png");
    }

    await page.goto("/");
    const head = page.locator("head");
    await expect(head.locator('link[rel="manifest"]')).toHaveAttribute(
      "href",
      "/manifest.webmanifest",
    );
    await expect(head.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
      "href",
      "/apple-touch-icon.png",
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

    test("shows the steps once when a seat alert turns on, then never again", async ({
      page,
      context,
    }) => {
      await confirmsAlert(page);
      await page.goto(`/alerts/confirm?token=${TOKEN}`);
      await expect(
        page.getByRole("heading", { name: "Watching" }),
      ).toBeVisible();
      const dialog = installDialog(page);
      await expect(dialog).toBeVisible();
      await expect(dialog).toContainText(
        "Open it from your home screen, like an app",
      );
      await expect(dialog).toContainText("Tap Add to Home Screen");
      await dialog.getByRole("button", { name: "Got it" }).click();
      await expect(dialog).toBeHidden();

      // The same tab, and then a new one: not again.
      for (const next of [page, await context.newPage()]) {
        await confirmsAlert(next);
        await next.goto(`/alerts/confirm?token=${TOKEN}`);
        await expect(
          next.getByRole("heading", { name: "Watching" }),
        ).toBeVisible();
        // The dialog's code loads lazily: give it time to show if it would.
        await next.waitForTimeout(1000);
        await expect(installDialog(next)).toHaveCount(0);
      }
    });
  });

  test("replays Chrome's own prompt from the dialog", async ({ page }) => {
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await confirmsAlert(page, gate);
    await page.goto(`/alerts/confirm?token=${TOKEN}`);
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
    await page.goto("/");
    await expect(page.getByRole("img", { name: "Terpsicle" })).toBeVisible();
    const entry = isMobile
      ? page.getByRole("menuitem", { name: "Install app" })
      : page.getByRole("button", { name: "Install app" });
    const openMenu = async () => {
      if (isMobile) await page.getByRole("button", { name: "Theme" }).click();
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
