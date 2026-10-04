// The calendar feed (docs/V2.md §6.7) on the real router, D1 and R2: the
// link is made once and shown again, a new link stops the old one, the feed
// needs no cookie and holds the term's first plan and Todo's open deadlines,
// limits hold per IP and per link, and the token is never stored, logged or
// counted by itself.
import {
  createExecutionContext,
  waitOnExecutionContext,
} from "cloudflare:test";
import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { findTestUser } from "~/core/auth";
import {
  calendarKey,
  deptChunkKey,
  manifestKey,
  TERMS_KEY,
} from "~/core/schema";
import {
  CalendarFeedResetResultSchema,
  CalendarFeedResultSchema,
} from "~/core/schema/calendar-feed";
import {
  aCourse,
  aDeptChunk,
  aManifest,
  aManifestDepartment,
  aMeeting,
  aPlan,
  aPlanCourse,
  aPublishedCalendar,
  aSection,
  aSettingsDoc,
  aTerm,
  aTermsFile,
  aTodoItem,
  FIXTURE_HASH,
  fixtureTermId,
} from "~/fixtures";
import { type ApiEnv, handleApi } from "../api/router";
import { startSession } from "../auth/session";
import { markDeleting, upsertUser } from "../auth/store";
import { keyedHash } from "../crypto";
import { sealedBodyFor } from "../sync/testing";
import { sealedTitleFor } from "../todo/testing";
import { createWorker } from "../worker";
import {
  FEED_CACHE_CONTROL,
  FEED_PER_IP_PER_HOUR,
  FEED_PER_TOKEN_PER_HOUR,
  serveCalendarFeed,
} from "./feed";
import { feedTokenHash } from "./token";

const ORIGIN = "https://terpsicle.com";
const TERM = "202701";
/** Fall 2026 in College Park: the feed carries Fall, Winter and Spring. */
let clock = Date.parse("2026-10-01T16:00:00.000Z");
const now = () => new Date(clock);
const apiEnv = env as unknown as ApiEnv & Env;

const logged: string[] = [];

beforeEach(async () => {
  clock = Date.parse("2026-10-01T16:00:00.000Z");
  logged.length = 0;
  await env.DB.batch(
    [
      "calendar_feeds",
      "sync_docs",
      "sync_heads",
      "todo_done",
      "todo_hidden",
      "todo_tasks",
      "todo_items",
      "counters",
      "sessions",
      "users",
    ].map((t) => env.DB.prepare(`DELETE FROM ${t}`)),
  );
  await putCatalog();
  for (const method of ["log", "info", "warn", "error", "debug"] as const)
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      logged.push(args.map((a) => JSON.stringify(a)).join(" "));
    });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------- the catalog in R2 ----------

async function putCatalog() {
  const course = (code: string, meetingKind: "lecture" | "lab") =>
    aCourse({
      code,
      title: code === "CMSC351" ? "Algorithms" : "Physics Lab",
      sections: [
        aSection({
          code: "0101",
          meetings: [
            aMeeting({
              days: ["M", "W", "F"],
              start: 600,
              end: 650,
              building: "IRB",
              room: "0324",
              kind: meetingKind,
            }),
          ],
        }),
      ],
    });
  await Promise.all([
    env.DATA.put(TERMS_KEY, JSON.stringify(aTermsFile({ terms: [aTerm()] }))),
    env.DATA.put(
      manifestKey(TERM),
      JSON.stringify(
        aManifest({
          departments: [
            aManifestDepartment({ code: "CMSC", hash: FIXTURE_HASH }),
            aManifestDepartment({ code: "PHYS", hash: FIXTURE_HASH }),
          ],
        }),
      ),
    ),
    env.DATA.put(
      deptChunkKey(TERM, "CMSC", FIXTURE_HASH),
      JSON.stringify(aDeptChunk({ courses: [course("CMSC351", "lecture")] })),
    ),
    env.DATA.put(
      deptChunkKey(TERM, "PHYS", FIXTURE_HASH),
      JSON.stringify(aDeptChunk({ courses: [course("PHYS261", "lab")] })),
    ),
    env.DATA.put(calendarKey(TERM), JSON.stringify(aPublishedCalendar())),
  ]);
}

