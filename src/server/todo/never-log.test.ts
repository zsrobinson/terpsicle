// The feed link is a secret (docs/V3.md §5.1): through a connect, failing and
// succeeding fetches (the cron's and a refresh), every other route and a
// disconnect, its token must appear in no log line, no server analytics
// event, no API answer, and no D1 column (the sealed one included).
import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseIcs } from "~/core/todo";
import { runTodoFeedsJob } from "~/jobs/todo-feeds";
import {
  clearTodo,
  type Device,
  FakeElms,
  FEED_TOKEN,
  FEED_URL,
  FILE_FEED,
  signIn,
  todoEnv,
} from "./testing";

const MINUTE = 60_000;
let clock = Date.parse("2026-09-26T16:00:00.000Z");
const now = () => new Date(clock);
const logged: string[] = [];
const answers: string[] = [];

beforeEach(async () => {
  await clearTodo();
  for (const method of ["log", "info", "warn", "error", "debug"] as const) {
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      logged.push(
        args
          .map((a) =>
            typeof a === "string" ? a : `${String(a)} ${JSON.stringify(a)}`,
          )
          .join(" "),
      );
    });
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function everyD1Value(): Promise<string> {
  const { results: tables } = await env.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'",
  ).all<{ name: string }>();
  const dumps: string[] = [];
  for (const { name } of tables) {
    const { results } = await env.DB.prepare(`SELECT * FROM "${name}"`).all();
    dumps.push(`${name}: ${JSON.stringify(results)}`);
  }
  return dumps.join("\n");
}

async function keep(response: Response): Promise<void> {
  answers.push(
    `${response.status} ${JSON.stringify([...response.headers])} ${await response.text()}`,
  );
}

describe("the feed link", () => {
  it("never shows up in logs, analytics, answers or D1", async () => {
    const elms = new FakeElms();
    // Production's telemetry on, into the fake.
    const testEnv = todoEnv({ POSTHOG_TOKEN: "phc_test" });
    const phone: Device = await signIn("tstudent", {
      now,
      env: () => testEnv,
      elms,
    });
    const post = async (path: string, body: unknown = {}) =>
      keep(await phone.request(path, body));
    const cron = () =>
      runTodoFeedsJob({ env: testEnv, now: now(), fetch: elms.fetch });

    // A first fetch that fails with an error naming the link, then connects.
    elms.answer = () => {
      throw new TypeError(`fetch failed: ${FEED_URL}`);
    };
    await post("/api/todo/connect", { url: FEED_URL });
    elms.answer = null;
    await post("/api/todo/connect", { url: FEED_URL });
    await post("/api/todo/connect", { url: `${FEED_URL}?leak=1` });
    await post("/api/todo/list", { from: "2026-09-01", to: "2026-10-31" });
    await post("/api/todo/done", {
      uid: "event-assignment-4410001",
      done: true,
    });

    // The cron: a thrown error, a gone link, a redirect off ELMS, a success.
    for (const answer of [
      () => {
        throw new Error(`connect ECONNRESET ${FEED_URL}`);
      },
      () => new Response(`no calendar at ${FEED_URL}`, { status: 404 }),
      () =>
        new Response(null, {
          status: 302,
          headers: { Location: `https://evil.example/?from=${FEED_URL}` },
        }),
      null,
    ]) {
      elms.answer = answer;
      clock += 13 * 60 * MINUTE;
      await cron();
    }
    // A refresh that fails, then one that works.
    clock += 10 * MINUTE;
    elms.fail(500);
    await post("/api/todo/refresh");
    elms.answer = null;
    clock += 10 * MINUTE;
    await post("/api/todo/refresh");
    await post("/api/todo/import-file", {
      items: parseIcs(FILE_FEED, "file").items.map((i) => ({
        uid: i.uid,
        title: i.title,
        courseLabel: i.courseLabel,
        kind: i.kind,
        gradescope: i.gradescope,
        dueAt: i.dueAt,
        dueDate: i.dueDate,
        link: i.link,
      })),
    });
    await post("/api/me");

    const d1 = await everyD1Value();
    // The fetches really happened, and the row really holds a sealed link.
    expect(elms.requests.length).toBeGreaterThanOrEqual(6);
    expect(d1).toMatch(/"url_enc":"v1\.k1\./);
    expect(elms.analytics.some((a) => a.includes("todo_fetch_run"))).toBe(true);
    await post("/api/todo/disconnect");

    for (const [where, texts] of [
      ["logs", logged],
      ["analytics", elms.analytics],
      ["answers", answers],
      ["D1", [d1, await everyD1Value()]],
    ] as const) {
      for (const text of texts) {
        expect(text, `the token leaked into ${where}`).not.toContain(
          FEED_TOKEN,
        );
      }
    }
    expect(answers).toHaveLength(10);
  });
});
