import { describe, expect, it } from "vitest";
import { relativeWords, spanWords } from "./index";

// 10am on Monday, Sep 28, in New York.
const NOW = "2026-09-28T14:00:00.000Z";
const earlier = (ms: number) => new Date(Date.parse(NOW) - ms).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;

describe("relativeWords", () => {
  it("says just now under a minute, and for a time a little ahead", () => {
    expect(relativeWords(NOW, NOW)).toBe("just now");
    expect(relativeWords(earlier(59_999), NOW)).toBe("just now");
    expect(relativeWords(earlier(-30_000), NOW)).toBe("just now");
  });

  it("counts minutes, then hours, in whole words", () => {
    expect(relativeWords(earlier(MIN), NOW)).toBe("1 minute ago");
    expect(relativeWords(earlier(2 * MIN), NOW)).toBe("2 minutes ago");
    expect(relativeWords(earlier(59 * MIN + 59_999), NOW)).toBe(
      "59 minutes ago",
    );
    expect(relativeWords(earlier(HOUR), NOW)).toBe("1 hour ago");
    expect(relativeWords(earlier(3 * HOUR + 59 * MIN), NOW)).toBe(
      "3 hours ago",
    );
    expect(relativeWords(earlier(24 * HOUR - 1), NOW)).toBe("23 hours ago");
  });

  it("goes by New York's days past a day", () => {
    expect(relativeWords(earlier(24 * HOUR), NOW)).toBe("yesterday");
    // 9am Sunday to 10am Monday.
    expect(relativeWords("2026-09-27T13:00:00.000Z", NOW)).toBe("yesterday");
    // 11:30pm Monday in New York is already Tuesday in UTC; 1am Sunday is
    // still yesterday there, not two days ago.
    expect(
      relativeWords("2026-09-27T05:00:00.000Z", "2026-09-29T03:30:00.000Z"),
    ).toBe("yesterday");
    expect(relativeWords("2026-09-26T13:00:00.000Z", NOW)).toBe("2 days ago");
    expect(relativeWords("2026-09-22T13:00:00.000Z", NOW)).toBe("6 days ago");
  });

  it("gives the date past six days, with the year when it's another", () => {
    expect(relativeWords("2026-09-21T13:00:00.000Z", NOW)).toBe("Sep 21");
    // 11pm Sep 20 in New York, though it's Sep 21 in UTC.
    expect(relativeWords("2026-09-21T03:00:00.000Z", NOW)).toBe("Sep 20");
    expect(relativeWords("2025-12-30T15:00:00.000Z", NOW)).toBe("Dec 30, 2025");
  });

  it("takes strings, dates and epoch numbers, and is empty for garbage", () => {
    expect(relativeWords(new Date(NOW), Date.parse(NOW) + 2 * MIN)).toBe(
      "2 minutes ago",
    );
    expect(relativeWords("not a date", NOW)).toBe("");
    expect(relativeWords(NOW, "not a date")).toBe("");
  });
});

describe("spanWords", () => {
  it("rounds down to its largest whole unit", () => {
    expect(spanWords(0)).toBe("less than a minute");
    expect(spanWords(-5 * MIN)).toBe("less than a minute");
    expect(spanWords(MIN)).toBe("1 minute");
    expect(spanWords(25 * MIN + 59_000)).toBe("25 minutes");
    expect(spanWords(HOUR)).toBe("1 hour");
    expect(spanWords(47 * HOUR)).toBe("1 day");
    expect(spanWords(48 * HOUR)).toBe("2 days");
  });
});
