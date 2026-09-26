import { createServer, type IncomingHttpHeaders } from "node:http";
import type { AddressInfo } from "node:net";
import { expect, type Page, test } from "@playwright/test";
import {
  decryptPushPayload,
  exportPublicKey,
  generateKeyPair,
  toBase64url,
  verifyVapidJwt,
} from "../src/core/push";
import { deviceLabel } from "../src/core/pwa/device-label";
import { scan } from "./axe";

// Notifications in /settings on `pnpm dev:mock` (V2.md §6), signed in as
// tstudent in test mode: turn them on here, "Send me a test", see it arrive,
// then remove the device. Everything on our side is the real code: the
// settings page, POST /api/push/*, VAPID signing and RFC 8291 encryption in
// the Worker. Two stand-ins: the browser's push subscription (Chromium's
// needs Google's push service) is a fixed key pair from this test, and the
// push service is a local server that decrypts what the Worker sends with
// that key and hands it to the service worker over CDP, as FCM would.
//
// Full Chromium, as in pwa-push.spec.ts: the headless shell has no
// notifications.
test.use({ channel: "chromium" });

let errors: string[] = [];
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
});
test.afterEach(() => {
  expect(errors).toEqual([]);
});

interface Delivery {
  path: string;
  headers: IncomingHttpHeaders;
  body: Buffer;
}

/** A push service on this machine: answers 201 and keeps what it got. */
async function startPushService() {
  const received: Delivery[] = [];
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      received.push({
        path: request.url ?? "",
        headers: request.headers,
        body: Buffer.concat(chunks),
      });
      response.writeHead(201).end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    received,
    origin: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

/** The key pair and secret a browser would make for its subscription. */
async function aSubscription(endpoint: string) {
  const pair = await generateKeyPair("ECDH", true);
  const uaPublic = await exportPublicKey(pair.publicKey);
  const authSecret = crypto.getRandomValues(new Uint8Array(16));
  return {
    endpoint,
    p256dh: toBase64url(uaPublic),
    auth: toBase64url(authSecret),
    read: async (body: Uint8Array) => {
      const plain = await decryptPushPayload({
        body,
        uaPrivate: pair.privateKey,
        uaPublic,
        authSecret,
      });
      return plain ? new TextDecoder().decode(plain) : null;
    },
  };
}

/**
 * Makes this page's PushManager hand out `subscription`, remembering in
 * sessionStorage whether it's subscribed and with which key.
 */
async function fakePushManager(
  page: Page,
  subscription: { endpoint: string; p256dh: string; auth: string },
) {
  await page.addInitScript((sub) => {
    const KEY = "e2e:push-subscription";
    const make = (serverKey: number[]) => ({
      endpoint: sub.endpoint,
      expirationTime: null,
      options: {
        userVisibleOnly: true,
        applicationServerKey: new Uint8Array(serverKey).buffer,
      },
      toJSON: () => ({
        endpoint: sub.endpoint,
        expirationTime: null,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      }),
      unsubscribe: async () => {
        sessionStorage.removeItem(KEY);
        return true;
      },
    });
    PushManager.prototype.subscribe = async (options) => {
      const key = options?.applicationServerKey;
      const bytes =
        key instanceof ArrayBuffer
          ? new Uint8Array(key)
          : ArrayBuffer.isView(key)
            ? new Uint8Array(key.buffer, key.byteOffset, key.byteLength)
            : new Uint8Array();
      sessionStorage.setItem(KEY, JSON.stringify([...bytes]));
      return make([...bytes]) as unknown as PushSubscription;
    };
    PushManager.prototype.getSubscription = async () => {
      const saved = sessionStorage.getItem(KEY);
      return saved
        ? (make(JSON.parse(saved)) as unknown as PushSubscription)
        : null;
    };
  }, subscription);
}

/** Test sign-in as tstudent, as /auth/test's button does it. */
async function signIn(page: Page) {
  const next = await page.evaluate(async () => {
    const response = await fetch("/api/auth/test-sign-in", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: "tstudent", return: "/settings" }),
    });
    const result: { return?: string } = await response.json();
    return result.return ?? "";
  });
  expect(next).toContain("/settings");
}

