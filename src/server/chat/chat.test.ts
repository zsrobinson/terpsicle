// Terpsicle Chat end to end (V2.md §8): the socket route, the CourseChat
// object over real WebSockets against D1 and R2, the moderation paths,
// retention alarms, the chat/* routes and chat_members from sync pushes.
// Every frame the object sends is checked against ChatServerFrameSchema.
import {
  createExecutionContext,
  evictDurableObject,
  runDurableObjectAlarm,
  runInDurableObject,
} from "cloudflare:test";
import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { findTestUser } from "~/core/auth";
import { SLURS } from "~/core/moderation";
import {
  type AcademicCalendar,
  CHAT_PROTOCOL_VERSION,
  type ChatClientFrame,
  type ChatMembersResult,
  ChatMembersResultSchema,
  type ChatServerFrame,
  ChatServerFrameSchema,
  type ChatUnreadResult,
  ChatUnreadResultSchema,
  calendarKey,
  courseRoomId,
  deptChunkKey,
  type ModerationInput,
  type ModerationResult,
  manifestKey,
  type Plan,
  professorRoomId,
  type SettingsDoc,
  sectionRoomId,
  TERMS_KEY,
} from "~/core/schema";
import {
  aCourse,
  aDeptChunk,
  aManifest,
  aManifestDepartment,
  aPlan,
  aPlanCourse,
  aPublishedCalendar,
  aSavedCourse,
  aSection,
  aSettingsDoc,
  aTerm,
  aTermsFile,
  FIXTURE_HASH,
} from "~/fixtures";
import { type ApiEnv, handleApi } from "../api/router";
import { startSession } from "../auth/session";
import { upsertUser } from "../auth/store";
import { moderationHandlers } from "../moderation/handlers";
import { createWorker } from "../worker";
import { CHAT_CLOSE, type CourseChat, chatScreening } from "./course-chat";
import { chatTargetId } from "./moderation-handler";

const ORIGIN = "https://terpsicle.com";
const TERM = "202701";
const COURSE = "CMSC351";
const DAY = 86_400_000;

const courseRoom = courseRoomId(TERM, COURSE);
const brandtRoom = professorRoomId(TERM, COURSE, ["Ada Brandt"]);
const mossRoom = professorRoomId(TERM, COURSE, ["Lee Moss"]);
const room0101 = sectionRoomId(TERM, COURSE, "0101");
const room0201 = sectionRoomId(TERM, COURSE, "0201");

// ---------- the catalog in R2 ----------

/** A calendar whose last day of classes is `days` from today. */
function calendarEndingIn(days: number): AcademicCalendar {
  const end = new Date(Date.now() + days * DAY).toISOString().slice(0, 10);
  return aPublishedCalendar({ termId: TERM, classesEnd: end });
}

async function putCatalog(calendar: AcademicCalendar = calendarEndingIn(60)) {
  const course = aCourse({
    code: COURSE,
    sections: [
      aSection({ code: "0101", instructors: ["Ada Brandt"] }),
      aSection({ code: "0102", instructors: ["Ada Brandt"] }),
      aSection({ code: "0201", instructors: ["Lee Moss"] }),
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
          ],
        }),
      ),
    ),
    env.DATA.put(
      deptChunkKey(TERM, "CMSC", FIXTURE_HASH),
      JSON.stringify(aDeptChunk({ courses: [course] })),
    ),
    env.DATA.put(calendarKey(TERM), JSON.stringify(calendar)),
  ]);
}

// ---------- moderation, stood in for ----------

const clean = (decision: ModerationResult["decision"]): ModerationResult => ({
  decision,
  reasons: [],
  model: { guard: null, policy: null },
  scores: {},
});

/**
 * The models' answers by marker in the text: "[hold]" is graded work,
 * "[remove]" spam, "[retry]" a model that didn't answer, "[throw]" a D1
 * failure; anything else publishes.
 */
async function fakeModerate(
  _env: unknown,
  input: ModerationInput,
): Promise<ModerationResult> {
  const { text } = input;
  if (text.includes("[throw]")) throw new Error("D1 is down");
  if (text.includes("[hold]"))
    return {
      ...clean("hold"),
      reasons: [{ code: "shares-answers", source: "rules", action: "hold" }],
    };
  if (text.includes("[remove]"))
    return {
      ...clean("remove"),
      reasons: [
        { code: "spam", source: "policy", action: "remove", score: 0.95 },
      ],
    };
  if (text.includes("[retry]"))
    return {
      ...clean("hold"),
      reasons: [
        { code: "model-unavailable", source: "system", action: "hold" },
      ],
    };
  return clean("publish");
}

let moderateSpy: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  await env.DB.batch(
    [
      "chat_members",
      "chat_follows",
      "chat_rooms",
      "chat_read_markers",
      "chat_room_prefs",
      "chat_author_courses",
      "sync_docs",
      "sync_heads",
      "counters",
      "sessions",
      "moderation_decisions",
      "moderation_queue",
      "users",
    ].map((t) => env.DB.prepare(`DELETE FROM ${t}`)),
  );
  await putCatalog();
  moderateSpy = vi
    .spyOn(chatScreening, "moderate")
    .mockImplementation(fakeModerate);
  opened.length = 0;
});

afterEach(() => {
  for (const client of opened) client.close();
  vi.restoreAllMocks();
});

// ---------- people, plans and sockets ----------

const worker = createWorker({ fetch: () => new Response("app") });
const ctx = createExecutionContext();

function testEnv(level: "on" | "read" | "off" = "on"): Env {
  return { ...env, CHAT_ENABLED: level } as unknown as Env;
}

const opened: Client[] = [];

class Person {
  constructor(
    readonly id: string,
    readonly cookie: string,
  ) {}

