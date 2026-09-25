import { describe, expect, it } from "vitest";
import {
  BlockSchema,
  clampSidebarWidth,
  DEFAULT_UI_PREFS,
  LocalSeatAlertSchema,
  type Plan,
  PlanSchema,
  UiPrefsSchema,
} from "./local";
import { SettingsRowSchema } from "./settings";
import { type SharePayload, SharePayloadSchema } from "./share";
import { DEFAULT_TRAVEL_SETTINGS, TravelSettingsSchema } from "./travel";

const TERM = "202701";
const NOW = "2026-09-25T14:00:00.000Z";

const plan: Plan = {
  id: "plan_a1b2c3d4",
  termId: TERM,
  name: "Plan A",
  order: 0,
  createdAt: NOW,
  updatedAt: NOW,
  courses: [
    {
      courseCode: "CMSC351",
      sectionCode: "0101",
      snapshot: {
        instructors: ["Clyde Kruskal"],
        delivery: "f2f",
        meetings: [
          {
            timed: true,
            days: ["Tu", "Th"],
            start: 570,
            end: 645,
            building: "IRB",
            room: "0318",
            kind: "lecture",
            online: false,
          },
        ],
      },
    },
    { courseCode: "MUSC130", sectionCode: null, snapshot: null },
  ],
};

describe("local state", () => {
  it("accepts a plan with a placed and a saved-for-later course", () => {
    expect(PlanSchema.parse(plan)).toEqual(plan);
  });

  it("keeps sectionCode and snapshot consistent", () => {
    const [placed, saved] = plan.courses;
    if (!placed || !saved) throw new Error("fixture has two courses");
    expect(
      PlanSchema.safeParse({
        ...plan,
        courses: [{ ...placed, snapshot: null }],
      }).success,
    ).toBe(false);
    expect(
      PlanSchema.safeParse({
        ...plan,
        courses: [{ ...saved, snapshot: placed.snapshot }],
      }).success,
    ).toBe(false);
  });

  it("rejects the same course twice", () => {
    const [placed] = plan.courses;
    if (!placed) throw new Error("fixture has a course");
    expect(
      PlanSchema.safeParse({
        ...plan,
        courses: [placed, { ...placed, sectionCode: "0201" }],
      }).success,
    ).toBe(false);
  });

  it("accepts blocks and rejects empty or backwards ones", () => {
    const block = {
      id: "blk_12345678",
      termId: TERM,
      label: "Work",
      days: ["F"],
      start: 780,
      end: 960,
    };
    expect(BlockSchema.safeParse(block).success).toBe(true);
    expect(BlockSchema.safeParse({ ...block, days: [] }).success).toBe(false);
    expect(BlockSchema.safeParse({ ...block, end: 700 }).success).toBe(false);
    expect(BlockSchema.safeParse({ ...block, label: "  " }).success).toBe(
      false,
    );
  });

  it("clamps sidebar widths to whole pixels within the limits", () => {
    expect(clampSidebarWidth(300)).toBe(320);
    expect(clampSidebarWidth(400.6)).toBe(401);
    expect(clampSidebarWidth(9000)).toBe(480);
    expect(clampSidebarWidth(Number.NaN)).toBe(360);
  });

  it("keeps older UI prefs, giving them the default sidebar width", () => {
    const { sidebarWidth: _, ...older } = DEFAULT_UI_PREFS;
    expect(UiPrefsSchema.parse(older).sidebarWidth).toBe(360);
    expect(
      UiPrefsSchema.parse({ ...DEFAULT_UI_PREFS, sidebarWidth: 9000 })
        .sidebarWidth,
    ).toBe(360);
    expect(
      UiPrefsSchema.parse({ ...DEFAULT_UI_PREFS, sidebarWidth: 412 })
        .sidebarWidth,
    ).toBe(412);
  });

  it("parses default settings rows", () => {
    expect(UiPrefsSchema.parse(DEFAULT_UI_PREFS)).toEqual(DEFAULT_UI_PREFS);
    expect(TravelSettingsSchema.parse(DEFAULT_TRAVEL_SETTINGS)).toEqual(
      DEFAULT_TRAVEL_SETTINGS,
    );
    expect(
      SettingsRowSchema.safeParse({
        key: "travel",
        value: DEFAULT_TRAVEL_SETTINGS,
      }).success,
    ).toBe(true);
    expect(
      SettingsRowSchema.safeParse({
        key: "travel",
        value: { ...DEFAULT_TRAVEL_SETTINGS, extraMinutes: 3 },
      }).success,
    ).toBe(false);
    const drilled = {
      ...DEFAULT_UI_PREFS,
      tab: "search",
      drill: { kind: "course", courseCode: "CMSC351", tab: "grades" },
    };
    expect(UiPrefsSchema.safeParse(drilled).success).toBe(true);
  });

  it("accepts a local seat alert", () => {
    const alert = {
      termId: TERM,
      sectionKey: "CMSC351-0101",
      email: "testudo@umd.edu",
      status: "pending",
      subscriptionId: "AAAAAAAAAAAAAAAAAAAAAA",
      manageToken: "A".repeat(43),
      createdAt: NOW,
      updatedAt: NOW,
    };
    expect(LocalSeatAlertSchema.safeParse(alert).success).toBe(true);
    expect(
      LocalSeatAlertSchema.safeParse({
        ...alert,
        subscriptionId: null,
        manageToken: null,
      }).success,
    ).toBe(true);
    // Confirmed here but asked for in another browser: no address.
    expect(
      LocalSeatAlertSchema.safeParse({ ...alert, email: null }).success,
    ).toBe(true);
    expect(
      LocalSeatAlertSchema.safeParse({ ...alert, email: "not an email" })
        .success,
    ).toBe(false);
  });
});

describe("share payload", () => {
  const payload: SharePayload = {
    v: 1,
    termId: TERM,
    name: "Plan A",
    sections: ["CMSC351-0101", "ENGL393-0312"],
    saved: ["MUSC130"],
    blocks: [{ label: "Lunch", days: ["M", "W", "F"], start: 720, end: 780 }],
    colors: { CMSC351: "violet" },
  };

  it("accepts a full payload and a minimal one", () => {
    expect(SharePayloadSchema.parse(payload)).toEqual(payload);
    expect(
      SharePayloadSchema.safeParse({ v: 1, termId: TERM, sections: [] })
        .success,
    ).toBe(true);
  });

  it("rejects a course listed twice or an unknown version", () => {
    expect(
      SharePayloadSchema.safeParse({
        ...payload,
        sections: ["CMSC351-0101", "CMSC351-0201"],
      }).success,
    ).toBe(false);
    expect(
      SharePayloadSchema.safeParse({ ...payload, saved: ["CMSC351"] }).success,
    ).toBe(false);
    expect(SharePayloadSchema.safeParse({ ...payload, v: 2 }).success).toBe(
      false,
    );
  });
});
