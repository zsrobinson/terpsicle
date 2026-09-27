import { describe, expect, it } from "vitest";
import {
  CROSS_ROOM,
  type CrossRoomSend,
  crossRoomRule,
  fingerprintDistance,
  normalizeForSpam,
  textFingerprint,
} from ".";

const SPAM = "Join my discord for free exam answers discord.gg/abc123";
const NOW = Date.UTC(2026, 9, 5, 18);
const MIN = 60_000;

/** One send to a course's chat, `ago` minutes before NOW. */
const send = (course: string, text: string, ago: number): CrossRoomSend => ({
  course,
  fingerprint: textFingerprint(text),
  at: NOW - ago * MIN,
});
const now = (course: string, text: string) => send(course, text, 0);

const near = (a: string, b: string) => {
  const fa = textFingerprint(a);
  const fb = textFingerprint(b);
  if (!fa || !fb) throw new Error("too short to compare");
  return fingerprintDistance(fa, fb) <= CROSS_ROOM.nearBits;
};

describe("fingerprints", () => {
  it("ignore case, accents, punctuation and spacing", () => {
    expect(normalizeForSpam("  JOIN my Discórd!!!  for   FREE ")).toBe(
      "join my discord for free",
    );
    expect(textFingerprint(SPAM)).toBe(
      textFingerprint(
        "JOIN my Discord for FREE exam answers!!! discord.gg/abc123",
      ),
    );
    expect(textFingerprint(SPAM)).toMatch(/^[0-9a-f]{16}$/);
  });

  it("land close for near-same spam", () => {
    expect(near(SPAM, `${SPAM} CMSC351`)).toBe(true);
    expect(
      near(
        SPAM,
        "hey all, join my discord for free exam answers: discord.gg/abc124",
      ),
    ).toBe(true);
    expect(
      near(
        "💰 Make $500/day from your dorm!! Crypto signals, join now at cryptoprofitz.xyz/join",
        "💰 Make $600/day from your dorm!! Crypto signals, join now at cryptoprofitz.xyz/join 💰",
      ),
    ).toBe(true);
  });

  it("stay apart for different questions that share words", () => {
    expect(
      near(
        "when is the midterm for this class?",
        "when is the final for this class?",
      ),
    ).toBe(false);
    expect(
      near(
        "is the homework due friday or sunday?",
        "is the project due friday or sunday?",
      ),
    ).toBe(false);
    expect(
      near(
        "does anyone know if office hours are cancelled today",
        "does anyone know if lecture is cancelled today",
      ),
    ).toBe(false);
  });

  it("skip texts too short to call a repeat", () => {
    expect(textFingerprint("thanks!")).toBeNull();
    expect(textFingerprint("same, see you there")).toBeNull();
  });
});

describe("crossRoomRule: repeat", () => {
  it("holds the same text in a third course within the hour", () => {
    const earlier = [send("CMSC131", SPAM, 50), send("MATH140", SPAM, 20)];
    expect(crossRoomRule(now("PSYC100", SPAM), earlier, NOW)).toBe("repeat");
  });

  it("holds a near-same text too", () => {
    const earlier = [
      send("CMSC131", SPAM, 5),
      send("MATH140", `${SPAM} (MATH140 folks too)`, 3),
    ];
    expect(crossRoomRule(now("PSYC100", `${SPAM} CMSC351`), earlier, NOW)).toBe(
      "repeat",
    );
  });

  it("lets two courses through", () => {
    expect(
      crossRoomRule(now("MATH140", SPAM), [send("CMSC131", SPAM, 1)], NOW),
    ).toBe(null);
  });

  it("counts courses, not messages: repeating in one course is its room's business", () => {
    const earlier = [
      send("CMSC131", SPAM, 3),
      send("CMSC131", SPAM, 2),
      send("MATH140", SPAM, 1),
    ];
    expect(crossRoomRule(now("MATH140", SPAM), earlier, NOW)).toBe(null);
  });

  it("forgets sends older than the hour", () => {
    const earlier = [send("CMSC131", SPAM, 61), send("MATH140", SPAM, 30)];
    expect(crossRoomRule(now("PSYC100", SPAM), earlier, NOW)).toBe(null);
  });

  it("never counts short replies", () => {
    const earlier = [
      send("CMSC131", "thanks!", 3),
      send("MATH140", "thanks!", 2),
    ];
    expect(crossRoomRule(now("PSYC100", "thanks!"), earlier, NOW)).toBe(null);
  });

  it("lets the same question in three rooms of one course through", () => {
    // The course room, the professor room and your section room.
    const earlier = [send("CMSC351", SPAM, 20), send("CMSC351", SPAM, 10)];
    expect(crossRoomRule(now("CMSC351", SPAM), earlier, NOW)).toBe(null);
    // A third course is what holds it.
    expect(
      crossRoomRule(
        now("MATH140", SPAM),
        [...earlier, send("CMSC131", SPAM, 5)],
        NOW,
      ),
    ).toBe("repeat");
  });

  it("lets different messages in many courses through", () => {
    const earlier = [
      send("CMSC131", "anyone want to study for the midterm tonight?", 30),
      send("MATH140", "the lecture notes for today are on ELMS", 20),
      send("PSYC100", "does the quiz cover chapter 4 or just 3?", 10),
    ];
    expect(
      crossRoomRule(
        now("ENGL101", "who else is completely lost on project 2"),
        earlier,
        NOW,
      ),
    ).toBe(null);
  });
});

describe("crossRoomRule: flood", () => {
  const many = (count: number, courses: number, spanMinutes: number) =>
    Array.from({ length: count }, (_, i) =>
      send(
        `COURSE${i % courses}`,
        `message number ${i} about something else entirely`,
        (spanMinutes * (i + 1)) / (count + 1),
      ),
    );

  it("holds a 13th message across a 5th course within ten minutes", () => {
    const earlier = many(12, 5, 9);
    expect(
      crossRoomRule(
        now("COURSE0", "and one more different thing to say here"),
        earlier,
        NOW,
      ),
    ).toBe("flood");
  });

  it("lets 12 messages through", () => {
    const earlier = many(11, 5, 9);
    expect(
      crossRoomRule(
        now("COURSE0", "and one more different thing to say here"),
        earlier,
        NOW,
      ),
    ).toBe(null);
  });

  it("lets a busy talker in four courses through", () => {
    const earlier = many(30, 4, 9);
    expect(
      crossRoomRule(
        now("COURSE0", "and one more different thing to say here"),
        earlier,
        NOW,
      ),
    ).toBe(null);
  });

  it("counts one course's rooms as one course", () => {
    const earlier = Array.from({ length: 20 }, (_, i) =>
      send("CMSC351", `hi ${i}`, (9 * (i + 1)) / 21),
    );
    expect(crossRoomRule(now("CMSC351", "one more"), earlier, NOW)).toBe(null);
  });

  it("only counts the last ten minutes", () => {
    const earlier = many(12, 5, 30).filter((s) => NOW - s.at > 10 * MIN);
    expect(earlier.length).toBeGreaterThan(0);
    expect(
      crossRoomRule(
        now("COURSE0", "and one more different thing to say here"),
        earlier,
        NOW,
      ),
    ).toBe(null);
  });
});
