// The route table's rate limits (V2.md §12): per IP for every route anyone
// can call, per person for signed-in ones, through the real router and D1.
import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { SESSION_REFRESH_AFTER_MS } from "~/core/auth";
import { windowStart } from "../counters";
import { type ApiEnv, handleApi, ROUTES, userLimitKey } from "./router";

const ORIGIN = "http://localhost:3000";
const testEnv: ApiEnv = { ...env, AUTH_TEST_MODE: "true" };
const START = Date.parse("2026-10-01T15:10:00.000Z");
let clock = START;
const now = () => new Date(clock);

/** A browser signed in with test mode (docs/AUTH.md), keeping its cookie. */
async function signedIn(userId: string) {
  let cookie = "";
  const post = async (path: string, body: unknown = {}) => {
    const response = await handleApi(
      new Request(`${ORIGIN}${path}`, {
        method: "POST",
        body: JSON.stringify(body),
        headers: {
          "Content-Type": "application/json",
          Origin: ORIGIN,
          "Sec-Fetch-Site": "same-origin",
          Cookie: cookie,
        },
      }),
      testEnv,
      { waitUntil: () => {} },
      now(),
    );
    const session = response.headers
      .getSetCookie()
      .find((line) => line.startsWith("__Host-session="));
    if (session) cookie = session.split(";")[0] ?? "";
    return response;
  };
  await post("/api/auth/test-sign-in", { userId });
  expect(cookie).not.toBe("");
  return { post, cookie: () => cookie };
}

/** Uses up `route`'s hourly allowance for `userId`. */
async function exhaust(userId: string, route: keyof typeof ROUTES) {
  const limit = ROUTES[route].perUserPerHour;
  if (limit === undefined) throw new Error(`${route} has no per-user limit`);
  await env.DB.prepare(
    "INSERT INTO counters (name, window_start, count) VALUES (?1, ?2, ?3)",
  )
    .bind(
      userLimitKey(userId, route),
      windowStart(now(), 3_600).toISOString(),
      limit,
    )
    .run();
}

const accountStatus = (userId: string) =>
  env.DB.prepare("SELECT status FROM users WHERE id = ?1")
    .bind(userId)
    .first("status");

beforeEach(async () => {
  clock = START;
  await env.DB.exec(
    "DELETE FROM sessions; DELETE FROM user_identities; DELETE FROM users; DELETE FROM counters;",
  );
});

describe("the route table", () => {
  const routes = Object.entries(ROUTES).map(([name, r]) => ({
    name,
    auth: r.auth,
    perIp: r.perIpPerHour,
    perUser: r.perUserPerHour,
  }));

  it("limits per person only on routes that know the person", () => {
    for (const r of routes)
      if (r.perUser !== undefined)
        expect([r.name, r.auth]).toEqual([
          r.name,
          expect.stringMatching(/^(user|admin)$/),
        ]);
  });

  it("limits every route anyone can call per IP", () => {
    for (const r of routes)
      if (r.auth === undefined || r.auth === "none")
        expect([r.name, r.perIp]).toEqual([r.name, expect.any(Number)]);
  });

  it("has V2.md §12's per-person limits", () => {
    expect(ROUTES["account/delete"]).toMatchObject({
      perIpPerHour: 30,
      perUserPerHour: 10,
    });
  });
});

describe("per-person limits", () => {
  it("refuse a person past their allowance, before the handler runs", async () => {
    const student = await signedIn("tstudent");
    await exhaust("tstudent", "account/delete");
    const response = await student.post("/api/account/delete");
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({
      error: "rate-limited",
      retryAfterSeconds: 50 * 60,
    });
    expect(response.headers.get("Retry-After")).toBe(String(50 * 60));
    expect(await accountStatus("tstudent")).toBe("active");
  });

  it("count each person separately, whatever their IP", async () => {
    await exhaust("tstudent", "account/delete");
    const classmate = await signedIn("tclassmate");
    const response = await classmate.post("/api/account/delete");
    expect(response.status).toBe(200);
    expect(await accountStatus("tclassmate")).toBe("deleting");
  });

  it("reset with the hour", async () => {
    const student = await signedIn("tstudent");
    await exhaust("tstudent", "account/delete");
    clock += 50 * 60 * 1000;
    expect((await student.post("/api/account/delete")).status).toBe(200);
  });

  it("still hand over a refreshed session's cookie", async () => {
    const student = await signedIn("tstudent");
    const before = student.cookie();
    clock += SESSION_REFRESH_AFTER_MS;
    await exhaust("tstudent", "account/delete");
    const response = await student.post("/api/account/delete");
    expect(response.status).toBe(429);
    // Without the new cookie, the old one would stop working in a minute.
    expect(student.cookie()).not.toBe(before);
    expect((await student.post("/api/me")).status).toBe(200);
    expect(await (await student.post("/api/me")).json()).toMatchObject({
      status: "signed-in",
    });
  });
});
