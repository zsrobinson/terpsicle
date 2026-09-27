// Chat's spam guard against real D1 (migrations/0014_chat_spam_guard.sql).
import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { CROSS_ROOM } from "~/core/moderation";
import { CourseCodeSchema } from "~/core/schema";
import { checkCrossRoom, pruneSendHashes } from "./spam-guard";

const START = Date.UTC(2027, 1, 3, 15);
const at = (minutes: number) => new Date(START + minutes * 60_000);
const course = (n: number) => CourseCodeSchema.parse(`CMSC${100 + n}`);

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM chat_send_hashes").run();
});

describe("checkCrossRoom", () => {
  it("holds the third course of the same text, and only for that person", async () => {
    const text = "Free exam answers in my discord, link in bio, join now";
    const check = (user: string, n: number, minute: number) =>
      checkCrossRoom(env.DB, {
        userId: user,
        course: course(n),
        text,
        now: at(minute),
      });
    expect(await check("spammer", 1, 0)).toBeNull();
    expect(await check("spammer", 2, 1)).toBeNull();
    // Someone else posting the same thing is their own count.
    expect(await check("bystander", 3, 2)).toBeNull();
    expect(await check("spammer", 3, 3)).toBe("repeat");
    // An hour on, the first two have aged out.
    expect(await check("spammer", 4, 62)).toBeNull();
  });

  it("holds a flood across courses, whatever the words", async () => {
    let result = null;
    for (let i = 0; i <= CROSS_ROOM.floodMessages; i++)
      result = await checkCrossRoom(env.DB, {
        userId: "flooder",
        course: course(i % 5),
        // Too short to compare, so only the flood rule can match.
        text: `hi ${i}`,
        now: at(i / 2),
      });
    expect(result).toBe("flood");
  });

  it("keeps a fingerprint, never the words", async () => {
    await checkCrossRoom(env.DB, {
      userId: "tstudent",
      course: course(1),
      text: "anyone want to study for the midterm tonight?",
      now: at(0),
    });
    await checkCrossRoom(env.DB, {
      userId: "tstudent",
      course: course(1),
      text: "ok",
      now: at(1),
    });
    const { results } = await env.DB.prepare(
      "SELECT * FROM chat_send_hashes ORDER BY created_at",
    ).all();
    expect(results).toEqual([
      {
        user_id: "tstudent",
        course_code: course(1),
        text_hash: expect.stringMatching(/^[0-9a-f]{16}$/),
        created_at: at(0).toISOString(),
      },
      {
        user_id: "tstudent",
        course_code: course(1),
        text_hash: null,
        created_at: at(1).toISOString(),
      },
    ]);
  });
});

describe("pruneSendHashes", () => {
  it("drops rows past the hour and keeps the rest", async () => {
    for (const minute of [0, 30, 59])
      await checkCrossRoom(env.DB, {
        userId: "tstudent",
        course: course(1),
        text: "hello there, is the quiz open yet?",
        now: at(minute),
      });
    expect(await pruneSendHashes(env.DB, at(60))).toBe(1);
    expect(
      await env.DB.prepare("SELECT COUNT(*) AS n FROM chat_send_hashes").first(
        "n",
      ),
    ).toBe(2);
  });
});
