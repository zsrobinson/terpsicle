import { describe, expect, it } from "vitest";
import { aCourse, mockCourses } from "~/fixtures";
import { suggestWildcards, wildcardSearchInfo } from "./wildcards";

const info = wildcardSearchInfo(mockCourses());

describe("suggestWildcards", () => {
  it("suggests a typed pattern or gen-ed code first", () => {
    expect(suggestWildcards("cmsc4xx", info)).toEqual({
      exact: { kind: "pattern", pattern: "CMSC4XX" },
      related: null,
      hint: null,
    });
    expect(suggestWildcards("DSHS", info).exact).toEqual({
      kind: "gen-ed",
      code: "DSHS",
    });
    // A department the term doesn't have is still a pattern; the count says so.
    expect(suggestWildcards("ARTTXXX", info).exact).toEqual({
      kind: "pattern",
      pattern: "ARTTXXX",
    });
  });

  it("offers a department's pattern when a department is typed", () => {
    expect(suggestWildcards("CMSC", info).related).toEqual({
      kind: "pattern",
      pattern: "CMSCXXX",
    });
    expect(suggestWildcards("cmsc 4", info).related).toEqual({
      kind: "pattern",
      pattern: "CMSC4XX",
    });
    // Further in, it's a course being typed.
    expect(suggestWildcards("CMSC41", info).related).toBeNull();
    expect(suggestWildcards("ARTT", info).related).toBeNull();
    expect(suggestWildcards("algorithms", info)).toEqual({
      exact: null,
      related: null,
      hint: null,
    });
  });

  it("hints at a near miss", () => {
    expect(suggestWildcards("CMSC4X", info).hint).toBe(
      "Use three places for the number, as in CMSC4XX.",
    );
  });

  it("knows gen-ed codes the catalog uses beyond UMD's list", () => {
    const withNew = wildcardSearchInfo([
      aCourse({ code: "NEWS100", genEds: [[{ code: "DSXX" }]] }),
    ]);
    expect(suggestWildcards("dsxx", withNew).exact).toEqual({
      kind: "gen-ed",
      code: "DSXX",
    });
    expect(withNew.depts).toEqual(new Set(["NEWS"]));
  });
});