// ---------- people ----------

class Person {
  constructor(
    readonly id: string,
    readonly cookie: string,
  ) {}

  api(path: string, body: unknown = {}): Promise<Response> {
    return handleApi(
      new Request(`${ORIGIN}/api/${path}`, {
        method: "POST",
        body: JSON.stringify(body),
        headers: {
          "Content-Type": "application/json",
          Origin: ORIGIN,
          "Sec-Fetch-Site": "same-origin",
          Cookie: this.cookie,
        },
      }),
      apiEnv,
      { waitUntil: () => {} },
      now(),
    );
  }

  async link() {
    const response = await this.api("calendar/feed");
    expect(response.status).toBe(200);
    return CalendarFeedResultSchema.parse(await response.json());
  }

  async reset() {
    const response = await this.api("calendar/feed/reset");
    expect(response.status).toBe(200);
    return CalendarFeedResetResultSchema.parse(await response.json()).url;
  }
}

async function signIn(userId: string): Promise<Person> {
  const user = findTestUser(userId);
  if (!user) throw new Error(`no test user ${userId}`);
  await upsertUser(env.DB, user.identity, now());
  const setCookie = await startSession(env.DB, userId, now());
  return new Person(userId, setCookie.split(";")[0] ?? "");
}

let rev = 0;
async function savePlan(userId: string, plan: ReturnType<typeof aPlan>) {
  rev += 1;
  await env.DB.prepare(
    `INSERT INTO sync_docs (user_id, kind, doc_id, term_id, rev, deleted, body, updated_at)
     VALUES (?1, 'plan', ?2, ?3, ?4, 0, ?5, ?6)`,
  )
    .bind(
      userId,
      plan.id,
      plan.termId,
      rev,
      await sealedBodyFor(env, userId, "plan", plan.id, plan),
      now().toISOString(),
    )
    .run();
}

async function addItem(userId: string, item: ReturnType<typeof aTodoItem>) {
  await env.DB.prepare(
    `INSERT INTO todo_items (user_id, uid, source, title, course_label, course_code, section_code,
       kind, due_at, due_date, link, first_seen_at, updated_at)
     VALUES (?1, ?2, 'elms', ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?11)`,
  )
    .bind(
      userId,
      item.uid,
      item.title,
      item.courseLabel,
      item.courseCode,
      item.sectionCode,
      item.kind,
      item.dueAt,
      item.dueDate,
      item.link,
      now().toISOString(),
    )
    .run();
}

// ---------- fetching the feed ----------

const worker = createWorker({
  fetch: async () => new Response("app shell"),
});

/** A calendar app's GET, with no cookie, at the test's clock. */
async function fetchFeed(
  url: string,
  init: RequestInit & { ip?: string } = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.ip) headers.set("CF-Connecting-IP", init.ip);
  const ctx = createExecutionContext();
  const response = await serveCalendarFeed(
    new Request(url, { ...init, headers }),
    apiEnv,
    ctx,
    now(),
  );
  await waitOnExecutionContext(ctx);
  return response;
}

const tokenOf = (url: string) =>
  /\/cal\/([0-9a-f]{64})\.ics$/.exec(url)?.[1] ?? "";

const unfold = (ics: string) => ics.replace(/\r\n /g, "");

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

// ---------- the link ----------

