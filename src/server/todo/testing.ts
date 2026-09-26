// Worker-test helpers for Todo (imported only by *.test.ts): a signed-in
// device on the real router and D1, and a fake ELMS that serves the parser's
// synthetic feeds (src/core/todo/__fixtures__).
import { env } from "cloudflare:workers";
import { findTestUser } from "~/core/auth";
import { FEEDS } from "~/core/todo/__fixtures__/feeds";
import { type ApiEnv, handleApi } from "../api/router";
import { startSession } from "../auth/session";
import { upsertUser } from "../auth/store";

export const ORIGIN = "https://terpsicle.com";

/** The fixture link's secret part: tests assert it's never seen anywhere. */
export const FEED_TOKEN = "SyntheticFeedToken7Qx2Lm9Zr4Kd8Vw3";
export const FEED_URL = `https://elms.umd.edu/feeds/calendars/user_${FEED_TOKEN}.ics`;

const base64url = (text: string) =>
  btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** Two 32-byte test keys, for rotation. */
export const TEST_KEYS = {
  k1: base64url("worker-test-feed-key-number-one!"),
  k2: base64url("worker-test-feed-key-number-two!"),
};

/** The worker test env with Todo on under key k1; `overrides` win. */
export function todoEnv(overrides: Record<string, string> = {}): ApiEnv & Env {
  return {
    ...(env as unknown as ApiEnv & Env),
    TODO_ENABLED: "on",
    TODO_FEED_KEY: TEST_KEYS.k1,
    TODO_FEED_KEY_ID: "k1",
    ...overrides,
  } as unknown as ApiEnv & Env;
}

export const ELMS_FEED = FEEDS["synthetic-elms-2026-09"]?.text ?? "";
export const FILE_FEED = FEEDS["synthetic-file-gradescope"]?.text ?? "";

type Answer = () => Response | Promise<Response>;

/**
 * ELMS for one link. Answers the synthetic feed with an ETag until told
 * otherwise; 304 when the request's If-None-Match matches.
 */
export class FakeElms {
  requests: { url: string; headers: Headers }[] = [];
  /** Bodies of anything posted to PostHog. */
  analytics: string[] = [];
  body = ELMS_FEED;
  etag: string | null = '"v1"';
  answer: Answer | null = null;

  readonly fetch: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    if (request.url.startsWith("https://us.i.posthog.com/")) {
      this.analytics.push(await request.text());
      return new Response("{}");
    }
    this.requests.push({ url: request.url, headers: request.headers });
    if (this.answer) return this.answer();
    if (request.url !== FEED_URL) return new Response("", { status: 404 });
    if (this.etag && request.headers.get("If-None-Match") === this.etag)
      return new Response(null, { status: 304 });
    return new Response(this.body, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        ...(this.etag ? { ETag: this.etag } : {}),
      },
    });
  };

  /** A new body, with a new ETag so a conditional GET gets it. */
  serve(body: string, etag: string | null = `"${this.requests.length}"`) {
    this.body = body;
    this.etag = etag;
    this.answer = null;
  }

  fail(status: number) {
    this.answer = () => new Response("gone", { status });
  }
}

export async function clearTodo(): Promise<void> {
  await env.DB.batch(
    [
      "todo_done",
      "todo_items",
      "todo_feeds",
      "counters",
      "sessions",
      "users",
    ].map((t) => env.DB.prepare(`DELETE FROM ${t}`)),
  );
}

/** A browser signed in as one of TEST_USERS, straight to a session. */
export async function signIn(
  userId: string,
  options: { now: () => Date; env: () => ApiEnv; elms: FakeElms },
): Promise<Device> {
  const user = findTestUser(userId);
  if (!user) throw new Error(`no test user ${userId}`);
  await upsertUser(env.DB, user.identity, options.now());
  const setCookie = await startSession(env.DB, userId, options.now());
  return new Device(setCookie.split(";")[0] ?? "", options);
}

export class Device {
  constructor(
    readonly cookie: string,
    private readonly options: {
      now: () => Date;
      env: () => ApiEnv;
      elms: FakeElms;
    },
  ) {}

  request(path: string, body: unknown, origin = ORIGIN): Promise<Response> {
    return handleApi(
      new Request(`${origin}${path}`, {
        method: "POST",
        body: JSON.stringify(body),
        headers: {
          "Content-Type": "application/json",
          Origin: origin,
          "Sec-Fetch-Site": "same-origin",
          Cookie: this.cookie,
        },
      }),
      this.options.env(),
      { waitUntil: () => {} },
      this.options.now(),
      { fetch: this.options.elms.fetch },
    );
  }

  /** POSTs and returns the JSON answer, expecting a 200. */
  async call<T = unknown>(path: string, body: unknown = {}): Promise<T> {
    const response = await this.request(path, body);
    if (response.status !== 200)
      throw new Error(`${path} answered ${response.status}`);
    return (await response.json()) as T;
  }
}
