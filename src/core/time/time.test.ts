import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { aBlock, aCourse, aMeeting, aSection } from "~/fixtures";
import { DAYS, type Day } from "../schema";
import { calendarDays, calendarHourRange } from "./calendar";
import {
  compareDays,
  formatDays,
  formatDuration,
  formatTime,
  formatTimeRange,
  parseTime,
  sortDays,
} from "./format";
import { formatRelative } from "./relative";
import {
  emptyWeekMask,
  isMaskEmpty,
  markBusy,
  masksIntersect,
  unionMasks,
  weekMaskOf,
} from "./slots";
import {
  blockWeekItems,
  dateSpansIntersect,
  hasSetTimes,
  itemsOverlap,
  sectionWeekItems,
  timesOverlap,
} from "./week";

const TERM = "202701";

describe("formatTime", () => {
  it.each([
    [0, "12am"],
    [5, "12:05am"],
    [570, "9:30am"],
    [660, "11am"],
    [720, "12pm"],
    [735, "12:15pm"],
    [1020, "5pm"],
    [1439, "11:59pm"],
  ])("%i → %s", (m, s) => expect(formatTime(m)).toBe(s));

  it("formats ranges with an en dash", () => {
    expect(formatTimeRange(660, 735)).toBe("11am–12:15pm");
  });

  it("round-trips through parseTime", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1439 }), (m) => {
        expect(parseTime(formatTime(m))).toBe(m);
      }),
    );
  });
});

describe("parseTime", () => {
  it.each([
    ["9:30am", 570],
    ["9:30 AM", 570],
    ["9am", 540],
    ["12pm", 720],
    ["12am", 0],
    ["13:15", 795],
    ["9", 540],
    ["24", 1440],
    ["9 p.m.", 1260],
  ])("%s → %i", (s, m) => expect(parseTime(s)).toBe(m));

  it.each(["", "noon", "13pm", "9:75", "25", "24:30", "0am"])(
    "rejects %j",
    (s) => expect(parseTime(s)).toBeNull(),
  );
});

describe("days", () => {
  it("formats in week order, Testudo style", () => {
    expect(formatDays(["F", "M", "W"])).toBe("MWF");
    expect(formatDays(["Th", "Tu"])).toBe("TuTh");
    expect(formatDays(["Sa"])).toBe("Sa");
  });

  it("sorts and dedupes", () => {
    expect(sortDays(["Su", "M", "M", "Sa"])).toEqual(["M", "Sa", "Su"]);
    expect(
      [..."Th Tu M".split(" ")].sort((a, b) => compareDays(a as Day, b as Day)),
    ).toEqual(["M", "Tu", "Th"]);
  });
});

describe("formatDuration", () => {
  it.each([
    [0, "0 min"],
    [18, "18 min"],
    [60, "1 hr"],
    [65, "1 hr 5 min"],
    [-3, "0 min"],
  ])("%i → %s", (m, s) => expect(formatDuration(m)).toBe(s));
});

describe("formatRelative", () => {
  const now = "2026-09-25T12:00:00.000Z";
  it.each([
    ["2026-09-25T11:59:30.000Z", "just now"],
    ["2026-09-25T12:00:30.000Z", "just now"],
    ["2026-09-25T11:58:00.000Z", "2 min ago"],
    ["2026-09-25T09:00:00.000Z", "3 hr ago"],
    ["2026-09-24T11:00:00.000Z", "yesterday"],
    ["2026-09-21T12:00:00.000Z", "4 days ago"],
  ])("%s → %s", (then, words) => expect(formatRelative(then, now)).toBe(words));

  it("accepts dates and epoch numbers, and is empty for garbage", () => {
    expect(formatRelative(new Date(now), Date.parse(now) + 120_000)).toBe(
      "2 min ago",
    );
    expect(formatRelative("not a date", now)).toBe("");
  });
});

