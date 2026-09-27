import { describe, expect, it } from "vitest";
import { TodoSaveTaskInputSchema } from "~/core/schema";
import { anOwnTask } from "~/fixtures";
import {
  minutesFromTimeField,
  ownTaskDue,
  ownTaskItem,
  taskDateInWindow,
  taskFieldsOf,
  timeFieldFromMinutes,
} from "./tasks";

// Your own tasks (docs/V3.md §3.10). 2026-09-29 is a Tuesday in daylight
// time; 2026-12-01 is in standard time.

describe("ownTaskDue", () => {
  it("reads the date and time on New York's clock, in both seasons", () => {
    expect(ownTaskDue("2026-09-29", 23 * 60 + 59)).toEqual({
      dueAt: "2026-09-30T03:59:00.000Z",
      dueDate: "2026-09-29",
    });
    expect(ownTaskDue("2026-12-01", 9 * 60)).toEqual({
      dueAt: "2026-12-01T14:00:00.000Z",
      dueDate: "2026-12-01",
    });
  });

  it("is all day without a time, and nothing without a date", () => {
    expect(ownTaskDue("2026-09-29", null)).toEqual({
      dueAt: null,
      dueDate: "2026-09-29",
    });
    expect(ownTaskDue(null, 600)).toEqual({ dueAt: null, dueDate: null });
  });
});

describe("ownTaskItem and taskFieldsOf", () => {
  it("shows a task as an item that's yours, and reads its fields back", () => {
    const item = ownTaskItem({
      uid: "own-0000-aaaa",
      title: "Office hours",
      courseCode: "CMSC216",
      ...ownTaskDue("2026-09-29", 14 * 60 + 30),
    });
    expect(item).toEqual(
      anOwnTask({
        uid: "own-0000-aaaa",
        title: "Office hours",
        courseCode: "CMSC216",
        dueAt: "2026-09-29T18:30:00.000Z",
        dueDate: "2026-09-29",
      }),
    );
    expect(taskFieldsOf(item)).toEqual({
      title: "Office hours",
      courseCode: "CMSC216",
      dueDate: "2026-09-29",
      dueTime: 14 * 60 + 30,
    });
    expect(taskFieldsOf(anOwnTask())).toMatchObject({
      dueDate: null,
      dueTime: null,
    });
  });
});

describe("taskDateInWindow", () => {
  it("keeps 30 days back to a year ahead, and no date", () => {
    expect(taskDateInWindow("2026-08-30", "2026-09-29")).toBe(true);
    expect(taskDateInWindow("2026-08-29", "2026-09-29")).toBe(false);
    expect(taskDateInWindow("2027-09-29", "2026-09-29")).toBe(true);
    expect(taskDateInWindow("2027-09-30", "2026-09-29")).toBe(false);
    expect(taskDateInWindow(null, "2026-09-29")).toBe(true);
  });
});

describe("time fields", () => {
  it("reads a time field's value and writes one back", () => {
    expect(minutesFromTimeField("13:05")).toBe(785);
    expect(minutesFromTimeField("00:00")).toBe(0);
    expect(minutesFromTimeField("23:59:00")).toBe(1439);
    expect(minutesFromTimeField("")).toBeNull();
    expect(minutesFromTimeField("24:00")).toBeNull();
    expect(timeFieldFromMinutes(785)).toBe("13:05");
    expect(timeFieldFromMinutes(0)).toBe("00:00");
    expect(timeFieldFromMinutes(null)).toBe("");
  });
});

describe("todo/save-task's input", () => {
  const input = {
    uid: "own-5b0c2a4e-7d1f",
    title: "  Office hours ",
    courseCode: null,
    dueDate: "2026-09-29",
    dueTime: 600,
  };

  it("trims the title and takes a date with or without a time", () => {
    expect(TodoSaveTaskInputSchema.parse(input).title).toBe("Office hours");
    expect(
      TodoSaveTaskInputSchema.safeParse({ ...input, dueTime: null }).success,
    ).toBe(true);
    expect(
      TodoSaveTaskInputSchema.safeParse({
        ...input,
        dueDate: null,
        dueTime: null,
      }).success,
    ).toBe(true);
  });

  it("refuses a time with no date, an empty title and a uid that isn't a task's", () => {
    for (const bad of [
      { ...input, dueDate: null },
      { ...input, title: "   " },
      { ...input, title: "x".repeat(301) },
      { ...input, uid: "event-assignment-4410001" },
      { ...input, dueTime: 1440 },
    ])
      expect(TodoSaveTaskInputSchema.safeParse(bad).success, bad.uid).toBe(
        false,
      );
  });
});
