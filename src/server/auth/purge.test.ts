// Account deletion's purge (V2.md §4.7) against the real schema, D1, R2 and
// CourseChat objects: an account with rows in every table it can reach is
// gone after its week, nothing anywhere still names it, a neighbour's data
// is untouched, a run that dies midway is finished by the next, and an
// account still in its week is left alone.
import { evictDurableObject, runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { courseRoomId } from "~/core/schema";
import {
  aFourYear,
  anIdentity,
  aPlan,
  aSettingsDoc,
  aTodoItem,
} from "~/fixtures";
import { runDailyJob } from "~/jobs/daily";
import type { CourseChat } from "../chat/course-chat";
import { chatTargetId } from "../chat/moderation-handler";
import { ObjectStore } from "../chat/object-store";
import { PURGED_REPORTER_PREFIX } from "../moderation/store";
import {
  accountStatements,
  PURGE_LEDGER,
  type PurgeEnv,
  purgeDueAccounts,
  SYSTEM_TABLES,
} from "./purge";
import { markDeleting, upsertUser } from "./store";

const TERM = "202701";
const COURSES = ["CMSC131", "CMSC351"] as const;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = new Date("2026-10-10T13:07:00.000Z");

/** Purged at NOW. */
const GONE = "zgone";
/** Deleted, but still in the week: kept. */
const GRACE = "zgrace";
/** Never deleted: a classmate whose data must survive. */
const KEEP = "zkeep";

const chat = (course: string) =>
  env.COURSE_CHAT.get(
    env.COURSE_CHAT.idFromName(courseRoomId(TERM, course)),
  ) as DurableObjectStub<CourseChat>;

/** Every table of ours in D1, from the live schema. */
async function ourTables(): Promise<string[]> {
  const { results } = await env.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  ).all<{ name: string }>();
  return results.map((r) => r.name).filter((n) => !SYSTEM_TABLES.includes(n));
}

