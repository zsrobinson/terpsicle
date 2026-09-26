import { describe, expect, it } from "vitest";
import {
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

  it("tells an author why only they can see a message", () => {
    expect(heldWords({ state: "visible" })).toBeNull();
    expect(heldWords({ state: "held", reason: "checking" })).toBe(
      "Checking before classmates see it…",
    );
    expect(heldWords({ state: "held", reason: "graded-work" })).toContain(
      "graded work",
    );
    expect(heldWords({ state: "held", reason: "reported" })).toContain(
      "reported",
    );
    expect(heldWords({ state: "removed" })).toContain("took this down");
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
});
