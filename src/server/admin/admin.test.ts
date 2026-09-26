import {
  createExecutionContext,
  waitOnExecutionContext,
} from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { CSP_NONCE_HEADER, type StoredVerdict } from "~/core/schema";
import {
  AdminHealthSchema,
  AdminSamplesResultSchema,
  type DecisionListResult,
  DecisionListResultSchema,
} from "~/core/schema/admin";
import { type ApiEnv, handleApi } from "../api/router";
import { hit } from "../counters";
import { CAP_COUNTER, CAP_WINDOW } from "../moderation/service";
import { insertDecision, upsertQueueItem } from "../moderation/store";
import { createWorker, NOT_FOUND_PATH } from "../worker";
import { addSamples } from "./samples";

// The admin panel's routes (V2 §10) and its pages' gate, in test mode:
// `tadmin` is an admin, `tstudent` isn't (docs/AUTH.md).

const NOW = new Date("2027-01-10T12:00:00.000Z");
const ORIGIN = "http://localhost:3000";
const apiEnv: ApiEnv = {
  ...env,
  SIGN_IN_ENABLED: "true",
  AUTH_TEST_MODE: "true",
  AUTH_SECRET: "test-auth-secret-0123456789abcdefghijklmnopq",
  MODERATION_DAILY_CAP: "5",
};

type Who = "admin" | "student" | "nobody";
const cookies = new Map<Who, string>();

