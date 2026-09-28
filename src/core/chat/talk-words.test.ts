import { describe, expect, it } from "vitest";
import { ChatReportReasonSchema } from "../schema";
import {
  CHAT_REPORT_REASON_WORDS,
  chatErrorWords,
  clockWords,
  dayWords,
  heldWords,
  peopleWords,
  threadWords,
  typingWords,
  whenWords,
} from "./talk-words";

// Noon on a Friday in College Park.
const NOW = "2026-09-25T16:00:00.000Z";

describe("times", () => {
  it("names days in College Park time", () => {
    expect(dayWords("2026-09-25T13:00:00.000Z", NOW)).toBe("Today");
    // 11pm Thursday in College Park is already Friday in UTC.
    expect(dayWords("2026-09-25T03:00:00.000Z", NOW)).toBe("Yesterday");
    expect(dayWords("2026-09-22T16:00:00.000Z", NOW)).toBe("Tuesday, Sep 22");
    expect(dayWords("2026-09-01T16:00:00.000Z", NOW)).toBe("Sep 1, 2026");
  });

  it("says the time like people do", () => {
    expect(clockWords("2026-09-25T18:14:00.000Z")).toBe("2:14pm");
    expect(clockWords("2026-09-25T04:05:00.000Z")).toBe("12:05am");
    expect(whenWords("2026-09-25T18:14:00.000Z", NOW)).toBe("2:14pm");
    expect(whenWords("2026-09-24T18:14:00.000Z", NOW)).toBe("Yesterday 2:14pm");
    expect(whenWords("2026-09-22T18:14:00.000Z", NOW)).toBe("Sep 22 2:14pm");
  });
});

describe("words", () => {
  it("counts replies and people", () => {
    expect(
      threadWords({ count: 1, lastAt: "2026-09-25T14:03:00.000Z" }, NOW),
    ).toBe("1 reply · last 10:03am");
    expect(
      threadWords({ count: 3, lastAt: "2026-09-25T14:03:00.000Z" }, NOW),
    ).toBe("3 replies · last 10:03am");
    expect(peopleWords(1)).toBe("1 person");
    expect(peopleWords(42)).toBe("42 people");
  });

  it("says who's typing by first name", () => {
    expect(typingWords([])).toBe("");
    expect(typingWords(["Noor Haddad"])).toBe("Noor is typing…");
    expect(typingWords(["Noor Haddad", "Sam Lee"])).toBe(
      "Noor and Sam are typing…",
    );
    expect(typingWords(["A B", "C D", "E F"])).toBe("3 people are typing…");
  });

  it("tells an author why only they can see a message, in one short line", () => {
    expect(heldWords({ state: "visible" })).toBeNull();
    // Being checked looks sent: nothing says a bot is reading it.
    expect(heldWords({ state: "held", reason: "checking" })).toBeNull();
    expect(heldWords({ state: "held", reason: "flagged" })).toBe(
      "Held for review. Only you can see it until a person checks it.",
    );
    expect(heldWords({ state: "held", reason: "graded-work" })).toContain(
      "graded work",
    );
    expect(heldWords({ state: "held", reason: "reported" })).toContain(
      "after a report",
    );
    expect(heldWords({ state: "removed" })).toBe(
      "Taken down after review. Only you can see it.",
    );
    for (const reason of ["flagged", "graded-work", "reported"] as const) {
      const words = heldWords({ state: "held", reason }) ?? "";
      expect(words.length).toBeLessThanOrEqual(90);
      expect(words).not.toMatch(/edit or delete|check it first/i);
      expect(words).toMatch(/^Held for review\b.*Only you can see it/);
    }
  });

  it("offers only abuse as report reasons, in the menu's order", () => {
    expect(Object.values(CHAT_REPORT_REASON_WORDS)).toEqual([
      "Harassment or hate",
      "A threat",
      "Sexual content",
      "Spam",
      "Someone's private info",
      "Something else",
    ]);
    expect(Object.keys(CHAT_REPORT_REASON_WORDS)).toEqual(
      ChatReportReasonSchema.options,
    );
  });

  it("explains refusals plainly", () => {
    expect(chatErrorWords("slow-down", 30)).toBe(
      "You're sending fast. Try again in 30 seconds.",
    );
    expect(chatErrorWords("slow-down", 61)).toBe(
      "You're sending fast. Try again in 2 minutes.",
    );
    expect(chatErrorWords("slow-down", 7200)).toBe(
      "You're sending fast. Try again in 2 hours.",
    );
    expect(chatErrorWords("read-only")).toContain("read-only");
  });

  it("says when the owner's stop ends, on campus, and nothing about why", () => {
    expect(
      chatErrorWords("slow-down", 604_800, "2027-10-04T15:00:00.000Z"),
    ).toBe("You can't post in Chat until Oct 4.");
    // 1am UTC is still the evening before in College Park.
    expect(
      chatErrorWords("slow-down", 604_800, "2027-10-05T01:00:00.000Z"),
    ).toBe("You can't post in Chat until Oct 4.");
  });
});