describe("calendar/feed", () => {
  it("needs a signed-in person", async () => {
    const response = await handleApi(
      new Request(`${ORIGIN}/api/calendar/feed`, {
        method: "POST",
        body: "{}",
        headers: {
          "Content-Type": "application/json",
          Origin: ORIGIN,
          "Sec-Fetch-Site": "same-origin",
        },
      }),
      apiEnv,
      { waitUntil: () => {} },
      now(),
    );
    expect(response.status).toBe(401);
  });

  it("makes the link on the first ask and shows the same one after", async () => {
    const student = await signIn("tstudent");
    const first = await student.link();
    expect(first.created).toBe(true);
    expect(first.url).toMatch(
      /^https:\/\/terpsicle\.com\/cal\/[0-9a-f]{64}\.ics$/,
    );
    const again = await student.link();
    expect(again).toEqual({ url: first.url, created: false });

    // Someone else's link is their own.
    const classmate = await signIn("tclassmate");
    expect((await classmate.link()).url).not.toBe(first.url);
  });

  it("stores only the token's hash, never the token", async () => {
    const student = await signIn("tstudent");
    const { url } = await student.link();
    const token = tokenOf(url);
    const row = await env.DB.prepare(
      "SELECT token_hash FROM calendar_feeds WHERE user_id = 'tstudent'",
    ).first<{ token_hash: string }>();
    expect(row?.token_hash).toBe(await feedTokenHash(token));
    await fetchFeed(url);
    expect(await everyD1Value()).not.toContain(token);
  });

  it("answers with a link on the asking origin", async () => {
    const student = await signIn("tstudent");
    const response = await handleApi(
      new Request("http://localhost:3000/api/calendar/feed", {
        method: "POST",
        body: "{}",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://localhost:3000",
          "Sec-Fetch-Site": "same-origin",
          Cookie: student.cookie,
        },
      }),
      apiEnv,
      { waitUntil: () => {} },
      now(),
    );
    const { url } = CalendarFeedResultSchema.parse(await response.json());
    expect(url.startsWith("http://localhost:3000/cal/")).toBe(true);
  });
});

describe("calendar/feed/reset", () => {
  it("makes a new link, and the old one stops working at once", async () => {
    const student = await signIn("tstudent");
    const { url: old } = await student.link();
    expect((await fetchFeed(old)).status).toBe(200);

    const fresh = await student.reset();
    expect(fresh).not.toBe(old);
    expect((await fetchFeed(old)).status).toBe(404);
    expect((await fetchFeed(fresh)).status).toBe(200);
    // Settings shows the new one from now on.
    expect(await student.link()).toEqual({ url: fresh, created: false });
  });

  it("works before there's a link, making one", async () => {
    const student = await signIn("tstudent");
    const url = await student.reset();
    expect(await student.link()).toEqual({ url, created: false });
  });
});

// ---------- the feed ----------

