import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_TRAVEL_SETTINGS,
  ROUTES_MAX_FEET,
  type TravelSettings,
} from "../schema";
import { sectionRef } from "../catalog/catalog-index";
import { aCourse, aMeeting, aSection } from "../test-support/builders";
import {
  connectionsByDay,
  planConnections,
} from "./connections";
import {
  connectionToExplain,
  travelMath,
  VERDICT_WORDS,
  verdictMessage,
} from "./explain";
import {
  decodeRoutes,
  encodeRoutes,
  RoutesFormatError,
  routeDistance,
} from "./routes-binary";
import {
  connectionVerdict,
  feetPerMinute,
  formatFeet,
  travelMode,
  walkMinutes,
} from "./walk";

const typical = DEFAULT_TRAVEL_SETTINGS;

/** IRB ↔ ESJ 1320 ft standard, 1500 accessible; SHM unknown to everything. */
function campus() {
  const feet: Record<string, number> = {
    "standard:IRB>ESJ": 1320,
    "standard:ESJ>IRB": 1320,
    "accessible:IRB>ESJ": 1500,
    "accessible:ESJ>IRB": 1500,
    "standard:IRB>KEY": 2640,
    "standard:KEY>IRB": 2640,
    "standard:ESJ>KEY": 700,
    "standard:KEY>ESJ": 700,
  };
  return decodeRoutes(
    encodeRoutes({
      buildings: ["IRB", "ESJ", "KEY", "SHM"],
      distance: (mode, from, to) => feet[`${mode}:${from}>${to}`] ?? null,
    }),
  );
}

