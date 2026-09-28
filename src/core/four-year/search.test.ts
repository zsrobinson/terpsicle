import { describe, expect, it } from "vitest";
import type { CourseSearchRow } from "~/core/schema";
import { aCourseSearchFile } from "~/fixtures";
import { NO_FILTERS, type SearchFilters } from "../search/filters";
import * as engine from "../search/search";
import {
  type FourYearSearchFilter,
  searchFourYearCourses,
  searchRowCredits,
} from "./search";

const ROWS: CourseSearchRow[] = [
  ["CMSC131", "Object-Oriented Programming I", 4, 4, []],
  ["CMSC351", "Algorithms", 3, 3, []],
  ["CMSC420", "Advanced Data Structures", 3, 3, []],
  ["CMSC498A", "Special Topics in Computer Science", 1, 3, []],
  ["HIST200", "Interpreting American History", 3, 3, ["DSHS", "DSHU"]],
  ["MATH140", "Calculus I", 4, 4, ["FSMA", "FSAR"]],
  ["MATH240", "Introduction to Linear Algebra", 4, 4, ["FSAR"]],
  ["PSYC100", "Introduction to Psychology", 3, 3, ["DSHS", "DSNS"]],
  ["STAT400", "Applied Probability and Statistics I", 3, 3, ["FSAR"]],
];

const codes = (
  query: string,
  filter: FourYearSearchFilter = {},
  filters: SearchFilters = NO_FILTERS,
) =>
  searchFourYearCourses(engine, ROWS, query, filters, filter).rows.map(
    (r) => r[0],
  );

describe("searchFourYearCourses", () => {
  it("finds codes by prefix, however they're typed", () => {
    expect(codes("cmsc 35")).toEqual(["CMSC351"]);
    expect(codes("CMSC4")).toEqual(["CMSC420", "CMSC498A"]);
    expect(codes("cmsc-131")).toEqual(["CMSC131"]);
  });

  it("puts a department's codes before titles with the same word", () => {
    expect(codes("math").slice(0, 2)).toEqual(["MATH140", "MATH240"]);
    expect(codes("stat")[0]).toBe("STAT400");
  });

  it("matches the start of every word in the title", () => {
    expect(codes("linear alg")).toEqual(["MATH240"]);
    expect(codes("data struct")).toEqual(["CMSC420"]);
    expect(codes("calc")).toEqual(["MATH140"]);
    expect(codes("algorithms")).toEqual(["CMSC351"]);
    expect(codes("zzz")).toEqual([]);
  });

  it("finds titles the way Schedule's Search does (owner, 2026-09-28)", () => {
    // Five letters looked like a code before ("PSYCH", "INTRO"), so these
    // found nothing.
    for (const q of [
      "psych",
      "intro psych",
      "intro to psychology",
      "pyschology",
    ])
      expect(codes(q)).toContain("PSYC100");
    expect(codes("introduction").sort()).toEqual(["MATH240", "PSYC100"]);
  });

  it("reads patterns, cmsc4x included", () => {
    expect(codes("cmsc4xx")).toEqual(["CMSC420", "CMSC498A"]);
    expect(codes("cmsc4x")).toEqual(["CMSC420", "CMSC498A"]);
    expect(codes("cmsc49x")).toEqual(["CMSC498A"]);
  });

  it("lists what counts for a GenEd, typed or as a chip", () => {
    expect(codes("fsar")).toEqual(["MATH140", "MATH240", "STAT400"]);
    expect(codes("DSHU")).toEqual(["HIST200"]);
    expect(codes("", {}, { ...NO_FILTERS, genEds: ["FSAR"] })).toEqual([
      "MATH140",
      "MATH240",
      "STAT400",
    ]);
    expect(codes("intro", {}, { ...NO_FILTERS, genEds: ["DSHS"] })).toEqual([
      "PSYC100",
    ]);
  });

  it("filters by credits and level", () => {
    expect(codes("", {}, { ...NO_FILTERS, levels: [400] })).toEqual([
      "CMSC420",
      "CMSC498A",
      "STAT400",
    ]);
    expect(codes("cmsc 4xx 1cr")).toEqual(["CMSC498A"]);
    expect(codes("400s")).toEqual(["CMSC420", "CMSC498A", "STAT400"]);
  });

  it("lists everything a placeholder allows when nothing's typed", () => {
    expect(codes("")).toEqual([]);
    expect(
      codes("", { wildcard: { kind: "pattern", pattern: "CMSC4XX" } }),
    ).toEqual(["CMSC420", "CMSC498A"]);
    expect(
      codes("adv", { wildcard: { kind: "pattern", pattern: "CMSC4XX" } }),
    ).toEqual(["CMSC420"]);
    expect(codes("calc", {}, { ...NO_FILTERS, genEds: ["DSHS"] })).toEqual([]);
  });

  it("stops at the limit and counts the rest", () => {
    const result = searchFourYearCourses(
      engine,
      ROWS,
      "",
      { ...NO_FILTERS, genEds: ["FSAR"] },
      {},
      2,
    );
    expect(result.rows).toHaveLength(2);
    expect(result.total).toBe(3);
  });

  it("reads the fixture index", () => {
    const file = aCourseSearchFile();
    expect(
      searchFourYearCourses(
        engine,
        file.courses,
        file.courses[0]?.[0] ?? "",
        NO_FILTERS,
      ).total,
    ).toBeGreaterThan(0);
  });
});

describe("searchRowCredits", () => {
  it("says a range for variable credit", () => {
    expect(searchRowCredits(["CMSC351", "Algorithms", 3, 3, []])).toBe("3 cr");
    expect(searchRowCredits(["CMSC498A", "Topics", 1, 3, []])).toBe("1–3 cr");
  });
});