  api(path: string, body: unknown, level: "on" | "off" = "on") {
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
      { ...env, CHAT_ENABLED: level } as unknown as ApiEnv,
      { waitUntil: () => {} },
    );
  }

  /** Saves plans (and settings) through sync/push, which refreshes chat_members. */
  async push(plans: Plan[], settings?: SettingsDoc, baseRevs: number[] = []) {
    const docs = [
      ...plans.map((plan, i) => ({
        kind: "plan" as const,
        id: plan.id,
        baseRev: baseRevs[i] ?? 0,
        body: plan,
      })),
      ...(settings
        ? [
            {
              kind: "settings" as const,
              id: "settings",
              baseRev: 0,
              body: settings,
            },
          ]
        : []),
    ];
    const response = await this.api("sync/push", { docs });
    expect(response.status).toBe(200);
    return (await response.json()) as {
      results: { status: string; rev?: number }[];
    };
  }

  socketRequest(
    query = `term=${TERM}&course=${COURSE}`,
    headers: Record<string, string> = {},
  ): Request {
    return new Request(`${ORIGIN}/api/chat/socket?${query}`, {
      headers: {
        Upgrade: "websocket",
        Origin: ORIGIN,
        "Sec-Fetch-Site": "same-origin",
        Cookie: this.cookie,
        ...headers,
      },
    });
  }

  async connect(level: "on" | "read" = "on", query?: string): Promise<Client> {
    const response = await worker.fetch(
      this.socketRequest(query),
      testEnv(level),
      ctx,
    );
    expect(response.status).toBe(101);
    const ws = response.webSocket;
    if (!ws) throw new Error("no socket");
    const client = new Client(ws);
    opened.push(client);
    return client;
  }

  /** Connects and says hello for `rooms`; returns the client and its welcome. */
  async join(rooms: string[], level: "on" | "read" = "on") {
    const client = await this.connect(level);
    client.send({ type: "hello", protocol: CHAT_PROTOCOL_VERSION, rooms });
    const welcome = await client.next("welcome");
    return { client, welcome };
  }
}

async function signIn(userId: string): Promise<Person> {
  const user = findTestUser(userId);
  if (!user) throw new Error(`no test user ${userId}`);
  await upsertUser(env.DB, user.identity, new Date());
  const setCookie = await startSession(env.DB, userId, new Date());
  return new Person(userId, setCookie.split(";")[0] ?? "");
}

type Frame<T extends ChatServerFrame["type"]> = Extract<
  ChatServerFrame,
  { type: T }
>;

/** A socket that checks every frame against the protocol and queues it. */
class Client {
  readonly frames: ChatServerFrame[] = [];
  readonly closes: number[] = [];
  #taken = new Set<number>();
  #waiters: (() => void)[] = [];
  #req = 0;

