import { describe, expect, it } from "vitest";
import { DEFAULT_TRAVEL_SETTINGS, type SeatTuple } from "../schema";
import { buildCatalogIndex, sectionRef } from "../catalog/catalog-index";
import { buildFitContext } from "../fit/fit";
import { aCourse, aMeeting, aPlan, aSection, placed } from "../test-support/builders";
import { backupSection, registrationOrder } from "./registration";
import { canWatchSeats, seatCounts, seatLevel, seatStatus } from "./seats";

const TERM = "202701";
const counts = (open: number, total: number, waitlist = 0) => ({ open, total, waitlist, holdfile: 0 });

describe("seat words", () => {
  it.each([
    [counts(12, 36), "open", "12 of 36 open"],
    [counts(6, 36), "open", "6 of 36 open"],
    [counts(5, 36), "low", "5 left"],
    [counts(2, 36), "low", "2 left"],
    [counts(25, 300), "low", "25 left"],
    [counts(31, 300), "open", "31 of 300 open"],
    [counts(0, 36, 9), "full", "Full · 9 waitlisted"],
    [counts(0, 36), "full", "Full"],
    [null, "unknown", "Seats unknown"],
  ] as const)("%o is %s: %s", (c, level, words) => {
    expect(seatLevel(c)).toBe(level);
    expect(seatStatus(c).words).toBe(words);
  });

  it("fills the meter by seats taken", () => {
    expect(seatStatus(counts(12, 36)).filled).toBeCloseTo(24 / 36);
    expect(seatStatus(counts(0, 0)).filled).toBe(1);
    expect(seatStatus(null).filled).toBeNull();
  });

  it("offers the bell on low and full sections only", () => {
    expect(canWatchSeats(counts(2, 36))).toBe(true);
    expect(canWatchSeats(counts(0, 36))).toBe(true);
    expect(canWatchSeats(counts(30, 36))).toBe(false);
    expect(canWatchSeats(null)).toBe(false);
  });

  it("reads the seats map", () => {
    const seats: Record<string, SeatTuple> = { "CMSC351-0101": [1, 2, 3, 4] };
    expect(seatCounts(seats, "CMSC351-0101")).toEqual({ open: 1, total: 2, waitlist: 3, holdfile: 4 });
    expect(seatCounts(seats, "CMSC351-0201")).toBeNull();
    expect(seatCounts(null, "CMSC351-0101")).toBeNull();
  });
});

describe("registration order", () => {
  it("puts the section most likely to fill first", () => {
    const refs = ["CMSC351", "CMSC330", "MATH240", "ENGL393", "STAT400"].map((code) => {
      const course = aCourse({ code });
      // biome-ignore lint/style/noNonNullAssertion: builder has one section
      return sectionRef(course, course.sections[0]!);
    });
    const seats: Record<string, SeatTuple> = {
      "CMSC351-0101": [30, 100, 0, 0],
      "CMSC330-0101": [3, 40, 0, 0],
      "MATH240-0101": [0, 40, 12, 0],
      "STAT400-0101": [3, 200, 0, 0],
    };
    expect(registrationOrder(refs, seats).map((r) => r.course.code)).toEqual([
      "MATH240",
      "STAT400",
      "CMSC330",
      "CMSC351",
      "ENGL393",
    ]);
  });
});

describe("backup section", () => {
  const other = aCourse({ code: "CMSC330", sections: [aSection({ meetings: [aMeeting({ start: 600, end: 650 })] })] });
  const course = aCourse({
    code: "CMSC351",
    sections: [
      aSection({ code: "0101", meetings: [aMeeting({ days: ["Tu"] })] }),
      aSection({ code: "0201", meetings: [aMeeting({ start: 620, end: 670 })] }), // overlaps CMSC330
      aSection({ code: "0301", meetings: [aMeeting({ days: ["Th"] })] }),
      aSection({ code: "0401", meetings: [aMeeting({ days: ["Th"], start: 900, end: 950 })] }),
      aSection({ code: "0501", meetings: [aMeeting({ days: ["F"], start: 900, end: 950 })] }),
    ],
  });
  const ctx = buildFitContext({
    plan: aPlan({ termId: TERM, courses: [placed(other, "0101"), placed(course, "0101")] }),
    index: buildCatalogIndex(TERM, [other, course]),
    blocks: [],
    travel: DEFAULT_TRAVEL_SETTINGS,
    routes: null,
  });
  // biome-ignore lint/style/noNonNullAssertion: built above
  const current = course.sections[0]!;

  it("picks a fitting section with the most open seats", () => {
    const seats: Record<string, SeatTuple> = {
      "CMSC351-0201": [50, 50, 0, 0],
      "CMSC351-0301": [4, 30, 0, 0],
      "CMSC351-0401": [9, 30, 0, 0],
      "CMSC351-0501": [0, 30, 0, 0],
    };
    expect(backupSection(ctx, course, current, seats)?.code).toBe("0401");
  });

  it("prefers unknown counts over full sections, then section order", () => {
    expect(backupSection(ctx, course, current, { "CMSC351-0301": [0, 30, 0, 0] })?.code).toBe("0401");
    expect(backupSection(ctx, course, current, null)?.code).toBe("0301");
  });

  it("is null when nothing else fits", () => {
    const single = aCourse({ code: "CMSC351", sections: [current] });
    expect(backupSection(ctx, single, current, null)).toBeNull();
  });
});
