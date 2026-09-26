import { describe, expect, it } from "vitest";
import { ChatMessageIdSchema, type ModerationReason } from "../schema";
import { chatMessageId, chatModeration } from "./messages";

describe("chatMessageId", () => {
  it("is a 26-character ULID that sorts by time", () => {
    const random = new Uint8Array(10).fill(255);
    const a = chatMessageId(Date.parse("2026-10-01T15:00:00.000Z"), random);
    const b = chatMessageId(
      Date.parse("2026-10-01T15:00:00.001Z"),
      new Uint8Array(10),
    );
    expect(a).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(ChatMessageIdSchema.safeParse(a).success).toBe(true);
    expect(a < b).toBe(true);
    expect(b.slice(10)).toBe("0".repeat(16));
    expect(a.slice(10)).toBe("Z".repeat(16));
  });

  it("encodes the time like the ULID spec", () => {
    // The spec's example timestamp, 1469918176385 → 01ARYZ6S41.
    expect(chatMessageId(1469918176385, new Uint8Array(10)).slice(0, 10)).toBe(
      "01ARYZ6S41",
    );
  });
});

const reason = (
  code: ModerationReason["code"],
  action: ModerationReason["action"],
  source: ModerationReason["source"] = "rules",
): ModerationReason => ({ code, action, source });

describe("chatModeration", () => {
  it("publishes and removes", () => {
    expect(chatModeration("publish", [])).toEqual({ state: "visible" });
    expect(chatModeration("remove", [reason("slur", "remove")])).toEqual({
      state: "removed",
    });
  });

  it("keeps checking while only a failed check holds it", () => {
    expect(
      chatModeration("hold", [reason("model-unavailable", "hold", "system")]),
    ).toEqual({ state: "held", reason: "checking" });
  });

  it("says graded work when that's why, flagged otherwise", () => {
    expect(
      chatModeration("hold", [
        reason("insult", "flag"),
        reason("shares-answers", "hold"),
      ]),
    ).toEqual({ state: "held", reason: "graded-work" });
    expect(
      chatModeration("hold", [reason("academic-integrity", "hold", "policy")]),
    ).toEqual({ state: "held", reason: "graded-work" });
    // A flag alone never names the hold.
    expect(
      chatModeration("hold", [
        reason("asks-for-answers", "flag"),
        reason("hate", "hold", "guard"),
      ]),
    ).toEqual({ state: "held", reason: "flagged" });
    // The owner's undo carries no reasons.
    expect(chatModeration("hold", [])).toEqual({
      state: "held",
      reason: "flagged",
    });
  });
});
