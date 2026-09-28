import { describe, expect, it } from "vitest";
import {
  parseQuickAdd,
  type QuickAddOptions,
  quickAddDateOk,
  quickAddFields,
} from "./quick-add";
import { ownTaskDue } from "./tasks";

// Todo's composer, read like Todoist. 2026-09-29 is a Tuesday; noon in New
// York (EDT, UTC−4) is 16:00Z.
const NOON = Date.parse("2026-09-29T16:00:00.000Z");
const COURSES = ["CMSC351", "HIST200", "MATH240"];

const read = (text: string, options: Partial<QuickAddOptions> = {}) =>
  parseQuickAdd(text, { now: NOON, courses: COURSES, ...options });

/** Each recognized part as the text it covers. */
const spans = (text: string, options: Partial<QuickAddOptions> = {}) =>
  read(text, options).parts.map((p) => [p.kind, text.slice(p.start, p.end)]);

describe("parseQuickAdd: the owner's examples", () => {
  it('reads "read ch 4 for hist200 fri 5pm"', () => {
    const text = "read ch 4 for hist200 fri 5pm";
    expect(read(text)).toMatchObject({
      title: "read ch 4",
      date: "2026-10-02",
      time: 17 * 60,
      course: "HIST200",
    });
    expect(spans(text)).toEqual([
      ["course", "for hist200"],
      ["date", "fri"],
      ["time", "5pm"],
    ]);
  });

  it('reads "PS3 due tomorrow 11:59pm cmsc351"', () => {
    const text = "PS3 due tomorrow 11:59pm cmsc351";
    expect(read(text)).toMatchObject({
      title: "PS3",
      date: "2026-09-30",
      time: 23 * 60 + 59,
      course: "CMSC351",
    });
    expect(spans(text)).toEqual([
      ["date", "due tomorrow"],
      ["time", "11:59pm"],
      ["course", "cmsc351"],
    ]);
  });

  it('reads "exam 2 oct 14" as October 14th, not "2 oct"', () => {
    expect(read("exam 2 oct 14")).toMatchObject({
      title: "exam 2",
      date: "2026-10-14",
      time: null,
      course: null,
    });
  });
});

describe("parseQuickAdd: New York's clock", () => {
  it("reads tomorrow from New York's date, not UTC's", () => {
    // 11:30pm Tuesday in New York is already Wednesday in UTC.
    const late = Date.parse("2026-09-30T03:30:00.000Z");
    expect(read("tomorrow", { now: late }).date).toBe("2026-09-30");
    expect(read("today", { now: late }).date).toBe("2026-09-29");
  });

  it("dates a time alone today while it's ahead, else tomorrow", () => {
    expect(read("call mom 5pm")).toMatchObject({
      title: "call mom",
      date: "2026-09-29",
      time: 17 * 60,
    });
    expect(read("call mom 9am").date).toBe("2026-09-30");
  });

  it("keeps 11:59pm on its day across the end of daylight time", () => {
    // Saturday Oct 31, 2026; clocks go back early Sunday Nov 1.
    const saturday = Date.parse("2026-10-31T16:00:00.000Z");
    const text = "Lab 8 due sun 11:59pm cmsc351";
    const parse = read(text, { now: saturday });
    expect(parse).toMatchObject({ date: "2026-11-01", time: 23 * 60 + 59 });
    const fields = quickAddFields(text, parse);
    expect(
      ownTaskDue(fields?.dueDate ?? null, fields?.dueTime ?? null),
    ).toEqual(
      { dueDate: "2026-11-01", dueAt: "2026-11-02T04:59:00.000Z" }, // EST
    );
  });

  it("uses daylight time from the second Sunday in March", () => {
    const before = read("quiz mar 13 2027 9am");
    const after = read("quiz mar 15 2027 9am");
    expect(ownTaskDue(before.date, before.time).dueAt).toBe(
      "2027-03-13T14:00:00.000Z", // EST
    );
    expect(ownTaskDue(after.date, after.time).dueAt).toBe(
      "2027-03-15T13:00:00.000Z", // EDT
    );
  });
});