  constructor(readonly ws: WebSocket) {
    ws.accept();
    ws.addEventListener("message", (event) => {
      // Protocol conformance: every server frame parses.
      const frame = ChatServerFrameSchema.parse(JSON.parse(String(event.data)));
      this.frames.push(frame);
      for (const wake of this.#waiters.splice(0)) wake();
    });
    ws.addEventListener("close", (event) => {
      this.closes.push(event.code);
      for (const wake of this.#waiters.splice(0)) wake();
    });
  }

  send(frame: ChatClientFrame | Record<string, unknown> | string) {
    this.ws.send(typeof frame === "string" ? frame : JSON.stringify(frame));
  }

  req(): string {
    return `r${++this.#req}`;
  }

  /** The next unread frame of a type (and matching `when`), waiting up to 5 s. */
  async next<T extends ChatServerFrame["type"]>(
    type: T,
    when: (f: Frame<T>) => boolean = () => true,
  ): Promise<Frame<T>> {
    const deadline = Date.now() + 5_000;
    for (;;) {
      const i = this.frames.findIndex(
        (f, n) => !this.#taken.has(n) && f.type === type && when(f as Frame<T>),
      );
      if (i >= 0) {
        this.#taken.add(i);
        return this.frames[i] as Frame<T>;
      }
      if (Date.now() > deadline)
        throw new Error(
          `no ${type} frame; got ${JSON.stringify(this.frames.map((f) => f.type))}`,
        );
      await new Promise<void>((resolve) => {
        this.#waiters.push(resolve);
        setTimeout(resolve, 100);
      });
    }
  }

  /** Waits for the next close. */
  async closed(): Promise<number> {
    const deadline = Date.now() + 5_000;
    while (this.closes.length === 0) {
      if (Date.now() > deadline) throw new Error("not closed");
      await new Promise((r) => setTimeout(r, 50));
    }
    return this.closes[0] ?? 0;
  }

  /** Frames of a type that arrived and weren't taken yet. */
  pending(type: ChatServerFrame["type"]): ChatServerFrame[] {
    return this.frames.filter((f, n) => !this.#taken.has(n) && f.type === type);
  }

  /** A round trip: every frame sent to this socket before it has arrived. */
  async flush(room = courseRoom): Promise<void> {
    const req = this.req();
    this.send({
      type: "history",
      req,
      room,
      thread: null,
      before: null,
      limit: 1,
    });
    await this.next("page", (f) => f.req === req);
  }

  async sendText(room: string, text: string, replyTo: string | null = null) {
    const req = this.req();
    this.send({ type: "send", req, room, text, replyTo });
    return this.next("ack", (f) => f.req === req);
  }

  async history(
    room: string,
    options: {
      thread?: string | null;
      before?: string | null;
      limit?: number;
    } = {},
  ) {
    const req = this.req();
    this.send({
      type: "history",
      req,
      room,
      thread: options.thread ?? null,
      before: options.before ?? null,
      limit: options.limit ?? 50,
    });
    return this.next("page", (f) => f.req === req);
  }

  async error(req: string) {
    return this.next("error", (f) => f.req === req);
  }

  close() {
    try {
      this.ws.close(1000, "done");
    } catch {
      // Already closed.
    }
  }
}

/** tstudent in 0101 (Brandt), tclassmate in 0201 (Moss), both following along. */
async function twoPeople() {
  const student = await signIn("tstudent");
  const classmate = await signIn("tclassmate");
  await student.push([
    aPlan({
      id: "plan_student_1",
      courses: [aPlanCourse({ courseCode: COURSE, sectionCode: "0101" })],
    }),
  ]);
  await classmate.push([
    aPlan({
      id: "plan_classmate_1",
      courses: [aPlanCourse({ courseCode: COURSE, sectionCode: "0201" })],
    }),
  ]);
  return { student, classmate };
}

const stub = () =>
  env.COURSE_CHAT.get(
    env.COURSE_CHAT.idFromName(courseRoom),
  ) as DurableObjectStub<CourseChat>;

/** Tables in the course object's SQLite. */
const objectTables = () =>
  runInDurableObject(stub(), (_instance, state) =>
    Number(
      state.storage.sql
        .exec("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table'")
        .one().n,
    ),
  );

/** Wipes the course object between tests: messages, meta and alarm. */
async function resetObject() {
  await runInDurableObject(stub(), async (_instance, state) => {
    await state.storage.deleteAlarm();
    await state.storage.deleteAll();
  });
  await evictDurableObject(stub(), { webSockets: "close" }).catch(() => {});
}

beforeEach(resetObject);

// ---------- the socket route ----------

describe("GET /api/chat/socket", () => {
  it("opens for a signed-in person on our origin", async () => {
    const student = await signIn("tstudent");
    const client = await student.connect();
    client.send({
      type: "hello",
      protocol: CHAT_PROTOCOL_VERSION,
      rooms: [courseRoom],
    });
    const welcome = await client.next("welcome");
    expect(welcome.you).toEqual({
      directoryId: "tstudent",
      name: "Test Student",
      picture: null,
    });
    expect(welcome.protocol).toBe(CHAT_PROTOCOL_VERSION);
  });

  it("refuses when Chat is off, signed out, cross-site, or not a WebSocket", async () => {
    const student = await signIn("tstudent");
    const status = async (request: Request, level: "on" | "off" = "on") =>
      (await worker.fetch(request, testEnv(level), ctx)).status;
    expect(await status(student.socketRequest(), "off")).toBe(503);
    expect(
      await status(
        new Request(`${ORIGIN}/api/chat/socket?term=${TERM}&course=${COURSE}`, {
          headers: { Upgrade: "websocket", Origin: ORIGIN },
        }),
      ),
    ).toBe(401);
    expect(
      await status(
        student.socketRequest(undefined, { Origin: "https://evil.example" }),
      ),
    ).toBe(403);
    expect(
      await status(
        student.socketRequest(undefined, { "Sec-Fetch-Site": "cross-site" }),
      ),
    ).toBe(403);
    expect(
      await status(
        new Request(`${ORIGIN}/api/chat/socket?term=${TERM}&course=${COURSE}`, {
          headers: { Origin: ORIGIN, Cookie: student.cookie },
        }),
      ),
    ).toBe(426);
  });

  it("checks the term and course", async () => {
    const student = await signIn("tstudent");
    const status = async (query: string) =>
      (await worker.fetch(student.socketRequest(query), testEnv(), ctx)).status;
    expect(await status("term=202701")).toBe(400);
    expect(await status(`term=${TERM}&course=cmsc351`)).toBe(400);
    expect(await status(`term=${TERM}&course=${COURSE}&extra=1`)).toBe(400);
    expect(await status(`term=202608&course=${COURSE}`)).toBe(404);
    expect(await status(`term=${TERM}&course=CMSC999`)).toBe(404);
  });

  it("limits sockets per person per hour", async () => {
    const student = await signIn("tstudent");
    await env.DB.prepare(
      "INSERT INTO counters (name, window_start, count) VALUES (?1, ?2, 600)",
    )
      .bind(
        "user:tstudent:chat/socket",
        new Date(Math.floor(Date.now() / 3_600_000) * 3_600_000).toISOString(),
      )
      .run();
    const response = await worker.fetch(
      student.socketRequest(),
      testEnv(),
      ctx,
    );
    expect(response.status).toBe(429);
  });
});

// ---------- hello and rooms ----------

describe("hello", () => {
  it("welcomes with the rooms you can read, their members and unread counts", async () => {
    const { student } = await twoPeople();
    const { welcome } = await student.join([
      courseRoom,
      brandtRoom,
      room0101,
      mossRoom,
      room0201,
      courseRoomId(TERM, "CMSC131"),
    ]);
    expect(welcome.rooms).toEqual([
      { room: courseRoom, members: 2, unread: 0, writable: true },
      { room: brandtRoom, members: 1, unread: 0, writable: true },
      { room: room0101, members: 1, unread: 0, writable: true },
    ]);
  });

  it("answers an old client, and nothing before a hello", async () => {
    const student = await signIn("tstudent");
    const client = await student.connect();
    client.send({ type: "typing", room: courseRoom });
    expect((await client.next("error")).code).toBe("bad-frame");
    client.send({
      type: "history",
      req: "early",
      room: courseRoom,
      thread: null,
      before: null,
      limit: 5,
    });
    expect(await client.error("early")).toMatchObject({ code: "bad-frame" });
    client.send({ type: "hello", protocol: 0, rooms: [courseRoom] });
    expect((await client.next("error")).code).toBe("bad-frame");
    client.send("not json");
    expect((await client.next("error")).code).toBe("bad-frame");
    client.send({
      type: "send",
      req: "bad",
      room: courseRoom,
      text: "",
      replyTo: null,
    });
    expect(await client.error("bad")).toMatchObject({ code: "bad-frame" });
  });

  it("stores nothing for a course until its first message", async () => {
    const { student } = await twoPeople();
    const { client } = await student.join([courseRoom, room0101]);
    const page = await client.history(courseRoom);
    expect(page.messages).toEqual([]);
    expect(await objectTables()).toBe(0);
    expect(
      await env.DB.prepare("SELECT COUNT(*) AS n FROM chat_rooms").first("n"),
    ).toBe(0);
  });
});

// ---------- sending and moderation ----------

describe("sending", () => {
  it("acks as checking, then publishes to the room", async () => {
    const { student, classmate } = await twoPeople();
    const a = await student.join([courseRoom]);
    const b = await classmate.join([courseRoom]);
    const ack = await a.client.sendText(courseRoom, "anyone at office hours?");
    expect(ack.message).toMatchObject({
      room: courseRoom,
      text: "anyone at office hours?",
      author: { directoryId: "tstudent", name: "Test Student" },
      moderation: { state: "held", reason: "checking" },
      replyTo: null,
      thread: null,
      reactions: {},
      editedAt: null,
    });
    const id = ack.message?.id ?? "";
    expect(await a.client.next("moderation", (f) => f.id === id)).toMatchObject(
      { moderation: { state: "visible" } },
    );
    const seen = await b.client.next("message", (f) => f.message.id === id);
    expect(seen.message.moderation).toEqual({ state: "visible" });
    expect(
      (await b.client.history(courseRoom)).messages.map((m) => m.id),
    ).toEqual([id]);
    expect(moderateSpy).toHaveBeenCalledWith(
      expect.anything(),
      {
        kind: "chat",
        text: "anyone at office hours?",
        context: { targetId: chatTargetId(TERM, COURSE, id), course: COURSE },
      },
      expect.anything(),
    );
    // The room's index row and the author's course, now that it has a message.
    expect(
      await env.DB.prepare(
        "SELECT room_id, kind, last_seq FROM chat_rooms",
      ).all(),
    ).toMatchObject({
      results: [{ room_id: courseRoom, kind: "course", last_seq: 1 }],
    });
    expect(
      await env.DB.prepare(
        "SELECT user_id, course_code FROM chat_author_courses",
      ).all(),
    ).toMatchObject({
      results: [{ user_id: "tstudent", course_code: COURSE }],
    });
    expect(await objectTables()).toBeGreaterThan(0);
  });

  it("holds graded work for its author only, until the owner approves", async () => {
    const { student, classmate } = await twoPeople();
    const a = await student.join([courseRoom]);
    const b = await classmate.join([courseRoom]);
    const ack = await a.client.sendText(courseRoom, "here you go [hold]");
    const id = ack.message?.id ?? "";
    expect(await a.client.next("moderation", (f) => f.id === id)).toMatchObject(
      {
        moderation: { state: "held", reason: "graded-work" },
      },
    );
    await b.client.flush();
    expect(b.client.pending("message")).toEqual([]);
    expect((await b.client.history(courseRoom)).messages).toEqual([]);
    expect((await a.client.history(courseRoom)).messages).toMatchObject([
      { id, moderation: { state: "held", reason: "graded-work" } },
    ]);
    expect(
      await env.DB.prepare("SELECT COUNT(*) AS n FROM chat_rooms").first("n"),
    ).toBe(0);

    // The owner approves (admin/moderation/resolve calls Chat's handler).
    const chat = moderationHandlers(env).chat;
    await chat?.(chatTargetId(TERM, COURSE, id), "publish");
    expect(await a.client.next("moderation", (f) => f.id === id)).toMatchObject(
      {
        moderation: { state: "visible" },
      },
    );
    expect(
      (await b.client.next("message", (f) => f.message.id === id)).message.text,
    ).toBe("here you go [hold]");
    // Idempotent: the same decision again tells nobody anything.
    await chat?.(chatTargetId(TERM, COURSE, id), "publish");
    // Undo puts it back on hold: classmates drop it.
    await chat?.(chatTargetId(TERM, COURSE, id), "hold");
    expect(await b.client.next("moderation", (f) => f.id === id)).toMatchObject(
      { moderation: { state: "removed" } },
    );
    expect(
      await a.client.next(
        "moderation",
        (f) => f.id === id && f.moderation.state === "held",
      ),
    ).toMatchObject({ moderation: { state: "held", reason: "flagged" } });
    await b.client.flush();
    expect(b.client.pending("moderation")).toEqual([]);
  });

  it("removes, and tells only the author", async () => {
    const { student, classmate } = await twoPeople();
    const a = await student.join([courseRoom]);
    const b = await classmate.join([courseRoom]);
    const ack = await a.client.sendText(courseRoom, "buy my notes [remove]");
    const id = ack.message?.id ?? "";
    expect(await a.client.next("moderation", (f) => f.id === id)).toMatchObject(
      {
        moderation: { state: "removed" },
      },
    );
    await b.client.flush();
    expect(b.client.pending("message")).toEqual([]);
    expect((await a.client.history(courseRoom)).messages).toEqual([]);
  });

  it("runs the real moderation service: a rule removes without a model", async () => {
    moderateSpy.mockRestore();
    const { student } = await twoPeople();
    const a = await student.join([courseRoom]);
    const ack = await a.client.sendText(courseRoom, `you ${SLURS[0]}`);
    const id = ack.message?.id ?? "";
    expect(await a.client.next("moderation", (f) => f.id === id)).toMatchObject(
      {
        moderation: { state: "removed" },
      },
    );
    const logged = await env.DB.prepare(
      "SELECT surface, ref, verdict FROM moderation_decisions",
    ).all();
    expect(logged.results).toEqual([
      {
        surface: "chat",
        ref: chatTargetId(TERM, COURSE, id),
        verdict: "reject",
      },
    ]);
  });

  it("keeps checking while the model is down, until the retry publishes", async () => {
    const { student, classmate } = await twoPeople();
    const a = await student.join([courseRoom]);
    const b = await classmate.join([courseRoom]);
    const ack = await a.client.sendText(
      courseRoom,
      "is the exam curved [retry]",
    );
    const id = ack.message?.id ?? "";
    await a.client.flush();
    expect(a.client.pending("moderation")).toEqual([]);
    // The moderation cron's retry passes and calls Chat's handler.
    await moderationHandlers(env).chat?.(
      chatTargetId(TERM, COURSE, id),
      "publish",
    );
    await b.client.next("message", (f) => f.message.id === id);
  });

  it("screens again from the alarm when moderation fails", async () => {
    const { student, classmate } = await twoPeople();
    const a = await student.join([courseRoom]);
    const b = await classmate.join([courseRoom]);
    const ack = await a.client.sendText(courseRoom, "hello there [throw]");
    const id = ack.message?.id ?? "";
    await a.client.flush();
    expect(a.client.pending("moderation")).toEqual([]);
    // The recheck comes due; this time the check answers.
    await runInDurableObject(stub(), (_i, state) => {
      state.storage.sql.exec("UPDATE messages SET check_after = 1");
    });
    moderateSpy.mockImplementation(async () => clean("publish"));
    const latest = vi
      .spyOn(chatScreening, "latestDecision")
      .mockResolvedValue(null);
    expect(await runDurableObjectAlarm(stub())).toBe(true);
    expect(latest).toHaveBeenCalled();
    await b.client.next("message", (f) => f.message.id === id);
    // And the retention alarm is back for later.
    expect(
      await runInDurableObject(stub(), (_i, state) => state.storage.getAlarm()),
    ).toBeGreaterThan(Date.now());
  });

  it("takes moderation's decision about the same text instead of screening twice", async () => {
    const { student, classmate } = await twoPeople();
    const a = await student.join([courseRoom]);
    const b = await classmate.join([courseRoom]);
    const ack = await a.client.sendText(
      courseRoom,
      "evicted mid-check [throw]",
    );
    const id = ack.message?.id ?? "";
    await runInDurableObject(stub(), (_i, state) => {
      state.storage.sql.exec("UPDATE messages SET check_after = 1");
    });
    vi.spyOn(chatScreening, "latestDecision").mockResolvedValue({
      decision: "publish",
      reasons: [],
      decidedAt: new Date().toISOString(),
    });
    moderateSpy.mockClear();
    await runDurableObjectAlarm(stub());
    expect(moderateSpy).not.toHaveBeenCalled();
    await b.client.next("message", (f) => f.message.id === id);
  });

  it("is idempotent per request id", async () => {
    const { student } = await twoPeople();
    const a = await student.join([courseRoom]);
    const frame = {
      type: "send",
      req: "same-req",
      room: courseRoom,
      text: "once",
      replyTo: null,
    } as const;
    a.client.send(frame);
    const first = await a.client.next("ack", (f) => f.req === "same-req");
    a.client.send(frame);
    const second = await a.client.next("ack", (f) => f.req === "same-req");
    expect(second.message?.id).toBe(first.message?.id);
    expect((await a.client.history(courseRoom)).messages).toHaveLength(1);
  });

  it("slows down past 10 messages in 30 seconds", async () => {
    const { student } = await twoPeople();
    const a = await student.join([courseRoom]);
    for (let i = 0; i < 10; i++)
      await a.client.sendText(courseRoom, `message ${i}`);
    const req = a.client.req();
    a.client.send({
      type: "send",
      req,
      room: courseRoom,
      text: "one more",
      replyTo: null,
    });
    const error = await a.client.error(req);
    expect(error.code).toBe("slow-down");
    expect(error.retryAfter).toBeGreaterThanOrEqual(1);
    expect(error.retryAfter).toBeLessThanOrEqual(30);
  });

  it("holds back someone the owner blocked", async () => {
    const { student } = await twoPeople();
    await env.DB.prepare(
      "UPDATE users SET chat_blocked_until = ?1 WHERE id = 'tstudent'",
    )
      .bind(new Date(Date.now() + 3_600_000).toISOString())
      .run();
    const a = await student.join([courseRoom]);
    const req = a.client.req();
    a.client.send({
      type: "send",
      req,
      room: courseRoom,
      text: "hi",
      replyTo: null,
    });
    const error = await a.client.error(req);
    expect(error.code).toBe("slow-down");
    expect(error.retryAfter).toBeGreaterThan(3_500);
  });

  it("keeps professor and section rooms to their sections", async () => {
    const { student } = await twoPeople();
    const a = await student.join([courseRoom]);
    const req = a.client.req();
    a.client.send({
      type: "send",
      req,
      room: room0201,
      text: "hi",
      replyTo: null,
    });
    expect((await a.client.error(req)).code).toBe("not-a-member");
    const page = a.client.req();
    a.client.send({
      type: "history",
      req: page,
      room: mossRoom,
      thread: null,
      before: null,
      limit: 5,
    });
    expect((await a.client.error(page)).code).toBe("not-a-member");
    // A section room of your own works, and its index row carries its section.
    const ack = await a.client.sendText(room0101, "0101 people: study group?");
    await a.client.next("moderation", (f) => f.id === ack.message?.id);
    expect(
      await env.DB.prepare(
        "SELECT kind, sections FROM chat_rooms WHERE room_id = ?1",
      )
        .bind(room0101)
        .first(),
    ).toEqual({ kind: "section", sections: '["0101"]' });
  });

  it("lets people read but not send while Chat is read-only", async () => {
    const { student } = await twoPeople();
    const { client, welcome } = await student.join([courseRoom], "read");
    expect(welcome.rooms[0]?.writable).toBe(false);
    const req = client.req();
    client.send({
      type: "send",
      req,
      room: courseRoom,
      text: "hi",
      replyTo: null,
    });
    expect((await client.error(req)).code).toBe("read-only");
  });
});

// ---------- edits, deletes, reactions, threads, typing, read markers ----------

describe("a conversation", () => {
  async function published(
    client: Client,
    room: string,
    text: string,
    replyTo: string | null = null,
  ) {
    const ack = await client.sendText(room, text, replyTo);
    const id = ack.message?.id ?? "";
    await client.next("moderation", (f) => f.id === id);
    return id;
  }

  it("screens an edit again, hiding it from classmates meanwhile", async () => {
    const { student, classmate } = await twoPeople();
    const a = await student.join([courseRoom]);
    const b = await classmate.join([courseRoom]);
    const id = await published(a.client, courseRoom, "first try");
    await b.client.next("message", (f) => f.message.id === id);

    const req = a.client.req();
    a.client.send({
      type: "edit",
      req,
      room: courseRoom,
      id,
      text: "second try",
    });
    const ack = await a.client.next("ack", (f) => f.req === req);
    expect(ack.message).toMatchObject({
      text: "second try",
      moderation: { state: "held", reason: "checking" },
    });
    expect(ack.message?.editedAt).not.toBeNull();
    expect(await b.client.next("moderation", (f) => f.id === id)).toMatchObject(
      {
        moderation: { state: "removed" },
      },
    );
    const again = await b.client.next("message", (f) => f.message.id === id);
    expect(again.message.text).toBe("second try");

    const theirs = b.client.req();
    b.client.send({
      type: "edit",
      req: theirs,
      room: courseRoom,
      id,
      text: "mine now",
    });
    expect((await b.client.error(theirs)).code).toBe("not-yours");
  });

  it("deletes at once, for everyone", async () => {
    const { student, classmate } = await twoPeople();
    const a = await student.join([courseRoom]);
    const b = await classmate.join([courseRoom]);
    const id = await published(a.client, courseRoom, "oops");
    await b.client.next("message", (f) => f.message.id === id);
    const req = a.client.req();
    a.client.send({ type: "delete", req, room: courseRoom, id });
    expect(
      (await a.client.next("ack", (f) => f.req === req)).message,
    ).toBeNull();
    expect(await b.client.next("deleted")).toEqual({
      type: "deleted",
      room: courseRoom,
      id,
    });
    expect((await b.client.history(courseRoom)).messages).toEqual([]);
    const again = a.client.req();
    a.client.send({ type: "delete", req: again, room: courseRoom, id });
    expect((await a.client.error(again)).code).toBe("not-found");
  });

  it("reacts and takes a reaction back", async () => {
    const { student, classmate } = await twoPeople();
    const a = await student.join([courseRoom]);
    const b = await classmate.join([courseRoom]);
    const id = await published(a.client, courseRoom, "exam moved to Friday");
    const req = b.client.req();
    b.client.send({
      type: "react",
      req,
      room: courseRoom,
      id,
      reaction: "check",
      on: true,
    });
    expect(
      (await b.client.next("ack", (f) => f.req === req)).message?.reactions,
    ).toEqual({
      check: ["tclassmate"],
    });
    expect(await a.client.next("reactions")).toEqual({
      type: "reactions",
      room: courseRoom,
      id,
      reactions: { check: ["tclassmate"] },
    });
    b.client.send({
      type: "react",
      req: b.client.req(),
      room: courseRoom,
      id,
      reaction: "check",
      on: false,
    });
    expect((await a.client.next("reactions")).reactions).toEqual({});
  });

  it("keeps threads one level deep, with a summary on the first message", async () => {
    const { student, classmate } = await twoPeople();
    const a = await student.join([courseRoom]);
    const b = await classmate.join([courseRoom]);
    const root = await published(
      a.client,
      courseRoom,
      "who's in the Tuesday lab?",
    );
    const reply = await published(b.client, courseRoom, "me", root);
    const rootUpdate = await a.client.next(
      "message",
      (f) => f.message.id === root && f.message.thread !== null,
    );
    expect(rootUpdate.message.thread?.count).toBe(1);
    // A reply to a reply joins the same thread.
    const nested = await published(a.client, courseRoom, "same", reply);
    const page = await a.client.history(courseRoom, { thread: root });
    expect(page.messages.map((m) => [m.id, m.replyTo])).toEqual([
      [reply, root],
      [nested, root],
    ]);
    const top = await a.client.history(courseRoom);
    expect(top.messages.map((m) => m.id)).toEqual([root]);
    expect(top.messages[0]?.thread?.count).toBe(2);
  });

  it("pages history oldest first, before a message", async () => {
    const { student } = await twoPeople();
    const a = await student.join([courseRoom]);
    const ids: string[] = [];
    for (let i = 0; i < 5; i++)
      ids.push(await published(a.client, courseRoom, `m${i}`));
    const newest = await a.client.history(courseRoom, { limit: 2 });
    expect(newest.messages.map((m) => m.id)).toEqual(ids.slice(3));
    expect(newest.more).toBe(true);
    const older = await a.client.history(courseRoom, {
      limit: 10,
      before: ids[3],
    });
    expect(older.messages.map((m) => m.id)).toEqual(ids.slice(0, 3));
    expect(older.more).toBe(false);
  });

  it("shows typing to others, at most every couple of seconds", async () => {
    const { student, classmate } = await twoPeople();
    const a = await student.join([courseRoom]);
    const b = await classmate.join([courseRoom]);
    a.client.send({ type: "typing", room: courseRoom });
    a.client.send({ type: "typing", room: courseRoom });
    expect(await b.client.next("typing")).toEqual({
      type: "typing",
      room: courseRoom,
      who: { directoryId: "tstudent", name: "Test Student" },
    });
    await b.client.flush();
    expect(b.client.pending("typing")).toEqual([]);
    await a.client.flush();
    expect(a.client.pending("typing")).toEqual([]);
  });

  it("counts unread from read markers, in the socket and chat/unread", async () => {
    const { student, classmate } = await twoPeople();
    const a = await student.join([courseRoom]);
    const first = await published(a.client, courseRoom, "one");
    await published(a.client, courseRoom, "two");
    const unreadFor = async (p: typeof student): Promise<ChatUnreadResult> =>
      ChatUnreadResultSchema.parse(
        await (await p.api("chat/unread", { termId: TERM })).json(),
      );
    expect((await unreadFor(classmate)).rooms).toMatchObject([
      {
        room: courseRoom,
        courseCode: COURSE,
        lastSeq: 2,
        unread: 2,
        muted: false,
      },
    ]);
    const b = await classmate.join([courseRoom]);
    expect(b.welcome.rooms[0]?.unread).toBe(2);
    b.client.send({ type: "read", room: courseRoom, upTo: first });
    await b.client.flush();
    expect((await unreadFor(classmate)).rooms[0]?.unread).toBe(1);
    const again = await classmate.join([courseRoom]);
    expect(again.welcome.rooms[0]?.unread).toBe(1);
  });

  it("survives the object hibernating between frames", async () => {
    const { student, classmate } = await twoPeople();
    const a = await student.join([courseRoom]);
    const b = await classmate.join([courseRoom]);
    await evictDurableObject(stub());
    const id = await published(a.client, courseRoom, "still here?");
    await b.client.next("message", (f) => f.message.id === id);
  });
});

// ---------- retention ----------

describe("retention", () => {
  it("turns rooms read-only 10 days after classes end", async () => {
    await putCatalog(calendarEndingIn(-11));
    const { student } = await twoPeople();
    const { client, welcome } = await student.join([courseRoom]);
    expect(welcome.rooms[0]?.writable).toBe(false);
    const req = client.req();
    client.send({
      type: "send",
      req,
      room: courseRoom,
      text: "hi",
      replyTo: null,
    });
    expect((await client.error(req)).code).toBe("read-only");
    expect(await objectTables()).toBe(0);
  });

  it("sets its alarm with the first message, then closes sockets when read-only", async () => {
    await putCatalog(calendarEndingIn(5));
    const { student } = await twoPeople();
    const a = await student.join([courseRoom]);
    const ack = await a.client.sendText(courseRoom, "last week of class!");
    const alarm = () =>
      runInDurableObject(stub(), (_i, state) => state.storage.getAlarm());
    // First the message's recheck time, in case its screening dies midway.
    expect(await alarm()).toBeLessThanOrEqual(Date.now() + 2 * 60_000);
    await a.client.next("moderation", (f) => f.id === ack.message?.id);
    // Nothing left to recheck: the alarm moves to the read-only time.
    expect(await runDurableObjectAlarm(stub())).toBe(true);
    const readOnlyAt = await alarm();
    // Midnight after the 10th day past the last day of classes.
    expect(readOnlyAt).toBeGreaterThan(Date.now() + 15 * DAY);
    expect(readOnlyAt).toBeLessThan(Date.now() + 17 * DAY);

    await runInDurableObject(stub(), (_i, state) => {
      state.storage.sql.exec(
        "UPDATE meta SET value = ?1 WHERE key = 'read_only_at'",
        String(Date.now() - 1),
      );
    });
    await runDurableObjectAlarm(stub());
    expect(await a.client.closed()).toBe(CHAT_CLOSE.readOnly);
    const again = await student.join([courseRoom]);
    expect(again.welcome.rooms[0]?.writable).toBe(false);
    expect((await again.client.history(courseRoom)).messages).toHaveLength(1);
    // Next: deletion, 60 days on.
    const deleteAt = await runInDurableObject(stub(), (_i, state) =>
      state.storage.getAlarm(),
    );
    expect(deleteAt).toBeGreaterThan(Date.now() + 59 * DAY);
  });

  it("deletes the object's storage and the course's D1 rows 60 days after", async () => {
    const { student, classmate } = await twoPeople();
    const a = await student.join([courseRoom]);
    const b = await classmate.join([courseRoom]);
    const ack = await a.client.sendText(courseRoom, "see you all");
    await a.client.next("moderation", (f) => f.id === ack.message?.id);
    b.client.send({
      type: "read",
      room: courseRoom,
      upTo: ack.message?.id ?? "",
    });
    await b.client.flush();
    await classmate.api("chat/mute", {
      termId: TERM,
      courseCode: COURSE,
      roomId: courseRoom,
      muted: true,
    });
    const count = (table: string) =>
      env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<number>("n");
    expect(await count("chat_rooms")).toBe(1);
    expect(await count("chat_read_markers")).toBe(1);

    await runInDurableObject(stub(), (_i, state) => {
      state.storage.sql.exec(
        "UPDATE meta SET value = '1' WHERE key IN ('read_only_at', 'delete_at')",
      );
    });
    await runDurableObjectAlarm(stub());
    expect(await a.client.closed()).toBe(CHAT_CLOSE.deleted);
    expect(await objectTables()).toBe(0);
    for (const table of [
      "chat_rooms",
      "chat_read_markers",
      "chat_room_prefs",
      "chat_author_courses",
    ])
      expect(await count(table), table).toBe(0);
    // Membership describes people, not rooms: it stays.
    expect(await count("chat_members")).toBe(2);
  });
});

// ---------- chat_members from sync pushes ----------

describe("chat_members", () => {
  const members = async (userId: string) =>
    (
      await env.DB.prepare(
        "SELECT term_id, course_code, section_code FROM chat_members WHERE user_id = ?1 ORDER BY term_id, course_code",
      )
        .bind(userId)
        .all()
    ).results;

  it("follows the chat plan: the first tab, or the settings doc's choice", async () => {
    const student = await signIn("tstudent");
    const planA = aPlan({
      id: "plan_a_000001",
      order: 0,
      courses: [
        aPlanCourse({ courseCode: COURSE, sectionCode: "0101" }),
        aSavedCourse("MUSC130"),
      ],
    });
    const planB = aPlan({
      id: "plan_b_000001",
      name: "Plan B",
      order: 1,
      courses: [aPlanCourse({ courseCode: COURSE, sectionCode: "0201" })],
    });
    const fall = aPlan({
      id: "plan_fall_001",
      termId: "202608",
      courses: [aPlanCourse({ courseCode: "ENGL101", sectionCode: "0303" })],
    });
    await student.push([planA, planB, fall]);
    expect(await members("tstudent")).toEqual(
      [
        { term_id: TERM, course_code: COURSE, section_code: "0101" },
        { term_id: TERM, course_code: "MUSC130", section_code: "" },
        { term_id: "202608", course_code: "ENGL101", section_code: "0303" },
      ].sort(
        (x, y) =>
          x.term_id.localeCompare(y.term_id) ||
          x.course_code.localeCompare(y.course_code),
      ),
    );

    // Choosing Plan B for chat moves this term only.
    await student.push([], aSettingsDoc({ chatPlans: { [TERM]: planB.id } }));
    expect(await members("tstudent")).toEqual([
      { term_id: "202608", course_code: "ENGL101", section_code: "0303" },
      { term_id: TERM, course_code: COURSE, section_code: "0201" },
    ]);

    // Deleting the chosen plan falls back to the first tab.
    const deleted = await student.api("sync/push", {
      docs: [{ kind: "plan", id: planB.id, baseRev: 2, body: null }],
    });
    expect(
      ((await deleted.json()) as { results: { status: string }[] }).results[0]
        ?.status,
    ).toBe("ok");
    expect(await members("tstudent")).toEqual([
      { term_id: "202608", course_code: "ENGL101", section_code: "0303" },
      { term_id: TERM, course_code: COURSE, section_code: "0101" },
      { term_id: TERM, course_code: "MUSC130", section_code: "" },
    ]);
  });

  it("leaves membership alone when nothing was saved", async () => {
    const student = await signIn("tstudent");
    const plan = aPlan({
      id: "plan_a_000001",
      courses: [aPlanCourse({ courseCode: COURSE, sectionCode: "0101" })],
    });
    await student.push([plan]);
    // A conflict (stale base rev) saves nothing.
    const changed = {
      ...plan,
      courses: [aPlanCourse({ courseCode: COURSE, sectionCode: "0201" })],
    };
    const result = await student.push([changed], undefined, [0]);
    expect(result.results[0]?.status).toBe("conflict");
    expect(await members("tstudent")).toEqual([
      { term_id: TERM, course_code: COURSE, section_code: "0101" },
    ]);
  });
});

// ---------- chat/* routes ----------

describe("chat routes", () => {
  it("follow, unfollow and mute", async () => {
    const { student } = await twoPeople();
    const a = await student.join([courseRoomId(TERM, COURSE)]);
    const ack = await a.client.sendText(courseRoom, "hi all");
    await a.client.next("moderation", (f) => f.id === ack.message?.id);
    // Someone with CMSC351 in no plan sees its course room once they follow it.
    const admin = await signIn("tadmin");
    const rooms = async () =>
      ChatUnreadResultSchema.parse(
        await (await admin.api("chat/unread", { termId: TERM })).json(),
      ).rooms;
    expect(await rooms()).toEqual([]);
    expect(
      await (
        await admin.api("chat/follow", { termId: TERM, courseCode: COURSE })
      ).json(),
    ).toEqual({ status: "ok" });
    expect(
      await (
        await admin.api("chat/follow", { termId: TERM, courseCode: COURSE })
      ).json(),
    ).toEqual({ status: "ok" });
    expect((await rooms()).map((r) => r.room)).toEqual([courseRoom]);
    expect(
      await (
        await admin.api("chat/mute", {
          termId: TERM,
          courseCode: COURSE,
          roomId: courseRoom,
          muted: true,
        })
      ).json(),
    ).toEqual({ status: "ok" });
    expect((await rooms())[0]?.muted).toBe(true);
    await admin.api("chat/unfollow", { termId: TERM, courseCode: COURSE });
    expect(await rooms()).toEqual([]);
    // A room from another course is refused.
    const bad = await admin.api("chat/mute", {
      termId: TERM,
      courseCode: "CMSC131",
      roomId: courseRoom,
      muted: true,
    });
    expect(bad.status).toBe(400);
  });

  it("lists members of rooms you can read", async () => {
    const { student } = await twoPeople();
    const list = async (roomId: string): Promise<ChatMembersResult> =>
      ChatMembersResultSchema.parse(
        await (
          await student.api("chat/members", {
            termId: TERM,
            courseCode: COURSE,
            roomId,
          })
        ).json(),
      );
    expect(await list(courseRoom)).toEqual({
      status: "ok",
      total: 2,
      members: [
        { directoryId: "tclassmate", name: "Test Classmate", picture: null },
        { directoryId: "tstudent", name: "Test Student", picture: null },
      ],
    });
    expect(await list(brandtRoom)).toEqual({
      status: "ok",
      total: 1,
      members: [
        { directoryId: "tstudent", name: "Test Student", picture: null },
      ],
    });
    expect(await list(room0201)).toEqual({ status: "not-a-member" });
    expect(
      ChatMembersResultSchema.parse(
        await (
          await student.api("chat/members", {
            termId: TERM,
            courseCode: "CMSC999",
            roomId: courseRoomId(TERM, "CMSC999"),
          })
        ).json(),
      ),
    ).toEqual({ status: "not-found" });
  });

  it("are off with Chat", async () => {
    const student = await signIn("tstudent");
    expect(
      (await student.api("chat/unread", { termId: TERM }, "off")).status,
    ).toBe(503);
  });
});