/** Rows anywhere in D1 with `needle` in any column, as "table: n". */
async function rowsMentioning(needle: string): Promise<string[]> {
  const found: string[] = [];
  for (const table of await ourTables()) {
    const { results } = await env.DB.prepare(
      `SELECT name FROM pragma_table_info('${table}')`,
    ).all<{ name: string }>();
    const where = results
      .map((c) => `CAST("${c.name}" AS TEXT) LIKE '%' || ?1 || '%'`)
      .join(" OR ");
    const n = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`,
    )
      .bind(needle)
      .first<number>("n");
    if (n) found.push(`${table}: ${n}`);
  }
  return found;
}

/** Messages, reactions and sends in a course's object that name `userId`. */
function chatRowsOf(course: string, userId: string): Promise<number> {
  return runInDurableObject(chat(course), (_i, state) => {
    const tables = state.storage.sql
      .exec("SELECT name FROM sqlite_master WHERE type = 'table'")
      .toArray()
      .map((r) => String(r.name));
    if (!tables.includes("messages")) return 0;
    return Number(
      state.storage.sql
        .exec(
          `SELECT
             (SELECT COUNT(*) FROM messages WHERE author_id = ?1 OR author_name LIKE '%' || ?1 || '%')
           + (SELECT COUNT(*) FROM reactions WHERE user_id = ?1)
           + (SELECT COUNT(*) FROM sends WHERE author_id = ?1) AS n`,
          userId,
        )
        .one().n,
    );
  });
}

/**
 * A course's object with a message from each person, each reacting to the
 * other's, as if they'd chatted. Evicted after, so the next call wakes a
 * fresh instance that sees the tables.
 */
async function seedChat(course: string, people: readonly string[]) {
  await runInDurableObject(chat(course), (_i, state) => {
    const store = new ObjectStore(state.storage);
    store.setMeta("term_id", TERM);
    store.setMeta("course_code", course);
    const room = courseRoomId(TERM, course);
    const ids = people.map((person, n) => {
      const at = new Date(NOW.getTime() - (10 - n) * 60_000);
      const row = store.insertMessage({
        id: `01JAAAAAAAAAAAAAAAAAAAAA${n}${course.slice(-1)}`,
        room_id: room,
        author_id: person,
        author_name: `Name ${person}`,
        body: "see you in lecture",
        reply_to: null,
        status: "visible",
        held_reason: null,
        client_req: `req-${n}`,
        created_at: at.toISOString(),
        edited_at: null,
        check_after: null,
      });
      store.logSend(person, at.getTime(), 0);
      return row.id;
    });
    people.forEach((person, n) => {
      const other = ids[(n + 1) % ids.length];
      if (other)
        store.setReaction(other, "check", person, true, NOW.toISOString());
    });
  });
  await evictDurableObject(chat(course)).catch(() => {});
  for (const person of people)
    await env.DB.prepare(
      "INSERT INTO chat_author_courses (user_id, term_id, course_code) VALUES (?1, ?2, ?3) ON CONFLICT DO NOTHING",
    )
      .bind(person, TERM, course)
      .run();
}

/** One person with a row in every table that can hold their data. */
async function seedAccount(id: string, n: number) {
  // Recent enough that the daily job's other chores (tombstones) keep it.
  const at = new Date(NOW.getTime() - 20 * DAY).toISOString();
  for (const [hd, sub] of [
    ["terpmail.umd.edu", `1${id}`],
    ["umd.edu", `2${id}`],
  ] as const)
    await upsertUser(
      env.DB,
      anIdentity({
        directoryId: id,
        email: `${id}@${hd}`,
        hd,
        name: `Name ${id}`,
        sub,
      }),
      new Date(at),
    );
  const key = `avatars/${id}/0123456789abcdef.png`;
  await env.USER_CONTENT.put(key, new Uint8Array([1, 2, 3]));
  const plan = aPlan({ id: `plan_${id}` });
  const fourYear = aFourYear({ id: `fouryear_${id}` });
  const item = aTodoItem();
  await env.DB.batch(
    [
      ["UPDATE users SET picture_key = ?2 WHERE id = ?1", id, key],
      [
        `INSERT INTO sessions (id_hash, user_id, created_at, last_seen_at, expires_at)
         VALUES (?1, ?2, ?3, ?3, ?4)`,
        `hash-${id}`,
        id,
        at,
        new Date(NOW.getTime() + 30 * DAY).toISOString(),
      ],
      [
        `INSERT INTO sync_docs (user_id, kind, doc_id, term_id, rev, deleted, body, updated_at) VALUES
           (?1, 'plan', ?2, ?3, 1, 0, ?4, ?7),
           (?1, 'settings', 'settings', NULL, 2, 0, ?5, ?7),
           (?1, 'four-year', ?6, NULL, 3, 0, ?8, ?7),
           (?1, 'plan', 'plan_deleted', ?3, 4, 1, NULL, ?7)`,
        id,
        plan.id,
        TERM,
        JSON.stringify(plan),
        JSON.stringify(aSettingsDoc()),
        fourYear.id,
        at,
        JSON.stringify(fourYear),
      ],
      ["INSERT INTO sync_heads (user_id, head) VALUES (?1, 4)", id],
      [
        "INSERT INTO chat_members (user_id, term_id, course_code, section_code) VALUES (?1, ?2, 'CMSC351', '0101')",
        id,
        TERM,
      ],
      [
        "INSERT INTO chat_follows (user_id, term_id, course_code, created_at) VALUES (?1, ?2, 'CMSC131', ?3)",
        id,
        TERM,
        at,
      ],
      [
        "INSERT INTO chat_read_markers (user_id, term_id, course_code, room_id, seq) VALUES (?1, ?2, 'CMSC351', ?3, 1)",
        id,
        TERM,
        courseRoomId(TERM, "CMSC351"),
      ],
      [
        "INSERT INTO chat_room_prefs (user_id, term_id, course_code, room_id, muted) VALUES (?1, ?2, 'CMSC351', ?3, 1)",
        id,
        TERM,
        courseRoomId(TERM, "CMSC351"),
      ],
      [
        `INSERT INTO reviews (id, author_id, instructor_id, reviewed_name, course, rating, body,
           text_hash, status, created_at, published_at, updated_at)
         VALUES (?2, ?1, 'ada-brandt', 'Ada Brandt', 'CMSC351', 5, 'Clear lectures and fair exams, and office hours help a lot.',
           ?2, 'published', ?3, ?3, ?3)`,
        id,
        `review-${n}`,
        at,
      ],
      [
        `INSERT INTO author_stops (id, surface, user_id, until, created_at)
         VALUES (?2, 'chat', ?1, ?3, ?3)`,
        id,
        `stop-${n}`,
        at,
      ],
      [
        `INSERT INTO reports (surface, ref, reporter_id, reason, note, created_at)
         VALUES ('chat', ?2, ?1, 'off-topic', NULL, ?3)`,
        id,
        chatTargetId(TERM, "CMSC351", "01JAAAAAAAAAAAAAAAAAAAAAXX"),
        at,
      ],
      [
        `INSERT INTO todo_feeds (user_id, source, url_enc, status, created_at, next_fetch_at, last_opened_at)
         VALUES (?1, 'elms', 'v1.k.iv.ct', 'active', ?2, ?2, ?2)`,
        id,
        at,
      ],
      [
        `INSERT INTO todo_items (user_id, uid, source, title, course_label, course_code, section_code,
           kind, due_at, due_date, link, first_seen_at, updated_at)
         VALUES (?1, ?2, 'elms', ?3, ?4, ?5, ?6, 'assignment', ?7, ?8, ?9, ?10, ?10)`,
        id,
        item.uid,
        item.title,
        item.courseLabel,
        item.courseCode,
        item.sectionCode,
        item.dueAt,
        item.dueDate,
        item.link,
        at,
      ],
      [
        "INSERT INTO todo_done (user_id, uid, done_at) VALUES (?1, ?2, ?3)",
        id,
        item.uid,
        at,
      ],
      [
        `INSERT INTO todo_tasks (user_id, uid, title, course_code, due_at, due_date, created_at, updated_at)
         VALUES (?1, 'own-reading-group-0001', 'Read chapter 4 with the study group', 'CMSC351', NULL, ?2, ?3, ?3)`,
        id,
        item.dueDate,
        at,
      ],
      [
        "INSERT INTO todo_hidden (user_id, course_key, hidden_at) VALUES (?1, 'Terps Robotics Club', ?2)",
        id,
        at,
      ],
      [
        `INSERT INTO seat_watches (user_id, term_id, section_key, created_at)
         VALUES (?1, ?2, 'CMSC351-0101', ?3)`,
        id,
        TERM,
        at,
      ],
      [
        `INSERT INTO seat_alert_sends (user_id, term_id, section_key, channel, dedupe_key, status, sent_at)
         VALUES (?1, ?2, 'CMSC351-0101', 'email', ?3, 'sent', ?4)`,
        id,
        TERM,
        `seat-open:${id}:${TERM}:CMSC351-0101:email`,
        at,
      ],
      [
        `INSERT INTO feedback (id, kind, product, path, text, host, user_id, created_at, updated_at)
         VALUES (?2, 'bug', 'schedule', '/schedule', 'The calendar jumps when I drag a block.', 'terpsicle.com', ?1, ?3, ?3)`,
        id,
        `feedback-${n}`,
        at,
      ],
      [
        `INSERT INTO calendar_feeds (user_id, token_hash, nonce, created_at, last_fetched_at)
         VALUES (?1, ?2, ?3, ?4, ?4)`,
        id,
        `feed-hash-${id}`,
        `feed-nonce-${n}`,
        at,
      ],
      [
        "INSERT INTO counters (name, window_start, count) VALUES (?1, ?2, 3)",
        `user:${id}:reviews/submit`,
        new Date(NOW.getTime() - DAY).toISOString(),
      ],
    ].map(([sql, ...params]) => env.DB.prepare(String(sql)).bind(...params)),
  );
}

beforeEach(async () => {
  await env.DB.batch(
    [...(await ourTables())]
      .reverse()
      .map((t) => env.DB.prepare(`DELETE FROM ${t}`)),
  );
  for (const course of COURSES) {
    await runInDurableObject(chat(course), async (_i, state) => {
      await state.storage.deleteAlarm();
      await state.storage.deleteAll();
    });
    await evictDurableObject(chat(course)).catch(() => {});
  }
  const listed = await env.USER_CONTENT.list();
  if (listed.objects.length > 0)
    await env.USER_CONTENT.delete(listed.objects.map((o) => o.key));

  await env.DB.prepare(
    "INSERT INTO instructors (id, name, created_at) VALUES ('ada-brandt', 'Ada Brandt', ?1)",
  )
    .bind(NOW.toISOString())
    .run();
  for (const [n, id] of [GONE, GRACE, KEEP].entries()) await seedAccount(id, n);
  for (const course of COURSES) await seedChat(course, [GONE, KEEP, GRACE]);
  await markDeleting(env.DB, GONE, new Date(NOW.getTime() - 1000));
  await markDeleting(env.DB, GRACE, new Date(NOW.getTime() + DAY));
});

describe("the ledger", () => {
  it("lists every table in migrations/, and only those", async () => {
    expect(Object.keys(PURGE_LEDGER).sort()).toEqual(await ourTables());
  });

  it("purges every table whose rows can name a person", async () => {
    // A column that can hold a user id or an address, in a table the purge
    // leaves untouched, would be a leak.
    for (const table of await ourTables()) {
      const { results } = await env.DB.prepare(
        `SELECT name FROM pragma_table_info('${table}')`,
      ).all<{ name: string }>();
      const personal = results.some((c) =>
        /(^|_)(user_id|author_id|reporter_id|email)$/.test(c.name),
      );
      const what: string = PURGE_LEDGER[table as keyof typeof PURGE_LEDGER];
      if (personal) expect(what, table).not.toMatch(/^untouched/);
    }
  });
});

describe("the daily purge", () => {
  it("leaves nothing of an account past its week, anywhere", async () => {
    const others = new Map<string, string[]>();
    for (const id of [KEEP, GRACE]) others.set(id, await rowsMentioning(id));
    await runDailyJob({ env: env as Env, now: NOW });

    // No row in D1 names them, by directory ID or address.
    expect(await rowsMentioning(GONE)).toEqual([]);
    // Their chat messages, reactions and send log, in every course.
    for (const course of COURSES)
      expect(await chatRowsOf(course, GONE), course).toBe(0);
    expect(
      (await env.USER_CONTENT.list({ prefix: `avatars/${GONE}/` })).objects,
    ).toEqual([]);

    // Their review stays up with no author; their report stays, from nobody.
    expect(
      await env.DB.prepare(
        "SELECT author_id, status FROM reviews WHERE id = ?1",
      )
        .bind("review-0")
        .first(),
    ).toEqual({ author_id: null, status: "published" });
    const reporters = await env.DB.prepare(
      "SELECT reporter_id FROM reports ORDER BY reporter_id",
    ).all<{ reporter_id: string }>();
    expect(reporters.results.map((r) => r.reporter_id)).toEqual([
      expect.stringMatching(
        new RegExp(`^${PURGED_REPORTER_PREFIX}[0-9a-f]{24}$`),
      ),
      GRACE,
      KEEP,
    ]);

    // Everyone else's data is untouched.
    for (const id of [KEEP, GRACE]) {
      expect(await rowsMentioning(id), id).toEqual(others.get(id));
      for (const course of COURSES)
        expect(await chatRowsOf(course, id), `${id} ${course}`).toBeGreaterThan(
          0,
        );
    }
  });

  it("finishes tomorrow what a run that died midway started", async () => {
    // The second course's object fails once, as if the cron were killed.
    let failures = 1;
    const flaky: PurgeEnv = {
      ...(env as Env),
      COURSE_CHAT: {
        idFromName: (name: string) => env.COURSE_CHAT.idFromName(name),
        get: (id: DurableObjectId) => {
          const real = env.COURSE_CHAT.get(id);
          const flakyOne = env.COURSE_CHAT.idFromName(
            courseRoomId(TERM, "CMSC351"),
          );
          return {
            purgeAuthor: (target: Parameters<CourseChat["purgeAuthor"]>[0]) =>
              id.equals(flakyOne) && failures-- > 0
                ? Promise.reject(new Error("cron killed"))
                : real.purgeAuthor(target),
          };
        },
      } as unknown as PurgeEnv["COURSE_CHAT"],
    };

    const first = await purgeDueAccounts(flaky, NOW);
    expect(first).toMatchObject({ accounts: 0, chatCourses: 0 });
    expect(first.errors).toHaveLength(1);
    // The first course is done and crossed off; the rest waits.
    expect(await chatRowsOf("CMSC131", GONE)).toBe(0);
    expect(await chatRowsOf("CMSC351", GONE)).toBeGreaterThan(0);
    expect(
      (
        await env.DB.prepare(
          "SELECT course_code FROM chat_author_courses WHERE user_id = ?1",
        )
          .bind(GONE)
          .all()
      ).results,
    ).toEqual([{ course_code: "CMSC351" }]);
    expect(
      await env.DB.prepare("SELECT status FROM users WHERE id = ?1")
        .bind(GONE)
        .first("status"),
    ).toBe("deleting");

    const next = await purgeDueAccounts(flaky, new Date(NOW.getTime() + HOUR));
    expect(next).toMatchObject({ accounts: 1, chatCourses: 1, errors: [] });
    expect(await rowsMentioning(GONE)).toEqual([]);
    for (const course of COURSES)
      expect(await chatRowsOf(course, GONE)).toBe(0);

    // And once more: nothing left to do.
    expect(
      await purgeDueAccounts(flaky, new Date(NOW.getTime() + 2 * HOUR)),
    ).toEqual({
      accounts: 0,
      chatCourses: 0,
      chatMessages: 0,
      errors: [],
    });
  });

  it("keeps an account whose person signs in while the run is on its way", async () => {
    const before = await rowsMentioning(GONE);
    // They sign in while the first course's object is being purged.
    const signingIn: PurgeEnv = {
      ...(env as Env),
      COURSE_CHAT: {
        idFromName: (name: string) => env.COURSE_CHAT.idFromName(name),
        get: (id: DurableObjectId) => ({
          purgeAuthor: async (
            target: Parameters<CourseChat["purgeAuthor"]>[0],
          ) => {
            await upsertUser(
              env.DB,
              anIdentity({
                directoryId: GONE,
                email: `${GONE}@terpmail.umd.edu`,
                name: `Name ${GONE}`,
                sub: `1${GONE}`,
              }),
              NOW,
            );
            return env.COURSE_CHAT.get(id).purgeAuthor(target);
          },
        }),
      } as unknown as PurgeEnv["COURSE_CHAT"],
    };

    expect(await purgeDueAccounts(signingIn, NOW)).toEqual({
      accounts: 0,
      chatCourses: 1,
      chatMessages: 1,
      errors: [],
    });
    expect(
      await env.DB.prepare("SELECT status FROM users WHERE id = ?1")
        .bind(GONE)
        .first("status"),
    ).toBe("active");
    // The course already under way is gone; nothing after it is touched.
    expect(await chatRowsOf("CMSC131", GONE)).toBe(0);
    expect(await chatRowsOf("CMSC351", GONE)).toBeGreaterThan(0);
    expect(
      (await env.USER_CONTENT.list({ prefix: `avatars/${GONE}/` })).objects,
    ).toHaveLength(1);
    // Every row is still there, but the finished course's chat record.
    expect(await rowsMentioning(GONE)).toEqual(
      before.map((r) =>
        r === "chat_author_courses: 2" ? "chat_author_courses: 1" : r,
      ),
    );
  });

  it("changes nothing in the batch once the account is kept", async () => {
    await env.DB.prepare(
      "UPDATE users SET status = 'active', delete_after = NULL WHERE id = ?1",
    )
      .bind(GONE)
      .run();
    const before = await rowsMentioning(GONE);
    await env.DB.batch(accountStatements(env.DB, GONE, NOW));
    expect(await rowsMentioning(GONE)).toEqual(before);
  });

  it("leaves an account in its week alone, then takes it when the week ends", async () => {
    await runDailyJob({ env: env as Env, now: NOW });
    const before = await rowsMentioning(GRACE);
    expect(
      await env.DB.prepare("SELECT status FROM users WHERE id = ?1")
        .bind(GRACE)
        .first("status"),
    ).toBe("deleting");
    for (const course of COURSES)
      expect(await chatRowsOf(course, GRACE)).toBeGreaterThan(0);
    expect(
      (await env.USER_CONTENT.list({ prefix: `avatars/${GRACE}/` })).objects,
    ).toHaveLength(1);

    await runDailyJob({
      env: env as Env,
      now: new Date(NOW.getTime() + DAY - 1001),
    });
    expect(await rowsMentioning(GRACE)).toEqual(before);

    await runDailyJob({ env: env as Env, now: new Date(NOW.getTime() + DAY) });
    expect(await rowsMentioning(GRACE)).toEqual([]);
    for (const course of COURSES)
      expect(await chatRowsOf(course, GRACE)).toBe(0);
  });
});