describe("parseQuickAdd: dates", () => {
  it.each([
    ["mon", "2026-10-05"],
    ["tue", "2026-09-29"], // today is Tuesday
    ["this thursday", "2026-10-01"],
    ["Friday", "2026-10-02"],
    ["sun", "2026-10-04"],
    ["next fri", "2026-10-09"],
    ["next mon", "2026-10-05"],
    ["next week", "2026-10-05"],
    ["in 3 days", "2026-10-02"],
    ["in a week", "2026-10-06"],
    ["in 2 weeks", "2026-10-13"],
    ["tmrw", "2026-09-30"],
    ["October 14th", "2026-10-14"],
    ["oct. 14, 2027", "2027-10-14"],
    ["14 oct", "2026-10-14"],
    ["10/14", "2026-10-14"],
    ["10/14/27", "2027-10-14"],
    ["12/1/2026", "2026-12-01"],
  ])("reads %s", (text, date) => {
    expect(read(`essay ${text}`)).toMatchObject({ title: "essay", date });
  });

  it("starts next week on Sunday when that's the setting", () => {
    expect(read("next week", { weekStart: "sunday" }).date).toBe("2026-10-04");
  });

  it("reads a month and day as the coming one, unless it's under a month gone", () => {
    const november = Date.parse("2026-11-20T17:00:00.000Z");
    expect(read("jan 20", { now: november }).date).toBe("2027-01-20");
    expect(read("sep 25").date).toBe("2026-09-25");
  });

  it("leaves a date that doesn't exist in the title", () => {
    expect(read("pset 2/30")).toMatchObject({ title: "pset 2/30", date: null });
    expect(read("feb 30 thing").date).toBeNull();
  });

  it("doesn't find days inside words", () => {
    expect(read("friend's party").date).toBeNull();
    expect(read("satisfy the monitor").date).toBeNull();
    expect(read("Wednesday Addams essay").date).toBe("2026-09-30");
  });
});

describe("parseQuickAdd: times", () => {
  it.each([
    ["5pm", 17 * 60],
    ["5 PM", 17 * 60],
    ["5:30p", 17 * 60 + 30],
    ["11:59 p.m.", 23 * 60 + 59],
    ["12am", 0],
    ["12pm", 12 * 60],
    ["at 5", 17 * 60],
    ["at 9", 9 * 60],
    ["at 17:00", 17 * 60],
    ["by 9:15am", 9 * 60 + 15],
    ["noon", 12 * 60],
    ["midnight", 23 * 60 + 59],
  ])("reads %s", (text, time) => {
    expect(read(`essay fri ${text}`)).toMatchObject({ title: "essay", time });
  });

  it("leaves counts alone", () => {
    expect(read("read ch 4").time).toBeNull();
    expect(read("do 3 a day").time).toBeNull();
    expect(read("13pm").time).toBeNull();
  });
});

describe("parseQuickAdd: courses", () => {
  it("knows only the person's courses, spaced or not, any case", () => {
    expect(read("HIST 200 reading")).toMatchObject({
      title: "reading",
      course: "HIST200",
    });
    expect(read("reading in math240")).toMatchObject({
      title: "reading",
      course: "MATH240",
    });
    expect(read("ABCD123 reading")).toMatchObject({
      title: "ABCD123 reading",
      course: null,
    });
  });
});

describe("parseQuickAdd: taking a part off", () => {
  it("leaves its words in the title", () => {
    const parse = read("read ch 4 fri cmsc351", { ignore: new Set(["date"]) });
    expect(parse).toMatchObject({
      title: "read ch 4 fri",
      date: null,
      course: "CMSC351",
    });
    expect(parse.parts.map((p) => p.kind)).toEqual(["course"]);
  });
});

describe("quickAddFields", () => {
  it("keeps the typed words when everything was recognized", () => {
    const text = "cmsc351 fri";
    expect(quickAddFields(text, read(text))).toEqual({
      title: "cmsc351 fri",
      courseCode: "CMSC351",
      dueDate: "2026-10-02",
      dueTime: null,
    });
  });

  it("puts the pickers over the text, and drops a time with no date", () => {
    const text = "essay fri 5pm";
    expect(
      quickAddFields(text, read(text), {
        date: "2026-10-05",
        course: "MATH240",
      }),
    ).toEqual({
      title: "essay",
      courseCode: "MATH240",
      dueDate: "2026-10-05",
      dueTime: 17 * 60,
    });
    expect(quickAddFields(text, read(text), { date: null })).toMatchObject({
      dueDate: null,
      dueTime: null,
    });
  });

  it("adds nothing for nothing typed", () => {
    expect(quickAddFields("  ", read("  "))).toBeNull();
  });

  it("knows the dates Todo keeps", () => {
    expect(quickAddDateOk("2026-09-01", NOON)).toBe(true);
    expect(quickAddDateOk("2026-08-01", NOON)).toBe(false);
    expect(quickAddDateOk(null, NOON)).toBe(true);
  });
});
