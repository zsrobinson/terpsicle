import { describe, expect, it } from "vitest";
import { ModerationReasonSchema, ReportReasonSchema } from "~/core/schema";
import {
  HIDE_AT_ONCE,
  REASON_WORDS,
  type ReportLike,
  reportReasons,
  reportsAreUrgent,
  shouldHide,
} from ".";

const report = (
  reporterId: string,
  reason: ReportLike["reason"] = "off-topic",
): ReportLike => ({ reporterId, reason });

describe("shouldHide", () => {
  it("waits for three different people", () => {
    expect(shouldHide([])).toBe(false);
    expect(shouldHide([report("a"), report("b")])).toBe(false);
    expect(shouldHide([report("a"), report("b"), report("c")])).toBe(true);
  });

  it("counts people, not reports", () => {
    expect(shouldHide([report("a"), report("a"), report("b")])).toBe(false);
  });

  it("hides at once for a threat, personal info or a named student", () => {
    for (const reason of [
      "threat",
      "personal-info",
      "names-a-student",
    ] as const)
      expect(shouldHide([report("a", reason)])).toBe(true);
    const others = ReportReasonSchema.options.filter(
      (r) => !HIDE_AT_ONCE.has(r),
    );
    for (const reason of others)
      expect(shouldHide([report("a", reason)])).toBe(false);
  });
});

describe("reportReasons", () => {
  it("labels each reason once, and holds only when the reports hide it", () => {
    const flagged = reportReasons([report("a", "other"), report("b", "other")]);
    expect(flagged).toEqual([
      { code: "reported", source: "reports", action: "flag", report: "other" },
    ]);
    const held = reportReasons([report("a", "sexual"), report("b", "threat")]);
    expect(held.map((r) => [r.report, r.action])).toEqual([
      ["sexual", "hold"],
      ["threat", "hold"],
    ]);
    for (const r of held) expect(ModerationReasonSchema.parse(r)).toEqual(r);
    expect(REASON_WORDS.reported).toBe("Reported by readers");
  });

  it("marks a reported threat urgent", () => {
    expect(reportsAreUrgent([report("a", "threat")])).toBe(true);
    expect(reportsAreUrgent([report("a", "hate")])).toBe(false);
  });
});
