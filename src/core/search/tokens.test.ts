import { describe, expect, it } from "vitest";
import { aCourse } from "~/fixtures";
import { NO_FILTERS, type SearchFilters } from "./filters";
import {
  filterTokenName,
  hasFilterToken,
  parseCourseQuery,
  queryFilters,
  readFilterToken,
  takeFilterToken,
  withFilterToken,
  withoutFilterToken,
  withoutLastChip,
} from "./tokens";
import { wildcardSearchInfo } from "./wildcards";

const info = wildcardSearchInfo([
  aCourse({ code: "CMSC351" }),
  aCourse({ code: "MATH140" }),
  // A department whose code is also a GenEd's: it stays a department.
  aCourse({ code: "DSSP100" }),
]);

describe("readFilterToken", () => {
  it("reads GenEd codes, whatever the case", () => {
    expect(readFilterToken("DSNS", info)).toEqual({
      kind: "gen-ed",
      code: "DSNS",
    });
    expect(readFilterToken("dshu", info)).toEqual({
      kind: "gen-ed",
      code: "DSHU",
    });
  });

  it("leaves departments, course codes and words alone", () => {
    expect(readFilterToken("DSSP", info)).toBeNull();
    for (const word of ["CMSC", "cmsc351", "math", "open", "online", "dsn"])
      expect(readFilterToken(word, info)).toBeNull();
  });

  it("reads levels and credits", () => {
    for (const word of ["400s", "400-level", "400level", "400S"])
      expect(readFilterToken(word, info)).toEqual({
        kind: "level",
        level: 400,
      });
    expect(readFilterToken("900s", info)).toBeNull();
    expect(readFilterToken("450s", info)).toBeNull();
    expect(readFilterToken("3cr", info)).toEqual({
      kind: "credits",
      credits: 3,
    });
    expect(readFilterToken("1credit", info)).toEqual({
      kind: "credits",
      credits: 1,
    });
    // The top option means "or more".
    expect(readFilterToken("6cr", info)).toEqual({
      kind: "credits",
      credits: 5,
    });
    expect(readFilterToken("0cr", info)).toBeNull();
  });

  it("names each chip", () => {
    expect(filterTokenName({ kind: "gen-ed", code: "DSNS" })).toBe("DSNS");
    expect(filterTokenName({ kind: "level", level: 400 })).toBe("400-level");
    expect(filterTokenName({ kind: "credits", credits: 1 })).toBe("1 credit");
    expect(filterTokenName({ kind: "credits", credits: 5 })).toBe("5+ credits");
  });
});

describe("chips from tokens", () => {
  it("turns a chip on once, and off again", () => {
    const dsns = { kind: "gen-ed", code: "DSNS" } as const;
    const on = withFilterToken(withFilterToken(NO_FILTERS, dsns), dsns);
    expect(on.genEds).toEqual(["DSNS"]);
    expect(hasFilterToken(on, dsns)).toBe(true);
    expect(withoutFilterToken(on, dsns)).toEqual(NO_FILTERS);
  });

  it("drops the last chip on the line", () => {
    const all: SearchFilters = {
      genEds: ["DSNS", "DSHU"],
      credits: [3],
      levels: [400],
      openSeats: true,
      fitsMyPlan: true,
    };
    const steps = [all];
    for (let i = 0; i < 6; i++)
      steps.push(withoutLastChip(steps[steps.length - 1] ?? all));
    expect(steps.map((f) => f.levels.length)).toEqual([1, 0, 0, 0, 0, 0, 0]);
    expect(steps[2]?.openSeats).toBe(false);
    expect(steps[3]?.fitsMyPlan).toBe(false);
    expect(steps[4]?.credits).toEqual([]);
    expect(steps[5]?.genEds).toEqual(["DSNS"]);
    expect(steps[6]).toEqual(NO_FILTERS);
    expect(withoutLastChip(NO_FILTERS)).toBe(NO_FILTERS);
  });
});

describe("parseCourseQuery", () => {
  it("reads a pattern, however it's typed", () => {
    for (const q of ["cmsc4xx", "CMSC4XX", "cmsc 4xx", "cmsc4x"])
      expect(parseCourseQuery(q, info)).toEqual({
        text: "",
        patterns: ["CMSC4XX"],
        tokens: [],
      });
    expect(parseCourseQuery("cmsc42x", info).patterns).toEqual(["CMSC42X"]);
  });

  it("splits text, patterns and tokens", () => {
    expect(parseCourseQuery("algorithms cmsc4xx 3cr", info)).toEqual({
      text: "algorithms",
      patterns: ["CMSC4XX"],
      tokens: [{ kind: "credits", credits: 3 }],
    });
    expect(parseCourseQuery("cmsc 4xx 3cr", info)).toEqual({
      text: "",
      patterns: ["CMSC4XX"],
      tokens: [{ kind: "credits", credits: 3 }],
    });
    expect(parseCourseQuery("DSNS", info)).toEqual({
      text: "",
      patterns: [],
      tokens: [{ kind: "gen-ed", code: "DSNS" }],
    });
    expect(parseCourseQuery("cmsc 351", info)).toEqual({
      text: "cmsc 351",
      patterns: [],
      tokens: [],
    });
    // A suffix letter X is a course, not a pattern.
    expect(parseCourseQuery("busi758x", info).text).toBe("busi758x");
  });

  it("filters by the tokens still in the box", () => {
    const query = parseCourseQuery("DSNS 400s", info);
    expect(
      queryFilters({ ...NO_FILTERS, genEds: ["DSHU"] }, query),
    ).toMatchObject({ genEds: ["DSHU", "DSNS"], levels: [400] });
  });
});

describe("takeFilterToken", () => {
  it("takes a token off the end of the box", () => {
    expect(takeFilterToken("DSNS", info)).toEqual({
      text: "",
      token: { kind: "gen-ed", code: "DSNS" },
    });
    expect(takeFilterToken("ecology dsns ", info)).toEqual({
      text: "ecology ",
      token: { kind: "gen-ed", code: "DSNS" },
    });
  });

  it("leaves anything else", () => {
    for (const text of ["", " ", "CMSC", "cmsc4xx", "dsns ecology", "DSSP"])
      expect(takeFilterToken(text, info)).toBeNull();
  });
});