test("turn on notifications, send a test, see it, remove the device", async ({
  page,
  context,
}) => {
  const service = await startPushService();
  try {
    const id = Math.random().toString(36).slice(2);
    const subscription = await aSubscription(`${service.origin}/push/${id}`);
    await fakePushManager(page, subscription);

    await page.goto("/settings");
    // The app registers the service worker only on terpsicle.com (or with
    // VITE_SW_DEV=1); here the test does, as the app would.
    await page.evaluate(async () => {
      await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
    });
    await signIn(page);
    await page.goto("/settings#notifications");
    // "Windows · Chrome" under Playwright's desktop Chrome.
    const label = deviceLabel(
      await page.evaluate(() => navigator.userAgent),
      await page.evaluate(() => navigator.maxTouchPoints),
    );

    const section = page.getByRole("region", { name: "Notifications" });
    await expect(section.getByText("What to send")).toBeVisible();
    // Types stay quiet until their features send.
    const seatPush = section.getByRole("switch", {
      name: "Seat openings: Notification",
    });
    await expect(seatPush).toHaveAttribute("aria-disabled", "true");
    await expect(
      section.getByText("Notifications are off here."),
    ).toBeVisible();

    await context.grantPermissions(["notifications"]);
    await section
      .getByRole("button", { name: "Turn on notifications on this device" })
      .click();
    await expect(section.getByText("Notifications are on here.")).toBeVisible();
    const thisDevice = section
      .getByRole("listitem")
      .filter({ hasText: "This device" });
    await expect(thisDevice).toContainText(label);
    for (const scheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await scan(page, `settings with notifications on (${scheme})`);
    }

    await section.getByRole("button", { name: "Send me a test" }).click();
    await expect(section.getByRole("status")).toHaveText(
      /^Sent to \d+ devices?\. It should show up in a few seconds\.$/,
    );

    // The Worker's request, as the push service saw it.
    const delivery = service.received.find((d) => d.path === `/push/${id}`);
    if (!delivery) throw new Error("the push service got nothing");
    expect(delivery.headers["content-encoding"]).toBe("aes128gcm");
    expect(delivery.headers.urgency).toBe("high");
    const [, jwt, key] =
      /^vapid t=([^,]+), k=(.+)$/.exec(delivery.headers.authorization ?? "") ??
      [];
    expect(await verifyVapidJwt(jwt ?? "", key ?? "")).toMatchObject({
      aud: service.origin,
      sub: "mailto:alerts@terpsicle.com",
    });
    const data = await subscription.read(new Uint8Array(delivery.body));
    expect(JSON.parse(data ?? "null")).toEqual({
      v: 1,
      type: "test",
      title: "Notifications are on",
      body: `This is how Terpsicle reaches you on ${label}.`,
      url: "/settings#notifications",
      tag: "test",
    });

    // Handed to the service worker as the push service would, it shows.
    const cdp = await context.newCDPSession(page);
    const registrationId = new Promise<string>((resolve) => {
      cdp.on("ServiceWorker.workerRegistrationUpdated", ({ registrations }) => {
        const ours = registrations.find((r) => r.scopeURL.endsWith("/"));
        if (ours) resolve(ours.registrationId);
      });
    });
    await cdp.send("ServiceWorker.enable");
    await cdp.send("ServiceWorker.deliverPushMessage", {
      origin: new URL(page.url()).origin,
      registrationId: await registrationId,
      data: data ?? "",
    });
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const registration = await navigator.serviceWorker.ready;
          return (await registration.getNotifications({ tag: "test" })).map(
            (n) => n.title,
          );
        }),
      )
      .toEqual(["Notifications are on"]);

    // Remove it: gone at once, with Undo; the server hears when the toast goes.
    await thisDevice.getByRole("button", { name: "Remove" }).click();
    await expect(thisDevice).toHaveCount(0);
    await expect(page.getByText(`Removed ${label}`)).toBeVisible();
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(thisDevice).toHaveCount(1);
    await thisDevice.getByRole("button", { name: "Remove" }).click();
    await expect(page.getByText(`Removed ${label}`)).toBeHidden({
      timeout: 15_000,
    });
    await page.reload();
    await expect(
      page
        .getByRole("region", { name: "Notifications" })
        .getByText("Notifications are off here."),
    ).toBeVisible();
  } finally {
    await service.close();
  }
});
