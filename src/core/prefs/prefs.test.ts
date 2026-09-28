import { describe, expect, it } from "vitest";
import { SettingsDocSchema, SyncedPrefsSchema } from "../schema";
import {
  aiFeaturesOn,
  CHAT_RULES_SEEN_MAX,
  chatRulesSeen,
  todoWeekStart,
  withAiFeatures,
  withChatRulesSeen,
  withTodoWeekStart,
} from "./prefs";

describe("AI features", () => {
  it("are on until someone turns them off", () => {
    expect(aiFeaturesOn({})).toBe(true);
    expect(aiFeaturesOn({ ai: { features: true } })).toBe(true);
    expect(aiFeaturesOn({ ai: { features: false } })).toBe(false);
  });

  it("turn off and back on, keeping the other prefs", () => {
    const prefs = { chatRules: { seen: ["CMSC351"] } };
    const off = withAiFeatures(prefs, false);
    expect(off).toEqual({ ...prefs, ai: { features: false } });
    expect(aiFeaturesOn(withAiFeatures(off, true))).toBe(true);
  });

  it("change nothing when they're already that way", () => {
    const off = { ai: { features: false } };
    expect(withAiFeatures(off, false)).toBe(off);
  });
});

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

describe("Todo's week start", () => {
  it("is Monday until someone picks Sunday", () => {
    expect(todoWeekStart({})).toBe("monday");
    expect(todoWeekStart({ todo: { weekStart: "sunday" } })).toBe("sunday");
  });

  it("changes, keeping the other prefs, and changes nothing when it's already that", () => {
    const prefs = { ai: { features: false } };
    const sunday = withTodoWeekStart(prefs, "sunday");
    expect(sunday).toEqual({ ...prefs, todo: { weekStart: "sunday" } });
    expect(withTodoWeekStart(sunday, "sunday")).toBe(sunday);
    expect(todoWeekStart(withTodoWeekStart(sunday, "monday"))).toBe("monday");
  });

  it("refuses a day that isn't Monday or Sunday", () => {
    expect(
      SyncedPrefsSchema.safeParse({ todo: { weekStart: "friday" } }).success,
    ).toBe(false);
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
      chatPlans: {},
    });
    expect(doc.prefs).toEqual({});
  });

  it("refuses a known pref in the wrong shape", () => {
    expect(
      SyncedPrefsSchema.safeParse({ ai: { features: "no" } }).success,
    ).toBe(false);
  });
});
