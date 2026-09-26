import { describe, expect, it } from "vitest";
import { TodoItemSchema } from "../schema";
import { FEEDS } from "./__fixtures__/feeds";
import { parseIcs } from "./ics";
import { fromFileItem, keepInWindow, todoWindow, toTodoItem } from "./items";

const feed = (name: string) => {
  const saved = FEEDS[name];
  if (!saved) throw new Error(`no feed ${name}`);
  return parseIcs(saved.text, saved.source);
};

describe("todoWindow and keepInWindow", () => {
  it("keeps 30 days back through a year ahead", () => {
    expect(todoWindow("2026-09-26")).toEqual({
      from: "2026-08-27",
      to: "2027-09-26",
    });
    const items = ["2026-08-26", "2026-08-27", "2027-09-26", "2027-09-27"].map(
      (dueDate) => ({ dueDate }),
    );
    expect(keepInWindow(items, "2026-09-26", 10)).toEqual({
      kept: [{ dueDate: "2026-08-27" }, { dueDate: "2027-09-26" }],
      skipped: 2,
    });
  });

  it("keeps the soonest when there are more than the cap", () => {
    const items = ["2026-10-03", "2026-10-01", "2026-10-02"].map((dueDate) => ({
      dueDate,
    }));
    expect(keepInWindow(items, "2026-09-26", 2)).toEqual({
      kept: [{ dueDate: "2026-10-01" }, { dueDate: "2026-10-02" }],
      skipped: 1,
    });
  });

  it("drops the synthetic feed's items outside the window", () => {
    const { items } = feed("synthetic-elms-2026-09");
    // "Syllabus quiz" is due 2026-08-31: kept on 2026-09-26, gone by October's end.
    expect(keepInWindow(items, "2026-09-26", 1_500).skipped).toBe(0);
    expect(
      keepInWindow(items, "2026-10-01", 1_500).kept.map((i) => i.title),
    ).not.toContain("Syllabus quiz");
  });
});

describe("toTodoItem", () => {
  it("keeps the first course code, the exam guess and the Gradescope flag", () => {
    const items = feed("synthetic-elms-2026-09").items.map(toTodoItem);
    for (const item of items) TodoItemSchema.parse(item);
    const byTitle = new Map(items.map((i) => [i.title, i]));
    expect(byTitle.get("Problem Set 3")).toMatchObject({
      courseCode: "CMSC216",
      courseLabel: "CMSC216/ENEE222-0101: Introduction to Computer Systems",
    });
    expect(byTitle.get("Midterm 1")).toMatchObject({
      exam: true,
      kind: "event",
    });
    expect(byTitle.get("Homework 4")).toMatchObject({ gradescope: true });
    expect(byTitle.get("Advising appointment")).toMatchObject({
      courseCode: null,
      courseLabel: "Sam Testudo",
    });
  });
});

describe("fromFileItem", () => {
  it("reads codes and the exam guess from the words, not the browser", () => {
    const item = fromFileItem({
      uid: "gs-1",
      title: "Midterm 2",
      courseLabel: "MATH240-0201: Introduction to Linear Algebra",
      kind: "event",
      gradescope: true,
      dueAt: "2026-10-20T16:00:00.000Z",
      dueDate: "2026-10-20",
      link: "https://www.gradescope.com/courses/1/assignments/2",
    });
    expect(item).toMatchObject({
      source: "file",
      courseCodes: ["MATH240"],
      sectionCode: "0201",
      looksLikeExam: true,
      gradescope: true,
      // Only ELMS links are kept.
      link: null,
    });
  });

  it("keeps an ELMS link", () => {
    const link = "https://elms.umd.edu/courses/1/assignments/2";
    expect(
      fromFileItem({
        uid: "x",
        title: "Homework 1",
        courseLabel: null,
        kind: "assignment",
        gradescope: false,
        dueAt: null,
        dueDate: "2026-10-01",
        link,
      }).link,
    ).toBe(link);
  });
});
