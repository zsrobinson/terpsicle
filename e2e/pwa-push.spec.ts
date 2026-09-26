import { expect, test } from "@playwright/test";

// The service worker on `pnpm dev:mock`: it takes over the page and shows a
// web push (V2.md §3.2), delivered over CDP as a push service would.
//
// Full Chromium, not Playwright's default headless binary
// (chromium-headless-shell, what CI runs): the shell has no notifications.
// Permission stays "denied" even when granted, so showNotification throws.
// `channel` forces its own worker, so it lives in a file of its own.
test.use({ channel: "chromium" });

let errors: string[] = [];
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
});
test.afterEach(() => {
  expect(errors).toEqual([]);
});

test("the service worker takes over and shows pushes", async ({
  page,
  context,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "pushes are delivered over CDP");
  await page.goto("/schedule");
  // The app registers it only on terpsicle.com (or with VITE_SW_DEV=1);
  // here the test does, as the app would.
  await page.evaluate(async () => {
    await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect
    .poll(() =>
      page.evaluate(() => navigator.serviceWorker.controller !== null),
    )
    .toBe(true);

  await context.grantPermissions(["notifications"]);
  const cdp = await context.newCDPSession(page);
  const registrations = new Promise<string>((resolve) => {
    cdp.on("ServiceWorker.workerRegistrationUpdated", ({ registrations }) => {
      const ours = registrations.find((r) => r.scopeURL.endsWith("/"));
      if (ours) resolve(ours.registrationId);
    });
  });
  await cdp.send("ServiceWorker.enable");
  await cdp.send("ServiceWorker.deliverPushMessage", {
    origin: new URL(page.url()).origin,
    registrationId: await registrations,
    data: JSON.stringify({
      v: 1,
      type: "seat-open",
      title: "CMSC131 0101 has a seat",
      body: "Register on Testudo before it's gone.",
      url: "/schedule",
      tag: "seat",
    }),
  });
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const registration = await navigator.serviceWorker.ready;
        return (await registration.getNotifications()).map((n) => [
          n.title,
          n.tag,
        ]);
      }),
    )
    .toEqual([["CMSC131 0101 has a seat", "seat"]]);
});
