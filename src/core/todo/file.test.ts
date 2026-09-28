import { describe, expect, it } from "vitest";
import { TODO_MAX_FILE_ITEMS, TodoFileItemSchema } from "../schema";
import { FEEDS } from "./__fixtures__/feeds";
import { readTodoFile, TODO_FILE_MAX_BYTES } from "./file";

const saved = (name: string) => {
  const feed = FEEDS[name];
  if (!feed) throw new Error(`no feed ${name}`);
  return feed.text;
};

const calendar = (events: number) =>
  [
    "BEGIN:VCALENDAR",
    ...Array.from({ length: events }, (_, i) => [
      "BEGIN:VEVENT",
      `UID:file-${i}`,
      "DTSTART;VALUE=DATE:20261001",
      `SUMMARY:Homework ${i} [MATH240-0201: Linear Algebra]`,
      "END:VEVENT",
    ]).flat(),
    "END:VCALENDAR",
  ].join("\r\n");

describe("readTodoFile", () => {
  it("keeps only the structured fields import-file takes", () => {
    const text = saved("synthetic-file-2026-09");
    const read = readTodoFile(text, text.length);
    if (read.status !== "ok") throw new Error(read.status);
    expect(read.items.length).toBeGreaterThan(0);
    for (const item of read.items) TodoFileItemSchema.parse(item);
    // No description, file text or anything else rides along.
    expect(Object.keys(read.items[0] ?? {}).sort()).toEqual([
      "courseLabel",
      "dueAt",
      "dueDate",
      "kind",
      "link",
      "title",
      "uid",
    ]);
  });

  it("refuses files that are too big before reading them", () => {
    expect(readTodoFile("", TODO_FILE_MAX_BYTES + 1)).toEqual({
      status: "too-large",
    });
  });

  it("says when it isn't a calendar, or has nothing dated", () => {
    expect(readTodoFile("<html></html>", 13)).toEqual({
      status: "not-a-calendar",
    });
    const empty = "BEGIN:VCALENDAR\r\nEND:VCALENDAR";
    expect(readTodoFile(empty, empty.length)).toEqual({ status: "empty" });
  });

  it("refuses more items than import-file takes", () => {
    const text = calendar(TODO_MAX_FILE_ITEMS + 1);
    expect(readTodoFile(text, 1)).toEqual({ status: "too-many" });
    expect(readTodoFile(calendar(3), 1)).toMatchObject({
      status: "ok",
      skipped: 0,
    });
  });

  it("refuses items whose request would be over import-file's size", () => {
    const long = "x".repeat(290);
    const text = [
      "BEGIN:VCALENDAR",
      ...Array.from({ length: TODO_MAX_FILE_ITEMS }, (_, i) => [
        "BEGIN:VEVENT",
        `UID:file-${i}-${"u".repeat(150)}`,
        "DTSTART;VALUE=DATE:20261001",
        `SUMMARY:${long} [${long}]`,
        `URL:https://elms.umd.edu/courses/1/assignments/${i}?${"q".repeat(200)}`,
        "END:VEVENT",
      ]).flat(),
      "END:VCALENDAR",
    ].join("\r\n");
    expect(readTodoFile(text, 1)).toEqual({ status: "too-many" });
  });
});