describe("week items", () => {
  it("expands meetings per day, skipping untimed ones", () => {
    const section = aSection({
      meetings: [
        aMeeting({ days: ["Tu", "Th"], start: 660, end: 735 }),
        {
          timed: false,
          kind: "other",
          building: null,
          room: null,
          online: true,
        },
        aMeeting({
          days: ["F"],
          kind: "discussion",
          building: null,
          room: null,
          online: false,
        }),
      ],
    });
    const items = sectionWeekItems("CMSC351", section);
    expect(
      items.map((i) => [i.day, i.source.meetingIndex, i.source.inPerson]),
    ).toEqual([
      ["Tu", 0, true],
      ["Th", 0, true],
      ["F", 2, false],
    ]);
    expect(sectionWeekItems("CMSC351", section)).toBe(items);
    expect(hasSetTimes(section)).toBe(true);
    expect(hasSetTimes(aSection({ meetings: [] }))).toBe(false);
  });

  it("marks online meetings as not in person", () => {
    const [item] = sectionWeekItems(
      "CMSC351",
      aSection({ meetings: [aMeeting({ online: true, building: null })] }),
    );
    expect(item?.source.inPerson).toBe(false);
  });

  it("expands blocks", () => {
    const items = blockWeekItems(aBlock({ termId: TERM, days: ["M", "Sa"] }));
    expect(items.map((i) => i.day)).toEqual(["M", "Sa"]);
    expect(items[0]?.source).toMatchObject({ kind: "block", label: "Lunch" });
  });

  it("treats touching times as not overlapping", () => {
    expect(
      timesOverlap({ start: 600, end: 650 }, { start: 650, end: 700 }),
    ).toBe(false);
    expect(
      timesOverlap({ start: 600, end: 651 }, { start: 650, end: 700 }),
    ).toBe(true);
  });

  it("never overlaps sections whose dates don't intersect", () => {
    const first = { start: "2027-01-25", end: "2027-03-12" };
    const second = { start: "2027-03-22", end: "2027-05-10" };
    expect(dateSpansIntersect(first, second)).toBe(false);
    expect(dateSpansIntersect(first, null)).toBe(true);
    expect(
      dateSpansIntersect(first, { start: "2027-03-12", end: "2027-04-01" }),
    ).toBe(true);
    const a = sectionWeekItems("CMSC351", aSection({ dates: first }))[0];
    const b = sectionWeekItems("CMSC330", aSection({ dates: second }))[0];
    const c = sectionWeekItems("CMSC330", aSection())[0];
    if (!a || !b || !c) throw new Error("expected items");
    expect(itemsOverlap(a, b)).toBe(false);
    expect(itemsOverlap(a, c)).toBe(true);
  });
});

describe("week masks", () => {
  const item = fc.record({
    day: fc.constantFrom(...DAYS),
    start: fc.integer({ min: 0, max: 1430 }),
    len: fc.integer({ min: 1, max: 300 }),
  });

  it("never misses a real overlap (masks are a superset)", () => {
    fc.assert(
      fc.property(item, item, (a, b) => {
        const x = {
          day: a.day,
          start: a.start,
          end: Math.min(1440, a.start + a.len),
        };
        const y = {
          day: b.day,
          start: b.start,
          end: Math.min(1440, b.start + b.len),
        };
        const real = x.day === y.day && timesOverlap(x, y);
        if (real)
          expect(masksIntersect(weekMaskOf([x]), weekMaskOf([y]))).toBe(true);
      }),
    );
  });

  it("is exact on 5-minute boundaries", () => {
    const aligned = fc.record({
      day: fc.constantFrom(...DAYS),
      startSlot: fc.integer({ min: 0, max: 287 }),
      slots: fc.integer({ min: 1, max: 60 }),
    });
    const toItem = (a: { day: Day; startSlot: number; slots: number }) => ({
      day: a.day,
      start: a.startSlot * 5,
      end: Math.min(1440, (a.startSlot + a.slots) * 5),
    });
    fc.assert(
      fc.property(aligned, aligned, (a, b) => {
        const x = toItem(a);
        const y = toItem(b);
        const real = x.day === y.day && timesOverlap(x, y);
        expect(masksIntersect(weekMaskOf([x]), weekMaskOf([y]))).toBe(real);
      }),
    );
  });

  it("covers a whole day and unions", () => {
    const full = emptyWeekMask();
    markBusy(full, "Su", 0, 1440);
    expect(
      masksIntersect(full, weekMaskOf([{ day: "Su", start: 1435, end: 1440 }])),
    ).toBe(true);
    expect(
      masksIntersect(full, weekMaskOf([{ day: "Sa", start: 0, end: 1440 }])),
    ).toBe(false);
    const u = unionMasks([
      weekMaskOf([{ day: "M", start: 600, end: 650 }]),
      full,
    ]);
    expect(
      masksIntersect(u, weekMaskOf([{ day: "M", start: 640, end: 700 }])),
    ).toBe(true);
    expect(isMaskEmpty(emptyWeekMask())).toBe(true);
    expect(isMaskEmpty(u)).toBe(false);
  });
});

describe("calendar extent", () => {
  it("is at least 8am–5pm", () => {
    expect(calendarHourRange([])).toEqual({ start: 480, end: 1020 });
    expect(calendarHourRange([{ start: 600, end: 650 }])).toEqual({
      start: 480,
      end: 1020,
    });
  });

  it("grows to whole hours around the plan", () => {
    expect(
      calendarHourRange([
        { start: 450, end: 500 },
        { start: 1110, end: 1185 },
      ]),
    ).toEqual({
      start: 420,
      end: 1200,
    });
    expect(calendarHourRange([{ start: 1380, end: 1440 }]).end).toBe(1440);
  });

  it("adds Saturday and Sunday only when needed", () => {
    const course = aCourse();
    const items = sectionWeekItems(
      course.code,
      aSection({ meetings: [aMeeting({ days: ["Tu", "Sa"] })] }),
    );
    expect(calendarDays([])).toEqual(["M", "Tu", "W", "Th", "F"]);
    expect(calendarDays(items)).toEqual(["M", "Tu", "W", "Th", "F", "Sa"]);
    expect(calendarDays([{ day: "Su" }])).toEqual([
      "M",
      "Tu",
      "W",
      "Th",
      "F",
      "Su",
    ]);
  });
});
