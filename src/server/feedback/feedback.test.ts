// Feedback end to end through the real router, D1 and R2 (docs/FEEDBACK.md),
// signed in with test mode: `tadmin` is the admin, `tstudent` isn't.
import {
  createExecutionContext,
  waitOnExecutionContext,
} from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  FeedbackListResultSchema,
  FeedbackPinsResultSchema,
  FeedbackSendResultSchema,
  FeedbackUpdateResultSchema,
} from "~/core/schema/feedback";
import { type ApiEnv, handleApi, ROUTES } from "../api/router";
import { purgeAccounts } from "../auth/store";
import { createWorker, NOT_FOUND_PATH } from "../worker";
import { type FeedbackRow, pruneFeedback } from "./store";

const ORIGIN = "http://localhost:3000";
const START = Date.parse("2027-01-10T12:00:00.000Z");
let clock = START;
const now = () => new Date(clock);
const tick = (ms: number) => {
  clock += ms;
};

type Sent = { to: string; subject: string; text: string; from: unknown };
const sent: Sent[] = [];
const emailBinding = {
  send: vi.fn(async (message: Sent) => {
    sent.push(message);
    return { messageId: `msg-${sent.length}` };
  }),
} as unknown as SendEmail;

const apiEnv: ApiEnv = {
  ...env,
  SIGN_IN_ENABLED: "true",
  AUTH_TEST_MODE: "true",
  AUTH_SECRET: "test-auth-secret-0123456789abcdefghijklmnopq",
  EMAIL: emailBinding,
};

/** A real 1×1 PNG. */
const PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

type Who = "admin" | "student" | "nobody";
const cookies = new Map<Who, string>();