function post(path: string, body: unknown, cookie = ""): Request {
  return new Request(`${ORIGIN}/api/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: ORIGIN,
      "Sec-Fetch-Site": "same-origin",
      Cookie: cookie,
    },
    body: JSON.stringify(body),
  });
}

async function signIn(who: Who, userId: string): Promise<void> {
  const response = await handleApi(
    post("auth/test-sign-in", { userId }),
    apiEnv,
    { waitUntil: () => undefined },
    NOW,
  );
  expect(response.status).toBe(200);
  cookies.set(
    who,
    response.headers
      .getSetCookie()
      .map((line) => line.split(";")[0])
      .join("; "),
  );
}

async function call(
  name: string,
  body: unknown,
  who: Who = "admin",
  now = NOW,
): Promise<Response> {
  return handleApi(
    post(`admin/${name}`, body, cookies.get(who) ?? ""),
    apiEnv,
    { waitUntil: () => undefined },
    now,
  );
}

const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);

/** A decision row, `m` minutes before NOW. */
function decision(
  m: number,
  over: {
    surface?: "review" | "chat";
    verdict?: StoredVerdict;
    human?: boolean;
    ref?: string;
  } = {},
) {
  const human = over.human ?? false;
  return insertDecision(env.DB, {
    surface: over.surface ?? "review",
    ref: over.ref ?? `log-${m}`,
    stage: human ? "human" : "model",
    verdict: over.verdict ?? "allow",
    labels: [{ code: "spam", source: "policy", action: "hold", score: 0.6 }],
    guard: { safe: true, categories: [] },
    policy: { spam: 0.6 },
    models: { guard: "@cf/guard-model", policy: "@cf/policy-model" },
    latencyMs: human ? null : 420,
    decidedBy: human ? "admin" : "system",
    reason: human ? "spam" : null,
    now: minutesAgo(m),
  });
}

beforeAll(async () => {
  await signIn("admin", "tadmin");
  await signIn("student", "tstudent");
  await env.DB.batch([
    decision(1),
    decision(2, { verdict: "hold" }),
    decision(3, { surface: "chat" }),
    decision(4, { surface: "chat", verdict: "reject" }),
    decision(5, { surface: "chat", verdict: "remove", human: true }),
    // Yesterday (UTC), and outside the 14 days the counts cover.
    decision(13 * 60, { verdict: "hold" }),
    decision(20 * 24 * 60),
  ]);
});

async function decisions(body: object): Promise<DecisionListResult> {
  const response = await call("decisions", body);
  expect(response.status).toBe(200);
  return DecisionListResultSchema.parse(await response.json());
}

describe("admin routes", () => {
  it("answer only the admin: 401 signed out, 403 for anyone else", async () => {
    for (const name of ["decisions", "health", "samples"]) {
      expect((await call(name, {}, "nobody")).status).toBe(401);
      expect((await call(name, {}, "student")).status).toBe(403);
    }
    expect((await call("health", {}, "admin")).status).toBe(200);
  });
});

describe("admin/decisions", () => {
  it("pages through the log, newest first, without gaps or repeats", async () => {
    const first = await decisions({ limit: 3 });
    expect(first.decisions.map((d) => d.targetId)).toEqual([
      "log-1",
      "log-2",
      "log-3",
    ]);
    expect(first.cursor).not.toBeNull();
    const second = await decisions({ limit: 3, cursor: first.cursor });
    expect(second.decisions.map((d) => d.targetId)).toEqual([
      "log-4",
      "log-5",
      "log-780",
    ]);
    const last = await decisions({ limit: 3, cursor: second.cursor });
    expect(last.decisions.map((d) => d.targetId)).toEqual(["log-28800"]);
    expect(last.cursor).toBeNull();
  });

  it("filters by surface, stage and verdict", async () => {
    const human = await decisions({ surface: "chat", stage: "human" });
    expect(human.decisions).toEqual([
      expect.objectContaining({
        targetId: "log-5",
        kind: "chat",
        stage: "human",
        verdict: "remove",
        decidedBy: "admin",
        reason: "spam",
      }),
    ]);
    const held = await decisions({ verdict: "hold" });
    expect(held.decisions.map((d) => d.targetId)).toEqual(["log-2", "log-780"]);
  });

  it("counts each UTC day's automatic decisions, for the held share", async () => {
    const all = await decisions({});
    expect(all.days).toHaveLength(14);
    expect(all.days[0]).toEqual({
      day: "2027-01-10",
      allowed: 2,
      held: 1,
      rejected: 1,
    });
    expect(all.days[1]).toEqual({
      day: "2027-01-09",
      allowed: 0,
      held: 1,
      rejected: 0,
    });
    const chat = await decisions({ surface: "chat" });
    expect(chat.days[0]).toEqual({
      day: "2027-01-10",
      allowed: 1,
      held: 0,
      rejected: 1,
    });
  });

  it("leaves out model ids and raw answers, and never has text or an author", async () => {
    // Read the raw answer: the schema would drop extra keys on the way in.
    const response = await call("decisions", {});
    const raw = (await response.json()) as { decisions: object[] };
    expect(JSON.stringify(raw)).not.toContain("@cf/");
    expect(raw.decisions.length).toBeGreaterThan(0);
    for (const entry of raw.decisions)
      expect(Object.keys(entry).sort()).toEqual([
        "createdAt",
        "decidedBy",
        "id",
        "kind",
        "latencyMs",
        "reason",
        "reasons",
        "stage",
        "targetId",
        "verdict",
      ]);
  });

  it("rejects a malformed cursor instead of guessing", async () => {
    const response = await call("decisions", { cursor: "2027-01-10~x" });
    expect(response.status).toBe(400);
  });
});

describe("admin/health", () => {
  it("counts today's model calls against the cap, and what's waiting", async () => {
    for (let i = 0; i < 3; i++) await hit(env.DB, CAP_COUNTER, CAP_WINDOW, NOW);
    const snapshot = {
      text: "held text",
      course: null,
      activeAssignments: false,
      scores: {},
      retries: 0,
    };
    await env.DB.batch([
      upsertQueueItem(env.DB, {
        surface: "review",
        ref: "health-retry",
        snapshot,
        labels: [],
        urgent: false,
        status: "retry",
        now: minutesAgo(7),
      }),
      upsertQueueItem(env.DB, {
        surface: "chat",
        ref: "health-open",
        snapshot,
        labels: [],
        urgent: true,
        status: "open",
        now: minutesAgo(90),
      }),
    ]);
    const health = AdminHealthSchema.parse(
      await (await call("health", {})).json(),
    );
    expect(health.aiCalls).toEqual({ today: 3, cap: 5 });
    expect(health.retry).toEqual({
      waiting: 1,
      oldestAt: minutesAgo(7).toISOString(),
    });
    expect(health.queue).toMatchObject({ urgent: 1 });
    expect(health.queue.open).toBeGreaterThanOrEqual(1);

    // Attempts past the cap never reach a model, so they aren't calls.
    for (let i = 0; i < 4; i++) await hit(env.DB, CAP_COUNTER, CAP_WINDOW, NOW);
    const capped = AdminHealthSchema.parse(
      await (await call("health", {})).json(),
    );
    expect(capped.aiCalls).toEqual({ today: 5, cap: 5 });
  });
});

describe("admin/samples", () => {
  it("adds made-up held posts in test mode, urgent first in the queue", async () => {
    const response = await call("samples", {});
    const { items } = AdminSamplesResultSchema.parse(await response.json());
    expect(items).toHaveLength(4);
    expect(items.every((i) => i.status === "open")).toBe(true);
    expect(items.some((i) => i.urgent)).toBe(true);
    // Each rule match points at the words it matched.
    const review = items.find((i) => i.course === "CMSC351");
    const email = review?.reasons.find((r) => r.code === "email");
    expect(
      email?.span && review?.text?.slice(email.span[0], email.span[1]),
    ).toBe("jane.doe@example.com");

    const queue = await handleApi(
      post("admin/moderation/queue", {}, cookies.get("admin")),
      apiEnv,
      { waitUntil: () => undefined },
      NOW,
    );
    const listed = (await queue.json()) as { items: { urgent: boolean }[] };
    expect(listed.items[0]?.urgent).toBe(true);
  });

  it("is not-found anywhere test mode is off", async () => {
    const { AUTH_TEST_MODE: _on, ...testModeOff } = apiEnv;
    const response = await addSamples(testModeOff, {
      request: post("admin/samples", {}),
      now: NOW,
    });
    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(404);
  });
});

describe("the admin pages", () => {
  const app = {
    fetch: vi.fn(async (request: Request) =>
      new URL(request.url).pathname === NOT_FOUND_PATH
        ? new Response("Page not found", { status: 404 })
        : new Response("admin page"),
    ),
  };
  const worker = createWorker(app);

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

  it("load for the admin, and nobody's cache keeps them", async () => {
    const response = await open("/admin/decisions?stage=human", "admin");
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("admin page");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("are the plain 404 page for anyone else signed in", async () => {
    for (const path of ["/admin", "/admin/", "/admin/decisions"]) {
      const response = await open(path, "student");
      expect(response.status).toBe(404);
      expect(await response.text()).toBe("Page not found");
    }
  });

  it("send a signed-out visitor to sign in, and back afterwards", async () => {
    const response = await open("/admin/decisions?stage=human", "nobody");
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(
      `${ORIGIN}/signin?return=%2Fadmin%2Fdecisions%3Fstage%3Dhuman`,
    );
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("carry the security headers, and the app gets a CSP nonce", async () => {
    app.fetch.mockClear();
    for (const [path, who] of [
      ["/admin", "admin"],
      ["/admin", "student"],
      ["/admin", "nobody"],
    ] as const) {
      const response = await open(path, who);
      expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    }
    // The page and the 404 page were rendered; the sign-in trip wasn't.
    expect(app.fetch).toHaveBeenCalledTimes(2);
    for (const [request] of app.fetch.mock.calls)
      expect(request.headers.get(CSP_NONCE_HEADER)).toMatch(/\S/);
  });

  it("leave every other page alone", async () => {
    const response = await open("/administration", "nobody");
    expect(await response.text()).toBe("admin page");
  });
});
