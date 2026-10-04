import { describe, expect, it } from "vitest";
import { SettingsDocSchema, SyncedPrefsSchema } from "../schema";
import { CHAT_RULES_SEEN_MAX, chatRulesSeen, withChatRulesSeen } from "./prefs";

describe("chat room rules seen", () => {
  it("are remembered per course", () => {
    const prefs = withChatRulesSeen({}, ["CMSC351"]);
    expect(chatRulesSeen(prefs, "CMSC351")).toBe(true);
    expect(chatRulesSeen(prefs, "MATH140")).toBe(false);
    expect(chatRulesSeen({}, "CMSC351")).toBe(false);
  });

  it("add each course once, and change nothing for one already seen", () => {
    const prefs = withChatRulesSeen({}, ["CMSC351", "CMSC351", "MATH140"]);
    expect(prefs.chatRules?.seen).toEqual(["CMSC351", "MATH140"]);
    expect(withChatRulesSeen(prefs, ["MATH140"])).toBe(prefs);
  });

  it("keep the newest courses past the limit", () => {
    const many = Array.from(
      { length: CHAT_RULES_SEEN_MAX },
      (_, i) => `CMSC${String(i).padStart(3, "0")}`,
    );
    const prefs = withChatRulesSeen(withChatRulesSeen({}, many), ["MATH140"]);
    expect(prefs.chatRules?.seen).toHaveLength(CHAT_RULES_SEEN_MAX);
    expect(chatRulesSeen(prefs, "MATH140")).toBe(true);
    expect(chatRulesSeen(prefs, "CMSC000")).toBe(false);
  });
});

describe("prefs no build reads any more", () => {
  it("still read, whatever they say, and changes to other prefs keep them", () => {
    // Todo's weeks are Monday's alone now (docs/decisions.md, "Todo is one
    // week"), and Reviews has no AI features to turn off ("Reviews without
    // AI"); an account saved with either setting must still load.
    for (const old of [
      { todo: { weekStart: "sunday" } },
      { todo: { weekStart: "friday" } },
      { ai: { features: false } },
    ]) {
      const prefs = SyncedPrefsSchema.parse(old);
      expect(prefs).toEqual(old);
      expect(withChatRulesSeen(prefs, ["CMSC351"])).toEqual({
        ...old,
        chatRules: { seen: ["CMSC351"] },
      });
    }
  });
});

describe("the prefs' shape", () => {
  it("keeps a key this build doesn't know", () => {
    const prefs = { ai: { features: false }, later: { view: "week" } };
    expect(SyncedPrefsSchema.parse(prefs)).toEqual(prefs);
  });

  it("is empty in a settings doc saved before prefs", () => {
    const doc = SettingsDocSchema.parse({
      blocks: [],
      colors: {},
      travel: { pace: "typical", accessible: false, extraMinutes: 0 },
      mainPlans: {},
    });
    expect(doc.prefs).toEqual({});
  });

  it("refuses a known pref in the wrong shape", () => {
    expect(SyncedPrefsSchema.safeParse({ home: "compact" }).success).toBe(
      false,
    );
  });
});