function request(
  path: string,
  body: unknown,
  options: { who?: Who; origin?: string; ip?: string } = {},
): Request {
  return new Request(`${ORIGIN}/api/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: options.origin ?? ORIGIN,
      "Sec-Fetch-Site":
        (options.origin ?? ORIGIN) === ORIGIN ? "same-origin" : "cross-site",
      Cookie: cookies.get(options.who ?? "nobody") ?? "",
      "CF-Connecting-IP": options.ip ?? "203.0.113.9",
    },
    body: JSON.stringify(body),
  });
}

const waits: Promise<unknown>[] = [];
async function call(
  path: string,
  body: unknown,
  options: { who?: Who; origin?: string; ip?: string } = {},
): Promise<Response> {
  const response = await handleApi(
    request(path, body, options),
    apiEnv,
    { waitUntil: (p) => void waits.push(p) },
    now(),
  );
  await Promise.all(waits.splice(0));
  return response;
}

async function signIn(who: Who, userId: string): Promise<void> {
  const response = await call("auth/test-sign-in", { userId });
  expect(response.status).toBe(200);
  cookies.set(
    who,
    response.headers
      .getSetCookie()
      .map((line) => line.split(";")[0])
      .join("; "),
  );
}

const bug = {
  kind: "bug",
  product: "schedule",
  path: "/schedule?plan=eyJzIjpbXX0&tab=search&q=secret",
  text: "The section didn't add.",
  expected: "It shows on the calendar.",
  screenshot: { type: "image/png", data: PNG },
  context: {
    version: "test",
    browser: "Chrome 141 · macOS",
    screen: { width: 1440, height: 900, dpr: 2 },
    viewport: { width: 1440, height: 800 },
    online: true,
    theme: "light",
    route: "/schedule?tab=search",
    actions: [
      {
        type: "request",
        at: 1,
        method: "POST",
        route: "sync/push",
        status: 503,
      },
    ],
    plan: null,
    settings: {},
  },
};

const pin = {
  product: "schedule",
  path: "/schedule?course=CMSC131&tab=search",
  text: "Too much padding here",
  element: {
    selector: "[data-course='CMSC131'] > button",
    text: "Add",
    ids: { "data-course": "CMSC131" },
    rect: { x: 10, y: 20, width: 30, height: 40 },
  },
  screenshot: { type: "image/png", data: PNG },
  elementShot: { type: "image/png", data: PNG },
  context: {
    version: "test",
    viewport: { width: 1440, height: 800 },
    theme: "dark",
  },
};

async function send(body: unknown = bug, who: Who = "nobody", ip?: string) {
  const response = await call("feedback/send", body, {
    who,
    ...(ip ? { ip } : {}),
  });
  expect(response.status).toBe(200);
  return FeedbackSendResultSchema.parse(await response.json());
}

const row = (id: string) =>
  env.DB.prepare("SELECT * FROM feedback WHERE id = ?1")
    .bind(id)
    .first<FeedbackRow>();

beforeEach(async () => {
  clock = START;
  sent.length = 0;
  await env.DB.exec(
    "DELETE FROM feedback; DELETE FROM feedback_groups; DELETE FROM counters; DELETE FROM sessions; DELETE FROM user_identities; DELETE FROM users;",
  );
  const stale = await env.USER_CONTENT.list({ prefix: "feedback/" });
  if (stale.objects.length > 0)
    await env.USER_CONTENT.delete(stale.objects.map((o) => o.key));
  await signIn("admin", "tadmin");
  await signIn("student", "tstudent");
});

describe("feedback/send", () => {
  it("stores a report with its screenshot, scrubbed, and who sent it only for a reply", async () => {
    const { id, undoToken } = await send({ ...bug, reply: true });
    expect(undoToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const stored = await row(id);
    expect(stored).toMatchObject({
      kind: "bug",
      product: "schedule",
      path: "/schedule?plan=shared&tab=search",
      text: "The section didn't add.",
      expected: "It shows on the calendar.",
      host: "localhost",
      status: "new",
      // Signed out: there's nobody to reply to.
      user_id: null,
    });
    expect(stored?.undo_hash).not.toContain(undoToken);
    expect(JSON.parse(stored?.context ?? "null")).toMatchObject({
      theme: "light",
    });
    const key = stored?.screenshot_key ?? "";
    expect(key).toBe(`feedback/2027-01/${id}.png`);
    const object = await env.USER_CONTENT.get(key);
    expect(object?.httpMetadata?.contentType).toBe("image/png");
    await object?.arrayBuffer();
  });

  it("keeps the sender only when they're signed in and ask for a reply", async () => {
    const replied = await send({ ...bug, reply: true }, "student");
    expect((await row(replied.id))?.user_id).toBe("tstudent");
    const quiet = await send(bug, "student");
    expect((await row(quiet.id))?.user_id).toBeNull();
  });

  it("stores nothing of the context when it's left out", async () => {
    const { context: _, screenshot: __, ...plain } = bug;
    const { id } = await send(plain);
    expect(await row(id)).toMatchObject({
      context: null,
      screenshot_key: null,
    });
  });

  it("refuses an image that isn't what it says, storing nothing", async () => {
    const svg = btoa("<svg xmlns='http://www.w3.org/2000/svg'><script/></svg>");
    const response = await call("feedback/send", {
      ...bug,
      screenshot: { type: "image/png", data: svg },
    });
    expect(response.status).toBe(400);
    expect(
      await env.DB.prepare("SELECT COUNT(*) AS n FROM feedback").first("n"),
    ).toBe(0);
    expect(
      (await env.USER_CONTENT.list({ prefix: "feedback/" })).objects,
    ).toHaveLength(0);
  });

  it("refuses another site's page", async () => {
    const response = await call("feedback/send", bug, {
      origin: "https://evil.example",
    });
    expect(response.status).toBe(403);
  });

  it("allows 12 an hour from one network", async () => {
    expect(ROUTES["feedback/send"]).toMatchObject({
      perIpPerHour: 12,
      perUserPerHour: 20,
    });
    for (let i = 0; i < 12; i++) await send(bug, "nobody", "198.51.100.1");
    const response = await call("feedback/send", bug, { ip: "198.51.100.1" });
    expect(response.status).toBe(429);
    // Another network is counted on its own.
    await send(bug, "nobody", "198.51.100.2");
  });
});

describe("feedback/send's limits and sessions", () => {
  it("allows 20 an hour per signed-in person, whatever the network", async () => {
    for (let i = 0; i < 20; i++) await send(bug, "student", `192.0.2.${i}`);
    const response = await call("feedback/send", bug, {
      who: "student",
      ip: "192.0.2.99",
    });
    expect(response.status).toBe(429);
  });

  it("takes feedback from someone whose session has gone, without a 401", async () => {
    cookies.set("nobody", "__Host-session=not-a-real-session");
    try {
      const { id } = await send({ ...bug, reply: true });
      expect((await row(id))?.user_id).toBeNull();
    } finally {
      cookies.delete("nobody");
    }
  });

  it("scrubs routes and redacts links in the context it stores", async () => {
    const { id } = await send({
      ...bug,
      context: {
        ...bug.context,
        route: "/schedule?plan=eyJzIjpbXX0",
        actions: [
          { type: "nav", at: 1, route: "/chat/202608/CMSC131/0101" },
          {
            type: "error",
            at: 2,
            name: "Error",
            message:
              "fetch https://umd.instructure.com/feeds/calendars/user_x.ics failed",
            stack: null,
          },
        ],
      },
    });
    const stored = JSON.parse((await row(id))?.context ?? "{}");
    expect(stored.route).toBe("/schedule?plan=shared");
    expect(stored.actions[0].route).toBe("/chat/:term/:course/:room");
    expect(stored.actions[1].message).toBe("fetch [link] failed");
  });
});

describe("feedback/undo", () => {
  it("removes the item and its screenshot within 10 minutes", async () => {
    const { id, undoToken } = await send();
    const key = (await row(id))?.screenshot_key ?? "";
    tick(9 * 60_000);
    const response = await call("feedback/undo", { id, undoToken });
    expect(await response.json()).toEqual({ status: "undone" });
    expect(await row(id)).toBeNull();
    expect(await env.USER_CONTENT.head(key)).toBeNull();
  });

  it("needs the sender's token, and only works for 10 minutes", async () => {
    const { id, undoToken } = await send();
    const other = await send();
    expect(
      await (
        await call("feedback/undo", { id, undoToken: other.undoToken })
      ).json(),
    ).toEqual({ status: "expired" });
    tick(10 * 60_000 + 1);
    expect(
      await (await call("feedback/undo", { id, undoToken })).json(),
    ).toEqual({
      status: "expired",
    });
    expect(await row(id)).not.toBeNull();
  });
});

describe("pinned notes", () => {
  it("are the admin's alone", async () => {
    expect((await call("feedback/pin", pin, { who: "student" })).status).toBe(
      403,
    );
    expect((await call("feedback/pin", pin)).status).toBe(401);
    expect(
      (
        await call(
          "feedback/pins",
          { pathname: "/schedule" },
          { who: "student" },
        )
      ).status,
    ).toBe(403);
  });

  it("keep the element, both screenshots and the page as it was", async () => {
    const response = await call("feedback/pin", pin, { who: "admin" });
    expect(response.status).toBe(200);
    const { id } = FeedbackSendResultSchema.parse(await response.json());
    const stored = await row(id);
    expect(stored).toMatchObject({
      kind: "review",
      path: "/schedule?course=CMSC131&tab=search",
      user_id: "tadmin",
      screenshot_key: `feedback/2027-01/${id}.png`,
      element_shot_key: `feedback/2027-01/${id}-element.png`,
    });
    expect(JSON.parse(stored?.element ?? "{}")).toEqual(pin.element);
  });

  it("list on their route, numbered in order", async () => {
    await call("feedback/pin", pin, { who: "admin" });
    tick(1_000);
    await call(
      "feedback/pin",
      { ...pin, path: "/schedule", text: "Second" },
      { who: "admin" },
    );
    await call("feedback/pin", { ...pin, path: "/reviews" }, { who: "admin" });
    await send({ ...bug, path: "/schedule" });
    tick(1_000);
    const spam = FeedbackSendResultSchema.parse(
      await (
        await call("feedback/pin", { ...pin, text: "Spam" }, { who: "admin" })
      ).json(),
    );
    await call(
      "admin/feedback/update",
      { id: spam.id, status: "spam" },
      { who: "admin" },
    );
    const response = await call(
      "feedback/pins",
      { pathname: "/schedule" },
      { who: "admin" },
    );
    const { pins } = FeedbackPinsResultSchema.parse(await response.json());
    expect(pins.map((p) => [p.number, p.text])).toEqual([
      [1, "Too much padding here"],
      [2, "Second"],
    ]);
  });
});

describe("the admin inbox", () => {
  const list = async (body: unknown = {}) => {
    const response = await call("admin/feedback/list", body, { who: "admin" });
    expect(response.status).toBe(200);
    return FeedbackListResultSchema.parse(await response.json());
  };

  it("is the admin's alone", async () => {
    expect(
      (await call("admin/feedback/list", {}, { who: "student" })).status,
    ).toBe(403);
  });

  it("lists newest first with filters, saying whether to reply but never to whom", async () => {
    const a = await send({ ...bug, reply: true }, "student");
    tick(1_000);
    const { expected: _, ...idea } = bug;
    const b = await send({ ...idea, kind: "idea", product: "reviews" });
    tick(1_000);
    await call("feedback/pin", pin, { who: "admin" });
    const all = await list();
    expect(all.items.map((i) => i.kind)).toEqual(["review", "idea", "bug"]);
    expect(all.newCount).toBe(3);
    expect(all.hosts).toEqual(["localhost"]);
    expect(all.items.find((i) => i.id === a.id)).toMatchObject({
      reply: true,
      hasScreenshot: true,
    });
    expect(all.items.find((i) => i.kind === "review")).toMatchObject({
      reply: false,
      hasElementShot: true,
    });
    expect(JSON.stringify(all)).not.toContain("tstudent");
    expect(JSON.stringify(all)).not.toContain("tadmin");
    expect((await list({ product: "reviews" })).items.map((i) => i.id)).toEqual(
      [b.id],
    );
    expect((await list({ kind: "bug" })).items.map((i) => i.id)).toEqual([
      a.id,
    ]);
  });

  it("pages with a cursor", async () => {
    for (let i = 0; i < 3; i++) {
      await send();
      tick(1_000);
    }
    const first = await list({ limit: 2 });
    expect(first.items).toHaveLength(2);
    const second = await list({ limit: 2, cursor: first.cursor });
    expect(second.items).toHaveLength(1);
    expect(second.cursor).toBeNull();
  });

  it("marks Fixed, emailing a reply once, and reopens", async () => {
    const { id } = await send({ ...bug, reply: true }, "student");
    const update = async (body: object) =>
      FeedbackUpdateResultSchema.parse(
        await (
          await call("admin/feedback/update", { id, ...body }, { who: "admin" })
        ).json(),
      );
    const fixed = await update({ status: "fixed", note: "Fixed in #99" });
    expect(fixed).toMatchObject({
      status: "updated",
      emailed: true,
      item: {
        status: "fixed",
        note: "Fixed in #99",
        closedAt: now().toISOString(),
      },
    });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      to: "tstudent@terpmail.umd.edu",
      subject: "We fixed the bug you told us about",
      from: { email: "alerts@terpsicle.com", name: "Terpsicle" },
    });
    expect(sent[0]?.text).toContain("The section didn't add.");
    const reopened = await update({ status: "new" });
    expect(reopened).toMatchObject({ item: { status: "new", closedAt: null } });
    await update({ status: "fixed" });
    expect(sent).toHaveLength(1);
  });

  it("words the email for an idea", async () => {
    const { expected: _, ...idea } = bug;
    const { id } = await send(
      { ...idea, kind: "idea", reply: true },
      "student",
    );
    await call(
      "admin/feedback/update",
      { id, status: "fixed" },
      { who: "admin" },
    );
    expect(sent[0]?.subject).toBe("Your idea is in Terpsicle");
  });

  it("never emails from a preview, or someone deleting their account", async () => {
    const preview = await send({ ...bug, reply: true }, "student");
    const withoutEmail: ApiEnv = { ...apiEnv, EMAIL: undefined };
    const response = await handleApi(
      request(
        "admin/feedback/update",
        { id: preview.id, status: "fixed" },
        { who: "admin" },
      ),
      withoutEmail,
      { waitUntil: () => undefined },
      now(),
    );
    expect(await response.json()).toMatchObject({ emailed: false });
    const leaving = await send({ ...bug, reply: true }, "student");
    await call("account/delete", {}, { who: "student" });
    const marked = await call(
      "admin/feedback/update",
      { id: leaving.id, status: "fixed" },
      { who: "admin" },
    );
    expect(await marked.json()).toMatchObject({ emailed: false });
    expect(sent).toHaveLength(0);
  });

  it("doesn't email someone who didn't ask", async () => {
    const { id } = await send(bug, "student");
    const response = await call(
      "admin/feedback/update",
      { id, status: "fixed" },
      { who: "admin" },
    );
    expect(await response.json()).toMatchObject({ emailed: false });
    expect(sent).toHaveLength(0);
  });

  it("deletes softly for 10 seconds, then for good", async () => {
    const { id } = await send();
    const del = (restore = false) =>
      call("admin/feedback/delete", { id, restore }, { who: "admin" }).then(
        (r) => r.json(),
      );
    expect(await del()).toEqual({ status: "deleted" });
    expect((await list()).items).toHaveLength(0);
    expect(await del(true)).toEqual({ status: "restored" });
    expect((await list()).items).toHaveLength(1);
    await del();
    tick(10_001);
    expect(await del(true)).toEqual({ status: "gone" });
    // The next delete clears it out, screenshot too.
    const other = await send();
    await call("admin/feedback/delete", { id: other.id }, { who: "admin" });
    expect(await row(id)).toBeNull();
    expect(
      (await env.USER_CONTENT.list({ prefix: `feedback/2027-01/${id}` }))
        .objects,
    ).toHaveLength(0);
  });
});

describe("screenshots", () => {
  const worker = createWorker({
    fetch: async (r: Request) =>
      new URL(r.url).pathname === NOT_FOUND_PATH
        ? new Response("Page not found", { status: 404 })
        : new Response("page"),
  });
  async function open(path: string, who: Who) {
    const ctx = createExecutionContext();
    const response = await worker.fetch(
      new Request(`${ORIGIN}${path}`, {
        headers: { Cookie: cookies.get(who) ?? "" },
      }),
      apiEnv as unknown as Env,
      ctx,
    );
    await waitOnExecutionContext(ctx);
    return response;
  }

  it("go to the admin only, never cached, never sniffed", async () => {
    const { id } = FeedbackSendResultSchema.parse(
      await (await call("feedback/pin", pin, { who: "admin" })).json(),
    );
    for (const path of [
      `/admin/feedback/shot/${id}`,
      `/admin/feedback/shot/${id}/element`,
    ]) {
      const response = await open(path, "admin");
      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe("image/png");
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
      expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
      expect(response.headers.get("Content-Security-Policy")).toBe(
        "default-src 'none'; sandbox",
      );
      expect(new Uint8Array(await response.arrayBuffer())[1]).toBe(0x50);
    }
    for (const who of ["student", "nobody"] as const) {
      const response = await open(`/admin/feedback/shot/${id}`, who);
      expect(response.status).toBe(404);
      await response.text();
    }
    const missing = await open(
      "/admin/feedback/shot/AAAAAAAAAAAAAAAAAAAAAA",
      "admin",
    );
    expect(missing.status).toBe(404);
    await missing.text();
  });
});

describe("retention", () => {
  const DAY = 86_400_000;

  it("clears undo tokens, then screenshots, then items", async () => {
    const open = await send();
    const closed = await send();
    await call(
      "admin/feedback/update",
      { id: closed.id, status: "wont-fix" },
      { who: "admin" },
    );

    tick(11 * 60_000);
    let result = await pruneFeedback(env.DB, env.USER_CONTENT, now());
    expect(result.undoCleared).toBe(2);
    expect((await row(open.id))?.undo_hash).toBeNull();

    tick(31 * DAY);
    result = await pruneFeedback(env.DB, env.USER_CONTENT, now());
    expect(result.shotsExpired).toBe(1);
    expect((await row(closed.id))?.screenshot_key).toBeNull();
    expect((await row(open.id))?.screenshot_key).not.toBeNull();

    tick(150 * DAY);
    await pruneFeedback(env.DB, env.USER_CONTENT, now());
    expect((await row(open.id))?.screenshot_key).toBeNull();
    expect(
      (await env.USER_CONTENT.list({ prefix: "feedback/" })).objects,
    ).toHaveLength(0);

    tick(185 * DAY);
    result = await pruneFeedback(env.DB, env.USER_CONTENT, now());
    expect(result.removed).toBe(2);
    expect(await row(open.id)).toBeNull();
  });

  it("forgets who sent it when their account is purged", async () => {
    const { id } = await send({ ...bug, reply: true }, "student");
    await call("account/delete", {}, { who: "student" });
    tick(8 * DAY);
    await purgeAccounts(env.DB, now());
    expect(await row(id)).toMatchObject({ user_id: null, text: bug.text });
  });
});
