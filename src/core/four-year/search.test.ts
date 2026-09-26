import { describe, expect, it } from "vitest";
import type { CourseSearchRow } from "~/core/schema";
import { aCourseSearchFile } from "~/fixtures";
import { searchFourYearCourses, searchRowCredits } from "./search";

const ROWS: CourseSearchRow[] = [
  ["CMSC131", "Object-Oriented Programming I", 4, 4, []],
  ["CMSC351", "Algorithms", 3, 3, []],
  ["CMSC420", "Advanced Data Structures", 3, 3, []],
  ["CMSC498A", "Special Topics in Computer Science", 1, 3, []],
  ["HIST200", "Interpreting American History", 3, 3, ["DSHS", "DSHU"]],
  ["MATH140", "Calculus I", 4, 4, ["FSMA", "FSAR"]],
  ["MATH240", "Introduction to Linear Algebra", 4, 4, ["FSAR"]],
  ["STAT400", "Applied Probability and Statistics I", 3, 3, ["FSAR"]],
];

const codes = (query: string, filter = {}) =>
  searchFourYearCourses(ROWS, query, filter).rows.map((r) => r[0]);

describe("searchFourYearCourses", () => {
  it("finds codes by prefix, however they're typed", () => {
    expect(codes("cmsc 35")).toEqual(["CMSC351"]);
    expect(codes("CMSC4")).toEqual(["CMSC420", "CMSC498A"]);
    expect(codes("cmsc-131")).toEqual(["CMSC131"]);
  });

  it("puts a department's codes before titles with the same word", () => {
    expect(codes("math")).toEqual(["MATH140", "MATH240"]);
    expect(codes("stat")).toEqual(["STAT400"]);
  });

  it("matches the start of every word in the title, leading matches first", () => {
    expect(codes("linear alg")).toEqual(["MATH240"]);
    expect(codes("data struct")).toEqual(["CMSC420"]);
    expect(codes("calc")).toEqual(["MATH140"]);
    expect(codes("algorithms")).toEqual(["CMSC351"]);
    expect(codes("introduction")).toEqual(["MATH240"]);
    expect(codes("zzz")).toEqual([]);
  });

  it("lists what counts for a GenEd code", () => {
    expect(codes("fsar")).toEqual(["MATH140", "MATH240", "STAT400"]);
    expect(codes("DSHU")).toEqual(["HIST200"]);
  });

  it("lists everything a filter allows when nothing's typed", () => {
    expect(codes("")).toEqual([]);
    expect(codes("", { genEd: "FSAR" })).toEqual([
      "MATH140",
      "MATH240",
      "STAT400",
    ]);
    expect(
      codes("", { wildcard: { kind: "pattern", pattern: "CMSC4XX" } }),
    ).toEqual(["CMSC420", "CMSC498A"]);
    expect(
      codes("adv", { wildcard: { kind: "pattern", pattern: "CMSC4XX" } }),
    ).toEqual(["CMSC420"]);
    expect(codes("calc", { genEd: "DSHS" })).toEqual([]);
  });

  it("stops at the limit and counts the rest", () => {
    const result = searchFourYearCourses(ROWS, "", { genEd: "FSAR" }, 2);
    expect(result.rows).toHaveLength(2);
    expect(result.total).toBe(3);
  });

  it("reads the fixture index", () => {
    const file = aCourseSearchFile();
    expect(
      searchFourYearCourses(file.courses, file.courses[0]?.[0] ?? "").total,
    ).toBeGreaterThan(0);
  });
});

describe("searchRowCredits", () => {
  it("says a range for variable credit", () => {
    expect(searchRowCredits(["CMSC351", "Algorithms", 3, 3, []])).toBe("3 cr");
    expect(searchRowCredits(["CMSC498A", "Topics", 1, 3, []])).toBe("1–3 cr");
  });
});
