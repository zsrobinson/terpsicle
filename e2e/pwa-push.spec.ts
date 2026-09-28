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

// V2.md §6.7: one notification per tag, rewritten with its count; a click
// reads its inbox item from the service worker, with the session cookie.
test("groups pushes under one tag, and a click reads it signed in", async ({
  page,
  context,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "pushes are delivered over CDP");
  await page.goto(`/auth/test?return=${encodeURIComponent("/schedule")}`);
  await page.getByRole("button", { name: "Sign in as Test Student" }).click();
  await page.waitForURL((url) => url.pathname.startsWith("/schedule"));
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
  // What the service worker tells open pages once a click has read.
  await page.evaluate(() => {
    const heard: unknown[] = [];
    Object.assign(window, { heard });
    navigator.serviceWorker.addEventListener("message", (event) =>
      heard.push(event.data),
    );
  });

  await context.grantPermissions(["notifications"]);
  const cdp = await context.newCDPSession(page);
  const registrations = new Promise<string>((resolve) => {
    cdp.on("ServiceWorker.workerRegistrationUpdated", ({ registrations }) => {
      const ours = registrations.find((r) => r.scopeURL.endsWith("/"));
      if (ours) resolve(ours.registrationId);
    });
  });
  await cdp.send("ServiceWorker.enable");
  const registrationId = await registrations;
  const tag = `chat-mention:e2e-${test.info().project.name}`;
  const deliver = (payload: object) =>
    cdp.send("ServiceWorker.deliverPushMessage", {
      origin: new URL(page.url()).origin,
      registrationId,
      data: JSON.stringify({
        v: 1,
        type: "chat-mention",
        url: "/schedule",
        tag,
        ...payload,
      }),
    });
  const showing = () =>
    page.evaluate(async (tag) => {
      const registration = await navigator.serviceWorker.ready;
      return (await registration.getNotifications({ tag })).map((n) => [
        n.title,
        n.body,
      ]);
    }, tag);

  await deliver({
    title: "Maya in CMSC351",
    body: "are we meeting at 7?",
    count: 1,
    badge: 1,
    renotify: true,
    id: "e2e-no-such-row-1",
  });
  await expect
    .poll(showing)
    .toEqual([["Maya in CMSC351", "are we meeting at 7?"]]);
  await deliver({
    title: "2 mentions in CMSC351",
    body: "Maya: also bring the notes",
    count: 2,
    badge: 1,
    renotify: false,
    id: "e2e-no-such-row-2",
  });
  await expect
    .poll(showing)
    .toEqual([["2 mentions in CMSC351", "Maya: also bring the notes"]]);

  // Playwright can't click a system notification, so the test hands the
  // service worker the click event the browser would. The worker's own
  // fetch carries the session: a 401 would mean no message comes back.
  const [worker] = context.serviceWorkers();
  expect(worker).toBeDefined();
  await worker?.evaluate(async (tag) => {
    const scope = globalThis as unknown as {
      registration: {
        getNotifications(f: { tag: string }): Promise<unknown[]>;
      };
      dispatchEvent(event: Event): boolean;
    };
    const Click = (
      globalThis as unknown as {
        NotificationEvent: new (
          type: string,
          init: { notification: unknown },
        ) => Event;
      }
    ).NotificationEvent;
    const [notification] = await scope.registration.getNotifications({ tag });
    try {
      scope.dispatchEvent(new Click("notificationclick", { notification }));
    } catch {
      // A made-up event can't extend its lifetime; its work still runs.
    }
  }, tag);
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { heard: unknown[] }).heard),
    )
    .toEqual([{ type: "notifications-read", unread: expect.any(Number) }]);
  await expect.poll(showing).toEqual([]);
});