describe("routes binary", () => {
  it("round-trips distances per mode, with a 0 diagonal and unknown cells", () => {
    const table = campus();
    expect(table.buildings).toEqual(["ESJ", "IRB", "KEY", "SHM"]);
    expect(routeDistance(table, "IRB", "ESJ", "standard")).toBe(1320);
    expect(routeDistance(table, "IRB", "ESJ", "accessible")).toBe(1500);
    expect(routeDistance(table, "IRB", "IRB", "standard")).toBe(0);
    expect(routeDistance(table, "IRB", "SHM", "standard")).toBeNull();
    expect(routeDistance(table, "IRB", "NOPE", "standard")).toBeNull();
    expect(routeDistance(table, "NOPE", "NOPE", "standard")).toBe(0);
  });

  it("round-trips arbitrary matrices (property)", () => {
    const building = fc.stringMatching(/^[A-Z]{2,4}$/);
    fc.assert(
      fc.property(
        fc.uniqueArray(building, { minLength: 1, maxLength: 8 }),
        fc.array(fc.option(fc.integer({ min: 0, max: 70_000 }), { nil: null }), { minLength: 128, maxLength: 128 }),
        (buildings, cells) => {
          const sorted = [...buildings].sort();
          const cell = (mode: string, from: string, to: string) => {
            const i = sorted.indexOf(from);
            const j = sorted.indexOf(to);
            return cells[((mode === "standard" ? 0 : 64) + i * 8 + j) % 128] ?? null;
          };
          const table = decodeRoutes(encodeRoutes({ buildings, distance: cell }));
          for (const mode of ["standard", "accessible"] as const)
            for (const from of sorted)
              for (const to of sorted) {
                const expected = from === to ? 0 : cell(mode, from, to);
                expect(routeDistance(table, from, to, mode)).toBe(
                  expected === null ? null : Math.min(ROUTES_MAX_FEET, expected),
                );
              }
        },
      ),
    );
  });

  it("decodes from a subarray at an unaligned offset", () => {
    const bytes = encodeRoutes({ buildings: ["A1", "B1"], distance: () => 42 });
    const padded = new Uint8Array(bytes.length + 3);
    padded.set(bytes, 3);
    const table = decodeRoutes(padded.subarray(3));
    expect(routeDistance(table, "A1", "B1", "standard")).toBe(42);
    expect(routeDistance(decodeRoutes(bytes.buffer as ArrayBuffer), "B1", "A1", "accessible")).toBe(42);
  });

  it("clamps, rounds and treats non-finite as unknown", () => {
    const table = decodeRoutes(
      encodeRoutes({
        buildings: ["AA", "BB", "CC"],
        distance: (_m, from, to) => (from === "AA" ? 1e9 : to === "AA" ? 10.6 : Number.NaN),
      }),
    );
    expect(routeDistance(table, "AA", "BB", "standard")).toBe(ROUTES_MAX_FEET);
    expect(routeDistance(table, "BB", "AA", "standard")).toBe(11);
    expect(routeDistance(table, "BB", "CC", "standard")).toBeNull();
  });

  describe("rejects bad files", () => {
    const good = encodeRoutes({ buildings: ["AA", "BB"], distance: () => 1 });
    const mutate = (f: (b: Uint8Array, v: DataView) => void, bytes = good.slice()) => {
      f(bytes, new DataView(bytes.buffer));
      return bytes;
    };
    it.each([
      ["too short", new Uint8Array(4)],
      ["bad magic", mutate((b) => { b[0] = 0; })],
      ["bad version", mutate((_b, v) => v.setUint16(4, 99, true))],
      ["bad mode count", mutate((_b, v) => v.setUint8(8, 3))],
      ["wrong length", good.slice(0, good.length - 2)],
      ["building count mismatch", mutate((_b, v) => v.setUint16(6, 3, true))],
    ])("%s", (_name, bytes) => {
      expect(() => decodeRoutes(bytes)).toThrow(RoutesFormatError);
    });

    it("bad index JSON", () => {
      const bytes = good.slice();
      bytes[16] = "!".charCodeAt(0);
      expect(() => decodeRoutes(bytes)).toThrow(/isn't JSON/);
    });

    it("unsorted or invalid index", () => {
      const index = (json: string) => {
        const text = new TextEncoder().encode(json);
        const len = 16 + text.length;
        const d = len + ((4 - (len % 4)) % 4);
        const out = new Uint8Array(d + 2 * 2 * 2 * 2);
        out.set(good.subarray(0, 16));
        new DataView(out.buffer).setUint32(12, text.length, true);
        out.set(text, 16);
        return out;
      };
      expect(() => decodeRoutes(index('{"buildings":["BB","AA"],"modes":["standard","accessible"]}'))).toThrow(/sorted/);
      expect(() => decodeRoutes(index('{"buildings":["BB","AA"],"modes":["x"]}'))).toThrow(/invalid/);
    });
  });
});

describe("walking math", () => {
  it("is ceil(feet / (mph × 88)) + extra", () => {
    expect(feetPerMinute(typical)).toBe(264);
    expect(walkMinutes(1320, typical)).toBe(5);
    expect(walkMinutes(1321, typical)).toBe(6);
    expect(walkMinutes(1320, { ...typical, pace: "slower" })).toBe(6);
    expect(walkMinutes(1320, { ...typical, pace: "faster", extraMinutes: 5 })).toBe(10);
    expect(walkMinutes(0, typical)).toBe(0);
  });

  it("gives verdicts at the 75% line", () => {
    expect(connectionVerdict(null, 10)).toBe("unknown");
    expect(connectionVerdict(11, 10)).toBe("insufficient");
    expect(connectionVerdict(10, 10)).toBe("tight");
    expect(connectionVerdict(8, 10)).toBe("tight");
    expect(connectionVerdict(7, 10)).toBe("ok");
    expect(connectionVerdict(0, 0)).toBe("tight");
  });

  it("picks the matrix from Accessible routes", () => {
    expect(travelMode(typical)).toBe("standard");
    expect(travelMode({ ...typical, accessible: true })).toBe("accessible");
  });

  it("formats feet and miles", () => {
    expect(formatFeet(1240)).toBe("1,240 ft");
    expect(formatFeet(3300)).toBe("0.63 mi");
  });
});

describe("connections", () => {
  const routes = campus();
  const ref = (code: string, meetings: ReturnType<typeof aMeeting>[], extra = {}) => {
    const course = aCourse({ code, sections: [aSection({ meetings, ...extra })] });
    // biome-ignore lint/style/noNonNullAssertion: built with one section just above
    return sectionRef(course, course.sections[0]!);
  };

  it("links consecutive in-person meetings in different buildings", () => {
    const a = ref("CMSC351", [aMeeting({ days: ["M", "W"], start: 600, end: 650, building: "IRB" })]);
    const b = ref("CMSC330", [aMeeting({ days: ["M", "W"], start: 660, end: 710, building: "ESJ" })]);
    const cs = planConnections([b, a], typical, routes);
    expect(cs).toHaveLength(2);
    const [mon] = cs;
    expect(mon).toMatchObject({
      id: "M:CMSC351-0101#0>CMSC330-0101#0",
      day: "M",
      from: { sectionKey: "CMSC351-0101", building: "IRB", room: "0318", time: 650 },
      to: { sectionKey: "CMSC330-0101", building: "ESJ", time: 660 },
      gapMinutes: 10,
      distanceFeet: 1320,
      walkMinutes: 5,
      verdict: "ok",
      mode: "standard",
    });
    expect(connectionsByDay(cs).map((d) => [d.day, d.connections.length])).toEqual([
      ["M", 1],
      ["W", 1],
    ]);
  });

  it("uses the accessible matrix and extra minutes", () => {
    const a = ref("CMSC351", [aMeeting({ days: ["M"], end: 650, building: "IRB" })]);
    const b = ref("CMSC330", [aMeeting({ days: ["M"], start: 657, end: 710, building: "ESJ" })]);
    const settings: TravelSettings = { pace: "typical", accessible: true, extraMinutes: 2 };
    const [c] = planConnections([a, b], settings, routes);
    expect(c).toMatchObject({ distanceFeet: 1500, walkMinutes: 8, verdict: "insufficient", mode: "accessible" });
  });

  it("skips same-building pairs, online meetings and non-consecutive ones", () => {
    const a = ref("CMSC351", [aMeeting({ days: ["M"], start: 540, end: 590, building: "IRB" })]);
    const same = ref("CMSC330", [aMeeting({ days: ["M"], start: 600, end: 650, building: "IRB" })]);
    const online = ref("ENGL393", [aMeeting({ days: ["M"], start: 655, end: 700, building: null, room: null, online: true })]);
    const far = ref("MATH240", [aMeeting({ days: ["M"], start: 720, end: 770, building: "ESJ" })]);
    const cs = planConnections([a, same, online, far], typical, routes);
    // IRB (same) → ESJ (far) is the only walk: the online class doesn't count.
    expect(cs.map((c) => `${c.from.sectionKey}>${c.to.sectionKey}`)).toEqual(["CMSC330-0101>MATH240-0101"]);
  });

  it("has no connection into a class something overlaps", () => {
    const long = ref("CMSC351", [aMeeting({ days: ["M"], start: 540, end: 720, building: "IRB" })]);
    const inside = ref("CMSC330", [aMeeting({ days: ["M"], start: 600, end: 650, building: "ESJ" })]);
    const after = ref("MATH240", [aMeeting({ days: ["M"], start: 730, end: 780, building: "KEY" })]);
    const cs = planConnections([long, inside, after], typical, routes);
    // CMSC351 ends last before MATH240, so that's the walk; CMSC330 overlaps CMSC351.
    expect(cs.map((c) => `${c.from.sectionKey}>${c.to.sectionKey}`)).toEqual(["CMSC351-0101>MATH240-0101"]);
  });

  it("links meetings within one section (lecture → discussion)", () => {
    const s = ref("CMSC351", [
      aMeeting({ days: ["Tu"], start: 600, end: 675, building: "IRB" }),
      aMeeting({ days: ["Tu"], start: 680, end: 730, building: "KEY", kind: "discussion" }),
    ]);
    const [c] = planConnections([s], typical, routes);
    expect(c).toMatchObject({ from: { meetingIndex: 0 }, to: { meetingIndex: 1 }, walkMinutes: 10, verdict: "insufficient" });
  });

  it("ignores meetings whose dates don't intersect", () => {
    const first = ref("CMSC351", [aMeeting({ days: ["M"], end: 650, building: "IRB" })], {
      dates: { start: "2027-01-25", end: "2027-03-12" },
    });
    const second = ref("CMSC330", [aMeeting({ days: ["M"], start: 660, end: 710, building: "ESJ" })], {
      dates: { start: "2027-03-22", end: "2027-05-10" },
    });
    expect(planConnections([first, second], typical, routes)).toEqual([]);
  });

  it("links from each half-term class when two share an end time", () => {
    const h1 = ref("CMSC351", [aMeeting({ days: ["M"], end: 650, building: "IRB" })], {
      dates: { start: "2027-01-25", end: "2027-03-12" },
    });
    const h2 = ref("CMSC330", [aMeeting({ days: ["M"], end: 650, building: "KEY" })], {
      dates: { start: "2027-03-22", end: "2027-05-10" },
    });
    const full = ref("MATH240", [aMeeting({ days: ["M"], start: 660, end: 710, building: "ESJ" })]);
    const cs = planConnections([h1, h2, full], typical, routes);
    expect(cs.map((c) => c.from.sectionKey).sort()).toEqual(["CMSC330-0101", "CMSC351-0101"]);
  });

  it("is unknown without routes or without a distance", () => {
    const a = ref("CMSC351", [aMeeting({ days: ["M"], end: 650, building: "IRB" })]);
    const b = ref("CMSC330", [aMeeting({ days: ["M"], start: 660, end: 710, building: "SHM" })]);
    for (const table of [null, routes]) {
      const [c] = planConnections([a, b], typical, table);
      expect(c).toMatchObject({ verdict: "unknown", distanceFeet: null, walkMinutes: null });
    }
  });
});

describe("explanations", () => {
  const routes = campus();
  const pair = (gapStart: number) => {
    const a = aCourse({ code: "CMSC351", sections: [aSection({ meetings: [aMeeting({ days: ["M"], end: 650, building: "IRB" })] })] });
    const b = aCourse({ code: "CMSC330", sections: [aSection({ meetings: [aMeeting({ days: ["M"], start: gapStart, end: gapStart + 50, building: "KEY" })] })] });
    // biome-ignore lint/style/noNonNullAssertion: one section each
    const [c] = planConnections([sectionRef(a, a.sections[0]!), sectionRef(b, b.sections[0]!)], typical, routes);
    if (!c) throw new Error("expected a connection");
    return c;
  };

  it("says how late you'd be", () => {
    const c = pair(660);
    expect(verdictMessage(c)).toEqual([
      { kind: "text", text: "Tight: " },
      { kind: "duration", minutes: 10 },
      { kind: "text", text: " to get there, " },
      { kind: "duration", minutes: 10 },
      { kind: "text", text: " between classes." },
    ]);
    const late = pair(655);
    expect(verdictMessage(late)[0]).toEqual({ kind: "text", text: "Not enough time: " });
    expect(verdictMessage(late).slice(-3)).toEqual([
      { kind: "text", text: " You'd be about " },
      { kind: "duration", minutes: 5 },
      { kind: "text", text: " late." },
    ]);
    expect(verdictMessage(pair(700))[0]).toEqual({ kind: "text", text: "Plenty of time: " });
    expect(verdictMessage({ ...c, verdict: "unknown", distanceFeet: null, walkMinutes: null })).toEqual([
      { kind: "text", text: `${VERDICT_WORDS.unknown}.` },
    ]);
  });

  it("shows the math for one real connection", () => {
    const c = pair(655);
    expect(travelMath(c, typical)).toEqual({
      mode: "standard",
      distanceFeet: 2640,
      mph: 3,
      feetPerMinute: 264,
      exactMinutes: 10,
      walkingMinutes: 10,
      extraMinutes: 0,
      totalMinutes: 10,
      gapMinutes: 5,
      tightFromMinutes: 3.75,
      verdict: "insufficient",
    });
    expect(travelMath({ ...c, distanceFeet: null, walkMinutes: null }, typical)).toBeNull();
    const ok = pair(700);
    expect(connectionToExplain([ok, c])).toBe(c);
    expect(connectionToExplain([ok])).toBe(ok);
    expect(connectionToExplain([{ ...ok, verdict: "unknown" }])).toBeNull();
  });
});
