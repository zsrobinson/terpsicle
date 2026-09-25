import { describe, expect, it } from "vitest";
import { type Connection, DEFAULT_TRAVEL_SETTINGS } from "~/core/schema";
import {
  groupConnections,
  isBackToBack,
  settingsSummary,
} from "./connection-list";

function aConnection(overrides: Partial<Connection> = {}): Connection {
  const day = overrides.day ?? "M";
  return {
    id: `${day}:STAT400-0101#0>CMSC351-0301#0`,
    day,
    from: {
      sectionKey: "STAT400-0101",
      meetingIndex: 0,
      building: "ESJ",
      room: "0202",
      time: 650,
    },
    to: {
      sectionKey: "CMSC351-0301",
      meetingIndex: 0,
      building: "CSI",
      room: "1115",
      time: 660,
    },
    gapMinutes: 10,
    distanceFeet: 1999,
    walkMinutes: 8,
    verdict: "tight",
    mode: "standard",
    ...overrides,
  };
}

describe("groupConnections", () => {
  it("merges the same walk across days, in week order", () => {
    const groups = groupConnections([
      aConnection({ day: "F" }),
      aConnection({ day: "M" }),
      aConnection({ day: "W" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.days).toEqual(["M", "W", "F"]);
    expect(groups[0]?.connection.day).toBe("M");
    expect(groups[0]?.ids).toEqual([
      "M:STAT400-0101#0>CMSC351-0301#0",
      "W:STAT400-0101#0>CMSC351-0301#0",
      "F:STAT400-0101#0>CMSC351-0301#0",
    ]);
  });

  it("keeps walks apart when anything differs, and puts the serious ones first", () => {
    const ok = aConnection({
      id: "Tu:a",
      day: "Tu",
      verdict: "ok",
      gapMinutes: 75,
      to: { ...aConnection().to, time: 725 },
    });
    const short = aConnection({
      id: "Th:b",
      day: "Th",
      verdict: "insufficient",
      walkMinutes: 12,
    });
    const tight = aConnection({ id: "M:c", day: "M" });
    const unknown = aConnection({
      id: "M:d",
      day: "M",
      verdict: "unknown",
      walkMinutes: null,
      distanceFeet: null,
      from: { ...aConnection().from, building: "PLS" },
    });
    expect(
      groupConnections([ok, unknown, tight, short]).map((g) => g.connection.id),
    ).toEqual(["Th:b", "M:c", "M:d", "Tu:a"]);
  });
});

describe("isBackToBack", () => {
  it("is a short break, or any break that's tight or too short", () => {
    expect(isBackToBack(aConnection({ verdict: "ok", gapMinutes: 30 }))).toBe(
      true,
    );
    expect(isBackToBack(aConnection({ verdict: "ok", gapMinutes: 31 }))).toBe(
      false,
    );
    expect(
      isBackToBack(aConnection({ verdict: "tight", gapMinutes: 45 })),
    ).toBe(true);
  });
});

describe("settingsSummary", () => {
  it("says the settings in one line", () => {
    expect(settingsSummary(DEFAULT_TRAVEL_SETTINGS)).toBe(
      "Typical pace · no extra time · standard routes",
    );
    expect(
      settingsSummary({ pace: "slower", accessible: true, extraMinutes: 5 }),
    ).toBe("Slower pace · +5 min a trip · accessible routes");
  });
});
