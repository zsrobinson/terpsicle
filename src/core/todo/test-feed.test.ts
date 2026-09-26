import { describe, expect, it } from "vitest";
import { parseIcs } from "./ics";
import { parseFeedLink } from "./link";
import { TEST_FEED_TOKENS, testFeedIcs, testFeedLink } from "./test-feed";

describe("test mode's feed", () => {
  it("has links that pass the real shape check", () => {
    for (const token of Object.values(TEST_FEED_TOKENS)) {
      expect(parseFeedLink(testFeedLink(token))).toBe(testFeedLink(token));
    }
  });

  it("parses, dated from today, with fixed UIDs", () => {
    const parsed = parseIcs(testFeedIcs("2026-09-26"));
    expect(parsed.recognized).toBe(true);
    expect(parsed.skipped).toBe(0);
    expect(
      parsed.items.map((i) => [i.uid, i.title, i.dueDate, i.dueAt]),
    ).toEqual([
      [
        "event-assignment-9900001",
        "Lab 6",
        "2026-09-24",
        "2026-09-25T03:59:00.000Z",
      ],
      [
        "event-assignment-9900002",
        "Project 2",
        "2026-09-27",
        "2026-09-28T03:59:00.000Z",
      ],
      [
        "event-assignment-9900003",
        "WebAssign 5",
        "2026-09-27",
        "2026-09-28T03:59:00.000Z",
      ],
      ["event-assignment-9900004", "Reading response 3", "2026-09-29", null],
      [
        "event-calendar-event-9900005",
        "Midterm 1",
        "2026-10-01",
        "2026-10-01T17:00:00.000Z",
      ],
      [
        "event-assignment-9900006",
        "Homework 4",
        "2026-10-02",
        "2026-10-03T03:59:00.000Z",
      ],
    ]);
    expect(parsed.items.find((i) => i.title === "Homework 4")?.gradescope).toBe(
      true,
    );
    expect(
      parsed.items.find((i) => i.title === "Midterm 1")?.looksLikeExam,
    ).toBe(true);
    // The same UIDs another day.
    expect(parseIcs(testFeedIcs("2026-12-01")).items.map((i) => i.uid)).toEqual(
      parsed.items.map((i) => i.uid),
    );
  });

  it("stays in Eastern time across the end of daylight time", () => {
    const parsed = parseIcs(testFeedIcs("2026-11-01"));
    expect(parsed.items.find((i) => i.title === "Project 2")).toMatchObject({
      dueDate: "2026-11-02",
      dueAt: "2026-11-03T04:59:00.000Z",
    });
  });
});
