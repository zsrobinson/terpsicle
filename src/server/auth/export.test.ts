// `account/export` (docs/DATA.md §5.6): everything only the account holds,
// for the data file, against the real D1 and CourseChat objects. Your own
// tasks come back opened, your messages from every course you wrote in,
// and nothing of anyone else's.
import { evictDurableObject, runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { courseRoomId } from "~/core/schema";
import { AccountDataSchema } from "~/core/schema/data-export";
import { DEFAULT_NOTIFICATION_SETTINGS } from "~/core/schema/notifications";
import { ObjectStore } from "../chat/object-store";
import { clearTodo, FakeElms, signIn, todoEnv } from "../todo/testing";

const TERM = "202701";
const COURSE = "CMSC351";
const NOW = new Date("2026-10-05T14:00:00.000Z");
const now = () => NOW;

const room = courseRoomId(TERM, COURSE);
const chat = () => env.COURSE_CHAT.get(env.COURSE_CHAT.idFromName(room));

/** A message from each of these people in the course's object. */
async function seedMessages(people: readonly string[]) {
  await runInDurableObject(chat(), (_i, state) => {
    const store = new ObjectStore(state.storage);
    store.setMeta("term_id", TERM);
    store.setMeta("course_code", COURSE);
    people.forEach((person, n) => {
      store.insertMessage({
        id: `01JBBBBBBBBBBBBBBBBBBBBBB${n}`,
        room_id: room,
        author_id: person,
        author_name: `Name ${person}`,
        body: `Hello from ${person}`,
        reply_to: null,
        status: "visible",
        held_reason: null,
        client_req: `req-${n}`,
        created_at: new Date(NOW.getTime() - (10 - n) * 60_000).toISOString(),
        edited_at: null,
        check_after: null,
      });
    });
  });
  await evictDurableObject(chat()).catch(() => {});
  for (const person of people)
    await env.DB.prepare(
      "INSERT INTO chat_author_courses (user_id, term_id, course_code) VALUES (?1, ?2, ?3) ON CONFLICT DO NOTHING",
    )
      .bind(person, TERM, COURSE)
      .run();
}

beforeEach(async () => {
  await clearTodo();
  await env.DB.batch(
    [
      "seat_watches",
      "chat_members",
      "chat_follows",
      "chat_room_prefs",
      "chat_author_courses",
    ].map((t) => env.DB.prepare(`DELETE FROM ${t}`)),
  );
  await runInDurableObject(chat(), async (_i, state) => {
    await state.storage.deleteAll();
  });
  await evictDurableObject(chat()).catch(() => {});
});

describe("account/export", () => {
  const options = { now, env: () => todoEnv(), elms: new FakeElms() };

  it("answers with what only the account holds, and nothing of anyone else's", async () => {
    const student = await signIn("tstudent", options);
    await signIn("tadmin", options);
    await student.call("/api/todo/save-task", {
      uid: "own-reading-group-0001",
      title: "Read chapter 4",
      courseCode: COURSE,
      dueDate: "2026-10-07",
      dueTime: 14 * 60,
    });
    await student.call("/api/todo/done", {
      uid: "own-reading-group-0001",
      done: true,
    });
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO seat_watches (user_id, term_id, section_key, created_at)
         VALUES ('tstudent', ?1, 'CMSC351-0101', ?2), ('tadmin', ?1, 'MATH141-0101', ?2)`,
      ).bind(TERM, NOW.toISOString()),
      env.DB.prepare(
        `INSERT INTO chat_members (user_id, term_id, course_code, section_code)
         VALUES ('tstudent', ?1, 'CMSC351', '0101'), ('tadmin', ?1, 'MATH141', '0201')`,
      ).bind(TERM),
      env.DB.prepare(
        `INSERT INTO chat_follows (user_id, term_id, course_code, created_at)
         VALUES ('tstudent', ?1, 'ENGL101', ?2)`,
      ).bind(TERM, NOW.toISOString()),
    ]);
    await seedMessages(["tstudent", "tadmin"]);

    const data = AccountDataSchema.parse(
      await student.call("/api/account/export"),
    );
    expect(data.profile).toMatchObject({ id: "tstudent" });
    expect(data.todo).toEqual({
      tasks: [
        {
          uid: "own-reading-group-0001",
          title: "Read chapter 4",
          courseCode: COURSE,
          dueDate: "2026-10-07",
          dueTime: 14 * 60,
          done: true,
        },
      ],
      hiddenCourses: [],
    });
    expect(data.seatWatches).toEqual([
      {
        termId: TERM,
        sectionKey: "CMSC351-0101",
        createdAt: NOW.toISOString(),
      },
    ]);
    expect(data.notificationSettings).toEqual(DEFAULT_NOTIFICATION_SETTINGS);
    expect(data.chat.rooms).toEqual([
      { termId: TERM, courseCode: COURSE, sectionCode: "0101" },
    ]);
    expect(data.chat.follows).toEqual([
      { termId: TERM, courseCode: "ENGL101", createdAt: NOW.toISOString() },
    ]);
    expect(data.chat.messages).toEqual([
      expect.objectContaining({
        termId: TERM,
        courseCode: COURSE,
        roomId: room,
        body: "Hello from tstudent",
        status: "visible",
      }),
    ]);
    // Nothing anywhere in it names the other person.
    expect(JSON.stringify(data)).not.toContain("tadmin");
  });

  it("needs a session", async () => {
    const student = await signIn("tstudent", options);
    await env.DB.prepare("DELETE FROM sessions").run();
    expect((await student.request("/api/account/export", {})).status).toBe(401);
  });
});
