import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { expect, type Page, type TestInfo, test } from "@playwright/test";
import {
  decryptPushPayload,
  exportPublicKey,
  generateKeyPair,
  toBase64url,
} from "../src/core/push";
import { payloadOf } from "./push-message";

// Chat mentions end to end on `pnpm dev:mock` (V2.md §6.1): tclassmate has a
// device with notifications on and isn't looking at the course's chat;
// tstudent types "@Test C", picks them from the composer's list and sends.
// Once the message is checked, the CourseChat object pushes to their
// device. The device is a key pair this test makes, and its push service a
// local server that decrypts what the Worker sends (push-settings.spec.ts
// has the same two stand-ins).

const TERM = "202701";

/**
 * Each project gets its own course, and not chat.spec.ts's: someone
 * connected to a course's chat gets no push for it, and chat.spec.ts may
 * have tclassmate in its rooms at the same time.
 */
const courseFor = (info: TestInfo) =>
  info.project.name === "mobile" ? "CMSC250" : "CMSC216";

let errors: string[] = [];
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
});
test.afterEach(() => {
  expect(errors).toEqual([]);
});

async function startPushService() {
  const received: { path: string; body: Buffer }[] = [];
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      received.push({ path: request.url ?? "", body: Buffer.concat(chunks) });
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

async function signIn(page: Page, name: string, path: string) {
  await page.goto(`/auth/test?return=${encodeURIComponent(path)}`);
  await page.getByRole("button", { name: `Sign in as ${name}` }).click();
  await page.waitForURL((url) =>
    url.pathname.startsWith(path.split("?")[0] ?? path),
  );
}

const sameOrigin = (page: Page) => ({
  Origin: new URL(page.url()).origin,
  "Sec-Fetch-Site": "same-origin",
});

/** A plan with the course's section 0101, as the sync engine would save it. */
async function syncPlan(page: Page, who: string, course: string) {
  const now = new Date().toISOString();
  const id = `plan_e2e_notify_${who}_${Date.now().toString(36)}`;
  const response = await page.request.post("/api/sync/push", {
    headers: sameOrigin(page),
    data: {
      docs: [
        {
          kind: "plan",
          id,
          baseRev: 0,
          body: {
            id,
            termId: TERM,
            name: "Plan A",
            order: -Date.now(),
            createdAt: now,
            updatedAt: now,
            courses: [
              {
                courseCode: course,
                sectionCode: "0101",
                snapshot: { instructors: [], delivery: "f2f", meetings: [] },
              },
            ],
          },
        },
      ],
    },
  });
  expect(response.status()).toBe(200);
}

test("an @-mention pushes to the classmate it names", async ({
  page,
  browser,
}, info) => {
  // Two people, a live socket, moderation and a push: longer than most.
  test.slow();
  const course = courseFor(info);
  const room = `${TERM}:${course}`;
  const service = await startPushService();
  const { viewport, baseURL } = info.project.use;
  const classmate = await browser.newContext({
    ...(viewport ? { viewport } : {}),
    ...(baseURL ? { baseURL } : {}),
  });
  try {
    // tclassmate: in the course, with one device that has notifications on.
    const theirs = await classmate.newPage();
    await signIn(theirs, "Test Classmate", "/settings");
    await syncPlan(theirs, "tclassmate", course);
    const pair = await generateKeyPair("ECDH", true);
    const uaPublic = await exportPublicKey(pair.publicKey);
    const authSecret = crypto.getRandomValues(new Uint8Array(16));
    const path = `/push/${Math.random().toString(36).slice(2)}`;
    const subscribed = await theirs.request.post("/api/push/subscribe", {
      headers: sameOrigin(theirs),
      data: {
        endpoint: `${service.origin}${path}`,
        keys: { p256dh: toBase64url(uaPublic), auth: toBase64url(authSecret) },
        label: "E2E · Chrome",
      },
    });
    expect(await subscribed.json()).toEqual({ status: "ok" });
    // Earlier runs' mentions in this course, read, so this run's group
    // starts at one (each project has its own course, so its own group).
    const inbox = await theirs.request.post("/api/notifications/inbox", {
      headers: sameOrigin(theirs),
      data: {},
    });
    const earlier = (
      (await inbox.json()) as { items: { id: string; url: string }[] }
    ).items
      .filter((i) => i.url.includes(`course=${course}`))
      .map((i) => i.id);
    if (earlier.length > 0)
      await theirs.request.post("/api/notifications/read", {
        headers: sameOrigin(theirs),
        data: { ids: earlier },
      });
    await classmate.close();

    // tstudent mentions them from the course room, with the autocomplete.
    await signIn(page, "Test Student", "/chat");
    await syncPlan(page, "tstudent", course);
    await page.goto(`/chat?term=${TERM}&course=${course}&room=${room}`);
    await expect(page.getByRole("log", { name: "Messages" })).toBeVisible();
    const gotIt = page.getByRole("button", { name: "Got it" });
    if (await gotIt.isVisible()) await gotIt.click();
    const tag = `${info.project.name}-${Date.now().toString(36)}`;
    const field = page.getByRole("textbox", { name: /^Message/ });
    await field.pressSequentially("@Test C", { delay: 20 });
    await page
      .getByRole("listbox", { name: "Mention someone in this room" })
      .getByRole("option", { name: "Test Classmate" })
      .click();
    await expect(field).toHaveValue("@Test Classmate ");
    await field.pressSequentially(`are you coming? ${tag}`);
    await field.press("Enter");

    // The push, decrypted with the device's key: who, where, and the room.
    const payload = async (words: string) => {
      for (const d of service.received.filter((r) => r.path === path)) {
        const plain = await decryptPushPayload({
          body: new Uint8Array(d.body),
          uaPrivate: pair.privateKey,
          uaPublic,
          authSecret,
        });
        const data = plain
          ? payloadOf(JSON.parse(new TextDecoder().decode(plain)))
          : null;
        if (data?.body?.includes(words)) return data;
      }
      return null;
    };
    const url = `/chat?term=${TERM}&course=${course}&room=${encodeURIComponent(room)}`;
    await expect.poll(() => payload(tag), { timeout: 15_000 }).not.toBeNull();
    expect(await payload(tag)).toEqual({
      v: 1,
      type: "chat-mention",
      title: `Test Student in ${course}`,
      body: `@Test Classmate are you coming? ${tag}`,
      url,
      tag: `chat-mention:${room}`,
      count: 1,
      badge: expect.any(Number),
      renotify: true,
      id: expect.any(String),
    });

    // A second mention updates the same tag with a count, without buzzing
    // again (same person), rather than stacking another notification.
    // Mentions come from the text, so typing the name in full is enough.
    const again = `${tag}-again`;
    await field.fill(`@Test Classmate also bring the notes ${again}`);
    await field.press("Enter");
    await expect.poll(() => payload(again), { timeout: 15_000 }).not.toBeNull();
    expect(await payload(again)).toEqual({
      v: 1,
      type: "chat-mention",
      title: `2 mentions in ${course}`,
      body: `Test Student: @Test Classmate also bring the notes ${again}`,
      url,
      tag: `chat-mention:${room}`,
      count: 2,
      badge: expect.any(Number),
      renotify: false,
      id: expect.any(String),
    });
  } finally {
    await classmate.close().catch(() => {});
    await service.close();
  }
});
