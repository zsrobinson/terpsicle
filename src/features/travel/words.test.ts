import { describe, expect, it } from "vitest";
import {
  type Connection,
  DEFAULT_TRAVEL_SETTINGS,
  type TravelSettings,
} from "~/core/schema";
import { travelMath } from "~/core/travel";
import { aMeeting, aSection } from "~/fixtures";
import {
  connectionDays,
  daysInWords,
  estimateLine,
  meetingTimes,
  verdictShort,
} from "./words";

function aConnection(overrides: Partial<Connection> = {}): Connection {
  return {
    id: "M:STAT400-0101#0>CMSC351-0301#0",
    day: "M",
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

function mathFor(settings: TravelSettings, walkMinutes: number) {
  const math = travelMath(aConnection({ walkMinutes }), settings);
  if (!math) throw new Error("no math");
  return math;
}

describe("estimateLine", () => {
  it("shows the division and the rounding (SPEC §3.7's example)", () => {
    expect(estimateLine(mathFor(DEFAULT_TRAVEL_SETTINGS, 8))).toBe(
      "1,999 ft at 3.0 mph = 7.6 min, rounded up to 8 min",
    );
  });

  it("adds the extra time per trip", () => {
    expect(
      estimateLine(
        mathFor({ ...DEFAULT_TRAVEL_SETTINGS, extraMinutes: 5 }, 13),
      ),
    ).toBe(
      "1,999 ft at 3.0 mph = 7.6 min, rounded up to 8 min, + 5 min extra = 13 min",
    );
  });

  it("doesn't mention rounding when there's nothing to round", () => {
    const math = travelMath(
      aConnection({ distanceFeet: 1320, walkMinutes: 5 }),
      DEFAULT_TRAVEL_SETTINGS,
    );
    expect(math && estimateLine(math)).toBe("1,320 ft at 3.0 mph = 5 min");
  });
});

describe("words", () => {
  it("lists days the way people say them", () => {
    expect(daysInWords(["M"])).toBe("Mon");
    expect(daysInWords(["Tu", "Th"])).toBe("Tue and Thu");
    expect(daysInWords(["M", "W", "F"])).toBe("Mon, Wed and Fri");
  });

  it("finds the same walk on other days", () => {
    const monday = aConnection();
    const wednesday = aConnection({ id: "W:x", day: "W" });
    const other = aConnection({
      id: "F:y",
      day: "F",
      to: { ...monday.to, time: 700 },
    });
    expect(connectionDays(wednesday, [monday, wednesday, other])).toEqual([
      "M",
      "W",
    ]);
  });

  it("says which mode has no route", () => {
    expect(
      verdictShort(
        aConnection({
          verdict: "no-route",
          mode: "accessible",
          walkMinutes: null,
        }),
      ),
    ).toBe("No accessible route");
    expect(verdictShort(aConnection({ verdict: "no-route" }))).toBe("No route");
  });

  it("writes a section's meeting times", () => {
    const section = aSection({
      meetings: [
        aMeeting({ days: ["M", "W", "F"], start: 660, end: 710 }),
        aMeeting({ days: ["Tu"], start: 840, end: 890 }),
      ],
    });
    expect(meetingTimes(section)).toBe("MWF 11am–11:50am · Tu 2pm–2:50pm");
  });
});