describe("GET /cal/<token>.ics", () => {
  it("is routed by the Worker, before any page", async () => {
    const student = await signIn("tstudent");
    const { url } = await student.link();
    const ctx = createExecutionContext();
    const response = await worker.fetch(new Request(url), env as Env, ctx);
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe(
      "text/calendar; charset=utf-8",
    );
    // The security headers every response gets.
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("needs no cookie, and is private to caches for 15 minutes", async () => {
    const student = await signIn("tstudent");
    const { url } = await student.link();
    const response = await fetchFeed(url);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe(
      "text/calendar; charset=utf-8",
    );
    expect(response.headers.get("Cache-Control")).toBe(FEED_CACHE_CONTROL);
    expect(response.headers.get("Cache-Control")).toBe("private, max-age=900");
    expect(response.headers.get("Set-Cookie")).toBeNull();
    const body = await response.text();
    expect(body.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
  });

  it("holds the term's first plan's classes and Todo's open deadlines", async () => {
    const student = await signIn("tstudent");
    await savePlan(
      "tstudent",
      aPlan({
        id: "plan_first",
        name: "Plan A",
        order: 0,
        courses: [aPlanCourse({ courseCode: "CMSC351", sectionCode: "0101" })],
      }),
    );
    await savePlan(
      "tstudent",
      aPlan({
        id: "plan_second",
        name: "Plan B",
        order: 1,
        courses: [aPlanCourse({ courseCode: "PHYS261", sectionCode: "0101" })],
      }),
    );
    await addItem("tstudent", aTodoItem());
    await addItem(
      "tstudent",
      aTodoItem({ uid: "event-assignment-done", title: "Homework 1" }),
    );
    await env.DB.prepare(
      "INSERT INTO todo_done (user_id, uid, done_at) VALUES ('tstudent', 'event-assignment-done', ?1)",
    )
      .bind(now().toISOString())
      .run();
    await env.DB.prepare(
      `INSERT INTO todo_tasks (user_id, uid, title, course_code, due_at, due_date, created_at, updated_at)
       VALUES ('tstudent', 'own-study-group', ?2, NULL, NULL, '2026-10-03', ?1, ?1)`,
    )
      .bind(
        now().toISOString(),
        await sealedTitleFor(env, "tstudent", "own-study-group", "Study group"),
      )
      .run();
    // A course hidden in Todo, by its code.
    await addItem(
      "tstudent",
      aTodoItem({
        uid: "event-assignment-club",
        title: "Club dues",
        courseLabel: "MUSC130-0101: Chorus",
        courseCode: "MUSC130",
      }),
    );
    await env.DB.prepare(
      "INSERT INTO todo_hidden (user_id, course_key, hidden_at) VALUES ('tstudent', 'MUSC130', ?1)",
    )
      .bind(now().toISOString())
      .run();

    const { url } = await student.link();
    const body = unfold(await (await fetchFeed(url)).text());
    // Hidden is left out.
    expect(body).not.toContain("Club dues");
    expect(body).toContain("SUMMARY:CMSC351 Lecture");
    expect(body).toContain("LOCATION:IRB 0324");
    expect(body).toContain("DTSTART;TZID=America/New_York:20270127T100000");
    // Plan B isn't the feed's plan.
    expect(body).not.toContain("PHYS261");
    expect(body).toContain("SUMMARY:Due: Project 2 (CMSC216)");
    expect(body).toContain("SUMMARY:Due: Study group");
    expect(body).toContain("TRIGGER:-P1D");
    // Done is left out.
    expect(body).not.toContain("Homework 1");
    // The item's ELMS link isn't in it.
    expect(body).not.toContain("elms.umd.edu");
  });

  it("follows the plan: a new first tab changes what's in it", async () => {
    const student = await signIn("tstudent");
    await savePlan(
      "tstudent",
      aPlan({
        id: "plan_second",
        order: 1,
        courses: [aPlanCourse({ courseCode: "PHYS261", sectionCode: "0101" })],
      }),
    );
    const { url } = await student.link();
    expect(await (await fetchFeed(url)).text()).toContain("PHYS261 Lab");
  });

  it("holds the main plan's classes, not the first tab's, once another is main", async () => {
    const student = await signIn("tstudent");
    await savePlan(
      "tstudent",
      aPlan({
        id: "plan_first",
        order: 0,
        courses: [aPlanCourse({ courseCode: "CMSC351", sectionCode: "0101" })],
      }),
    );
    await savePlan(
      "tstudent",
      aPlan({
        id: "plan_second",
        name: "Plan B",
        order: 1,
        courses: [aPlanCourse({ courseCode: "PHYS261", sectionCode: "0101" })],
      }),
    );
    rev += 1;
    await env.DB.prepare(
      `INSERT INTO sync_docs (user_id, kind, doc_id, term_id, rev, deleted, body, updated_at)
       VALUES ('tstudent', 'settings', 'settings', NULL, ?1, 0, ?2, ?3)`,
    )
      .bind(
        rev,
        await sealedBodyFor(
          env,
          "tstudent",
          "settings",
          "settings",
          aSettingsDoc({ mainPlans: { [fixtureTermId]: "plan_second" } }),
        ),
        now().toISOString(),
      )
      .run();
    const { url } = await student.link();
    const body = await (await fetchFeed(url)).text();
    expect(body).toContain("PHYS261 Lab");
    expect(body).not.toContain("CMSC351");
  });

  it("answers HEAD without a body", async () => {
    const student = await signIn("tstudent");
    const { url } = await student.link();
    const response = await fetchFeed(url, { method: "HEAD" });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("");
  });

  it("notes the last fetch, at most once an hour", async () => {
    const student = await signIn("tstudent");
    const { url } = await student.link();
    const lastFetched = async () =>
      (
        await env.DB.prepare(
          "SELECT last_fetched_at FROM calendar_feeds WHERE user_id = 'tstudent'",
        ).first<{ last_fetched_at: string | null }>()
      )?.last_fetched_at;
    expect(await lastFetched()).toBeNull();
    const ctx = createExecutionContext();
    await serveCalendarFeed(new Request(url), apiEnv, ctx, now());
    await waitOnExecutionContext(ctx);
    const first = await lastFetched();
    expect(first).toBe(now().toISOString());
    clock += 10 * 60_000;
    const ctx2 = createExecutionContext();
    await serveCalendarFeed(new Request(url), apiEnv, ctx2, now());
    await waitOnExecutionContext(ctx2);
    expect(await lastFetched()).toBe(first);
  });

  it("is a plain 404 for a malformed, unknown or deleting account's link", async () => {
    const student = await signIn("tstudent");
    const { url } = await student.link();
    for (const path of [
      "/cal/",
      "/cal/abc.ics",
      `/cal/${"A".repeat(64)}.ics`,
      `/cal/${"0".repeat(64)}.ics`,
      `/cal/${tokenOf(url)}.txt`,
    ]) {
      const response = await fetchFeed(`${ORIGIN}${path}`);
      expect(response.status, path).toBe(404);
      expect(await response.text()).toBe("Not found");
    }
    await markDeleting(env.DB, "tstudent", now());
    expect((await fetchFeed(url)).status).toBe(404);
  });

  it("only answers GET and HEAD", async () => {
    const student = await signIn("tstudent");
    const { url } = await student.link();
    const response = await fetchFeed(url, { method: "POST" });
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("GET, HEAD");
  });

  it("is limited per link", async () => {
    const student = await signIn("tstudent");
    const { url } = await student.link();
    const hash = await feedTokenHash(tokenOf(url));
    await env.DB.prepare(
      "INSERT INTO counters (name, window_start, count) VALUES (?1, ?2, ?3)",
    )
      .bind(
        `cal-feed:${hash}`,
        new Date(Math.floor(clock / 3_600_000) * 3_600_000).toISOString(),
        FEED_PER_TOKEN_PER_HOUR,
      )
      .run();
    const response = await fetchFeed(url);
    expect(response.status).toBe(429);
    expect(Number(response.headers.get("Retry-After"))).toBeGreaterThan(0);
    // Another person's link isn't.
    const classmate = await signIn("tclassmate");
    expect((await fetchFeed((await classmate.link()).url)).status).toBe(200);
  });

  it("is limited per IP, before any lookup", async () => {
    const student = await signIn("tstudent");
    const { url } = await student.link();
    const ipHash = await keyedHash(env.DATA, "203.0.113.9");
    await env.DB.prepare(
      "INSERT INTO counters (name, window_start, count) VALUES (?1, ?2, ?3)",
    )
      .bind(
        `cal-feed:ip:${ipHash}`,
        new Date(Math.floor(clock / 3_600_000) * 3_600_000).toISOString(),
        FEED_PER_IP_PER_HOUR,
      )
      .run();
    expect((await fetchFeed(url, { ip: "203.0.113.9" })).status).toBe(429);
    expect(
      (
        await fetchFeed(`${ORIGIN}/cal/${"0".repeat(64)}.ics`, {
          ip: "203.0.113.9",
        })
      ).status,
    ).toBe(429);
    expect((await fetchFeed(url, { ip: "198.51.100.4" })).status).toBe(200);
  });

  it("never logs the token or counts it by itself", async () => {
    const student = await signIn("tstudent");
    const { url } = await student.link();
    const token = tokenOf(url);
    await fetchFeed(url);
    // A failing build logs only an error's name.
    const broken = {
      ...apiEnv,
      DATA: {
        ...apiEnv.DATA,
        get: async () => {
          throw new Error(`R2 down for ${url}`);
        },
      } as unknown as R2Bucket,
    };
    await savePlan("tstudent", aPlan());
    const ctx = createExecutionContext();
    // The HMAC key is cached in the isolate, so only the catalog read fails.
    const response = await serveCalendarFeed(
      new Request(url),
      broken,
      ctx,
      now(),
    );
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain(token);
    await student.reset();
    expect(logged.join("\n")).not.toContain(token);
    const counters = await env.DB.prepare("SELECT name FROM counters").all<{
      name: string;
    }>();
    expect(counters.results.map((c) => c.name).join("\n")).not.toContain(token);
  });
});
