import { describe, expect, it } from "vitest";
import type { ModerationReason } from "../schema";
import {
  decisionCursor,
  fillDays,
  HELD_SHARE_TARGET,
  heldShare,
  markedSegments,
  parseDecisionCursor,
  suggestedRemoveReason,
  waitedFor,
} from "./admin";

const NOW = new Date("2027-01-10T12:00:00.000Z");

const rule = (span: [number, number]): ModerationReason => ({
  code: "email",
  source: "rules",
  action: "hold",
  span,
});

describe("heldShare", () => {
  it("is held over everything decided that day", () => {
    expect(
      heldShare({ day: "2027-01-10", allowed: 18, held: 1, rejected: 1 }),
    ).toBe(0.05);
    expect(HELD_SHARE_TARGET).toBe(0.05);
  });

  it("is null on a day with nothing to share", () => {
    expect(
      heldShare({ day: "2027-01-10", allowed: 0, held: 0, rejected: 0 }),
    ).toBeNull();
  });
});

describe("fillDays", () => {
  it("lists every day back from today, newest first, zero when quiet", () => {
    const days = fillDays(
      [{ day: "2027-01-08", allowed: 3, held: 1, rejected: 0 }],
      NOW,
      4,
    );
    expect(days.map((d) => d.day)).toEqual([
      "2027-01-10",
      "2027-01-09",
      "2027-01-08",
      "2027-01-07",
    ]);
    expect(days[2]).toEqual({
      day: "2027-01-08",
      allowed: 3,
      held: 1,
      rejected: 0,
    });
    expect(days[0]).toEqual({
      day: "2027-01-10",
      allowed: 0,
      held: 0,
      rejected: 0,
    });
  });

  it("uses UTC days, like the daily cap", () => {
    const lateEvening = new Date("2027-01-10T23:59:59.000Z");
    expect(fillDays([], lateEvening, 1)[0]?.day).toBe("2027-01-10");
  });
});

describe("the decision cursor", () => {
  it("round-trips a row's time and id", () => {
    const row = {
      createdAt: "2027-01-10T12:00:00.000Z",
      id: "a_b-c".padEnd(22, "x"),
    };
    const cursor = decisionCursor(row);
    expect(cursor).toBe(`2027-01-10T12:00:00.000Z~${row.id}`);
    expect(parseDecisionCursor(cursor)).toEqual(row);
  });
});

describe("markedSegments", () => {
  const text = "mail me at a@b.co or call 301-555-0100";

  it("marks the characters each rule matched", () => {
    expect(markedSegments(text, [rule([11, 17]), rule([26, 38])])).toEqual([
      { text: "mail me at ", marked: false },
      { text: "a@b.co", marked: true },
      { text: " or call ", marked: false },
      { text: "301-555-0100", marked: true },
    ]);
  });

  it("merges overlapping spans and clips ones past the end", () => {
    expect(markedSegments("abcdef", [rule([3, 99]), rule([1, 4])])).toEqual([
      { text: "a", marked: false },
      { text: "bcdef", marked: true },
    ]);
  });

  it("leaves text without spans whole, and ignores empty spans", () => {
    const guard: ModerationReason = {
      code: "hate",
      source: "guard",
      action: "hold",
      category: "S10",
    };
    expect(markedSegments("hello", [guard, rule([2, 2])])).toEqual([
      { text: "hello", marked: false },
    ]);
    expect(markedSegments("", [rule([0, 3])])).toEqual([]);
  });
});

describe("suggestedRemoveReason", () => {
  it("offers the reason that fits what held it", () => {
    expect(suggestedRemoveReason([rule([0, 3])])).toBe("personal-info");
    expect(
      suggestedRemoveReason([
        { code: "spam", source: "policy", action: "hold", score: 0.7 },
      ]),
    ).toBe("spam");
  });

  it("puts urgent reasons first, then holds before flags", () => {
    expect(
      suggestedRemoveReason([
        { code: "spam", source: "policy", action: "hold", score: 0.7 },
        { code: "violence", source: "guard", action: "hold", category: "S1" },
      ]),
    ).toBe("threat");
    expect(
      suggestedRemoveReason([
        { code: "insult", source: "rules", action: "flag", span: [0, 4] },
        {
          code: "academic-integrity",
          source: "policy",
          action: "hold",
          score: 0.9,
        },
      ]),
    ).toBe("academic-integrity");
  });

  it("falls back to other when nothing fits", () => {
    expect(
      suggestedRemoveReason([
        { code: "model-unavailable", source: "system", action: "hold" },
      ]),
    ).toBe("other");
    expect(suggestedRemoveReason([])).toBe("other");
  });
});

describe("waitedFor", () => {
  const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

  it("says how long in the largest unit that reads well", () => {
    expect(waitedFor(ago(20_000), NOW)).toBe("just now");
    expect(waitedFor(ago(12 * 60_000), NOW)).toBe("12 min");
    expect(waitedFor(ago(3 * 3_600_000), NOW)).toBe("3 h");
    expect(waitedFor(ago(47 * 3_600_000), NOW)).toBe("47 h");
    expect(waitedFor(ago(5 * 86_400_000), NOW)).toBe("5 days");
  });

  it("never goes negative on a clock that's slightly behind", () => {
    expect(waitedFor(ago(-60_000), NOW)).toBe("just now");
  });
});
