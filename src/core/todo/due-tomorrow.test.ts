import { describe, expect, it } from "vitest";
import { aTodoItem } from "~/fixtures";
import {
  dueTomorrowKey,
  dueTomorrowPush,
  dueTomorrowRun,
} from "./due-tomorrow";

const at = (iso: string) => Date.parse(iso);

describe("dueTomorrowRun", () => {
  it("starts at 6pm New York time in daylight time (22:00 UTC)", () => {
    // Monday, Sep 28 2026, EDT: 5:43pm and 6:03pm, the Todo cron's runs either side.
    expect(dueTomorrowRun(at("2026-09-28T21:43:00Z"))).toBeNull();
    expect(dueTomorrowRun(at("2026-09-28T21:59:00Z"))).toBeNull();
    expect(dueTomorrowRun(at("2026-09-28T22:03:00Z"))).toEqual({
      today: "2026-09-28",
      tomorrow: "2026-09-29",
    });
  });

  it("starts at 6pm New York time in standard time (23:00 UTC)", () => {
    // Tuesday, Dec 1 2026, EST: 22:03 UTC is only 5:03pm.
    expect(dueTomorrowRun(at("2026-12-01T22:03:00Z"))).toBeNull();
    expect(dueTomorrowRun(at("2026-12-01T22:59:00Z"))).toBeNull();
    expect(dueTomorrowRun(at("2026-12-01T23:03:00Z"))).toEqual({
      today: "2026-12-01",
      tomorrow: "2026-12-02",
    });
  });

  it("reads the clock on the days daylight time starts and ends", () => {
    // Sunday, Mar 8 2026: daylight time since 2am, so 6pm is 22:00 UTC.
    expect(dueTomorrowRun(at("2026-03-08T21:59:00Z"))).toBeNull();
    expect(dueTomorrowRun(at("2026-03-08T22:03:00Z"))).toEqual({
      today: "2026-03-08",
      tomorrow: "2026-03-09",
    });
    // Sunday, Nov 1 2026: standard time since 2am, so 6pm is 23:00 UTC.
    expect(dueTomorrowRun(at("2026-11-01T22:03:00Z"))).toBeNull();
    expect(dueTomorrowRun(at("2026-11-01T23:03:00Z"))).toEqual({
      today: "2026-11-01",
      tomorrow: "2026-11-02",
    });
  });

  it("keeps New York's date after 8pm, when UTC is already on the next day", () => {
    // 11:43pm EDT on Sep 28 is 03:43 UTC on Sep 29: still Sep 28's reminder.
    expect(dueTomorrowRun(at("2026-09-29T03:43:00Z"))).toEqual({
      today: "2026-09-28",
      tomorrow: "2026-09-29",
    });
    // Just after midnight in New York: before 6pm again.
    expect(dueTomorrowRun(at("2026-09-29T04:03:00Z"))).toBeNull();
  });

  it("keys the day in New York", () => {
    expect(dueTomorrowKey("tstudent", "2026-09-28")).toBe(
      "todo-due:tstudent:2026-09-28",
    );
  });
});

describe("dueTomorrowPush", () => {
  const project = aTodoItem({
    uid: "a",
    title: "Project 2",
    courseCode: "CMSC216",
    dueAt: "2026-09-30T03:59:00.000Z",
    dueDate: "2026-09-29",
  });
  const webassign = aTodoItem({
    uid: "b",
    title: "WebAssign 5",
    courseCode: "MATH240",
    dueAt: "2026-09-30T03:59:00.000Z",
    dueDate: "2026-09-29",
  });
  const reading = aTodoItem({
    uid: "c",
    title: "Reading response",
    courseCode: null,
    dueAt: null,
    dueDate: "2026-09-29",
  });

  it("names one item, its course and time", () => {
    expect(dueTomorrowPush([project], "2026-09-29")).toEqual({
      title: "Project 2 is due tomorrow",
      body: "CMSC216 · 11:59pm",
      url: "/todo?day=2026-09-29",
      tag: "todo-due:2026-09-29",
    });
    expect(dueTomorrowPush([reading], "2026-09-29").body).toBe("Due tomorrow");
  });

  it("counts several, naming the first two by due time", () => {
    expect(
      dueTomorrowPush([webassign, reading, project], "2026-09-29"),
    ).toEqual({
      title: "3 things due tomorrow",
      // An all-day item sorts first; it has no time to show.
      body: "Reading response, Project 2 (CMSC216) 11:59pm and 1 more",
      url: "/todo?day=2026-09-29",
      tag: "todo-due:2026-09-29",
    });
    expect(dueTomorrowPush([webassign, project], "2026-09-29").body).toBe(
      "Project 2 (CMSC216) 11:59pm and WebAssign 5 (MATH240) 11:59pm",
    );
  });

  it("cuts long titles to 60 characters", () => {
    const long = aTodoItem({ title: `${"Very long title ".repeat(8)}end` });
    const { title } = dueTomorrowPush([long], "2026-09-29");
    expect(title.endsWith("… is due tomorrow")).toBe(true);
    expect(title.length).toBe(60 + " is due tomorrow".length);
  });
});
