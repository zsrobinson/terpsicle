import { describe, expect, it } from "vitest";
import { DEFAULT_TRAVEL_SETTINGS } from "~/core/schema";
import { aBlock, aFourYear, aPlan } from "~/fixtures";
import { homeLocalFrom } from "./local";

describe("homeLocalFrom", () => {
  it("reads plans, blocks, settings and the four-year plan Plan opens", () => {
    const older = aFourYear({
      id: "fouryear_old",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const opened = aFourYear({
      id: "fouryear_open",
      createdAt: "2026-02-01T00:00:00.000Z",
    });
    const travel = { ...DEFAULT_TRAVEL_SETTINGS, pace: "slower" as const };
    const local = homeLocalFrom({
      plans: [aPlan(), { id: "not a plan" }],
      blocks: [aBlock()],
      settings: [
        { key: "mainPlans", value: { "202701": "plan_fixture_a" } },
        { key: "travel", value: travel },
        { key: "fourYear", value: { activeId: "fouryear_open" } },
        { key: "unknown", value: 1 },
      ],
      fourYear: [opened, older],
    });
    expect(local.plans).toEqual([aPlan()]);
    expect(local.blocks).toEqual([aBlock()]);
    expect(local.mainPlans).toEqual({ "202701": "plan_fixture_a" });
    expect(local.travel).toEqual(travel);
    expect(local.fourYear?.id).toBe("fouryear_open");
  });

  it("falls back to defaults and the oldest four-year plan", () => {
    const older = aFourYear({
      id: "fouryear_old",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const newer = aFourYear({
      id: "fouryear_new",
      createdAt: "2026-02-01T00:00:00.000Z",
    });
    const local = homeLocalFrom({
      plans: [],
      blocks: [],
      settings: [],
      fourYear: [newer, older],
    });
    expect(local.mainPlans).toEqual({});
    expect(local.travel).toEqual(DEFAULT_TRAVEL_SETTINGS);
    expect(local.fourYear?.id).toBe("fouryear_old");
    expect(
      homeLocalFrom({ plans: [], blocks: [], settings: [], fourYear: [] })
        .fourYear,
    ).toBeNull();
  });
});
