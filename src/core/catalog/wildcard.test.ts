import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { aCourse, aSection, mockCourses } from "~/fixtures";
import {
  CourseCodeSchema,
  type Wildcard,
  WildcardIdSchema,
  WildcardSchema,
} from "../schema";
import {
  countsForGenEd,
  matchesPattern,
  matchesWildcard,
  noMatchesMessage,
  padPattern,
  parseWildcard,
  wildcardCourses,
  wildcardDept,
  wildcardDetail,
  wildcardFromId,
  wildcardId,
  wildcardLabel,
  wildcardNoun,
} from "./wildcard";

const pattern = (p: string): Wildcard => ({ kind: "pattern", pattern: p });
const genEd = (code: string): Wildcard => ({ kind: "gen-ed", code });

const GEOL100 = aCourse({
  code: "GEOL100",
  // Testudo: "DSNL (if taken with GEOL110) or DSNS"
  genEds: [
    [{ code: "DSNL", condition: "if taken with GEOL110" }, { code: "DSNS" }],
  ],
});
const PSYC100 = aCourse({
  code: "PSYC100",
  // "DSHS or DSNS"
  genEds: [[{ code: "DSHS" }, { code: "DSNS" }]],
});

describe("parseWildcard", () => {
  it("reads patterns whatever the case and spacing", () => {
    for (const text of ["CMSC4XX", "cmsc4xx", "cmsc 4xx", " CMSC-4XX "])
      expect(parseWildcard(text)).toEqual({
        kind: "wildcard",
        wildcard: pattern("CMSC4XX"),
      });
    expect(parseWildcard("ARTTXXX")).toEqual({
      kind: "wildcard",
      wildcard: pattern("ARTTXXX"),
    });
    expect(parseWildcard("cmsc42x")).toEqual({
      kind: "wildcard",
      wildcard: pattern("CMSC42X"),
    });
  });

  it("needs all three places, and X only at the end", () => {
    expect(parseWildcard("CMSC4X")).toEqual({
      kind: "invalid",
      message: "Use three places for the number, as in CMSC4XX.",
    });
    expect(parseWildcard("CMSC4XXX")).toMatchObject({ kind: "invalid" });
    expect(parseWildcard("CMSCX")).toEqual({
      kind: "invalid",
      message: "Use three places for the number, as in CMSCXXX.",
    });
    expect(parseWildcard("CMSC4X1")).toEqual({
      kind: "invalid",
      message: "Put X only at the end, as in CMSC4XX.",
    });
    expect(parseWildcard("CMSCX51")).toMatchObject({ kind: "invalid" });
  });

  it("leaves course codes, departments and words alone", () => {
    // X as a real suffix letter: BUSI758X is a course.
    for (const text of ["CMSC351", "BUSI758X", "CMSC", "CMSC4", "algorithms"])
      expect(parseWildcard(text)).toEqual({ kind: "none" });
  });

  it("reads known gen-ed codes, and others it's told about", () => {
    expect(parseWildcard("dshs")).toEqual({
      kind: "wildcard",
      wildcard: genEd("DSHS"),
    });
    expect(parseWildcard("ABCD")).toEqual({ kind: "none" });
    expect(parseWildcard("ABCD", ["ABCD"])).toEqual({
      kind: "wildcard",
      wildcard: genEd("ABCD"),
    });
  });

  it("gives schema-valid wildcards, and never a course code", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 10 }), (text) => {
        const parsed = parseWildcard(text);
        if (parsed.kind !== "wildcard") return;
        expect(WildcardSchema.safeParse(parsed.wildcard).success).toBe(true);
        const id = wildcardId(parsed.wildcard);
        expect(WildcardIdSchema.safeParse(id).success).toBe(true);
        expect(CourseCodeSchema.safeParse(id).success).toBe(false);
      }),
    );
  });

  it("parses every valid pattern back to itself", () => {
    const valid = fc
      .tuple(
        fc.stringMatching(/^[A-Z]{4}$/),
        fc.stringMatching(/^(\d\dX|\dXX|XXX)$/),
      )
      .map(([d, n]) => d + n);
    fc.assert(
      fc.property(valid, (p) => {
        expect(parseWildcard(p.toLowerCase())).toEqual({
          kind: "wildcard",
          wildcard: pattern(p),
        });
      }),
    );
  });
});

describe("ids and words", () => {
  it("round-trips ids", () => {
    for (const w of [pattern("CMSC4XX"), pattern("ARTTXXX"), genEd("DSHS")])
      expect(wildcardFromId(wildcardId(w))).toEqual(w);
    expect(wildcardId(genEd("DSHS"))).toBe("gen-ed:DSHS");
    expect(wildcardFromId("CMSC351")).toBeNull();
    expect(wildcardFromId("gen-ed:dshs")).toBeNull();
  });

  it("labels each kind in plain words", () => {
    expect(wildcardLabel(pattern("CMSC4XX"))).toBe("Any CMSC 400-level");
    expect(wildcardLabel(pattern("CMSC42X"))).toBe("Any CMSC 420–429");
    expect(wildcardLabel(pattern("ARTTXXX"))).toBe("Any ARTT course");
    expect(wildcardLabel(genEd("DSHS"))).toBe("Any DSHS course");
    expect(wildcardNoun(pattern("CMSC4XX"))).toBe("CMSC 400-level courses");
    expect(wildcardNoun(pattern("CMSC42X"))).toBe(
      "CMSC courses numbered 420–429",
    );
    expect(wildcardNoun(pattern("ARTTXXX"))).toBe("ARTT courses");
    expect(wildcardNoun(pattern("CMSC4XX"), 1)).toBe("CMSC 400-level course");
    expect(wildcardNoun(pattern("CMSC42X"), 1)).toBe(
      "CMSC course numbered 420–429",
    );
    expect(wildcardNoun(genEd("DSHS"), 1)).toBe("DSHS course");
    expect(wildcardDetail(genEd("DSHS"))).toBe("History and Social Sciences");
    expect(wildcardDetail(genEd("ABCD"))).toBeNull();
    expect(wildcardDetail(pattern("CMSC4XX"))).toBeNull();
    expect(noMatchesMessage(pattern("ARTTXXX"), "Spring 2027")).toBe(
      "Spring 2027 has no ARTT courses.",
    );
    expect(noMatchesMessage(genEd("DSHS"), "this term")).toBe(
      "This term has no DSHS courses.",
    );
  });

  it("pads a department and digits into a pattern", () => {
    expect(padPattern("CMSC", "")).toBe("CMSCXXX");
    expect(padPattern("CMSC", "4")).toBe("CMSC4XX");
    expect(padPattern("CMSC", "42")).toBe("CMSC42X");
    expect(padPattern("CMSC", "421")).toBe("CMSC42X");
  });

  it("names a pattern's department", () => {
    expect(wildcardDept(pattern("CMSC4XX"))).toBe("CMSC");
    expect(wildcardDept(genEd("DSHS"))).toBeNull();
  });
});

describe("matching", () => {
  it("matches a pattern's level, suffix letters included", () => {
    expect(matchesPattern("CMSC4XX", "CMSC412")).toBe(true);
    expect(matchesPattern("CMSC4XX", "CMSC498A")).toBe(true);
    expect(matchesPattern("CMSC4XX", "CMSC351")).toBe(false);
    expect(matchesPattern("CMSC4XX", "MATH401")).toBe(false);
    expect(matchesPattern("CMSC42X", "CMSC421")).toBe(true);
    expect(matchesPattern("CMSC42X", "CMSC430")).toBe(false);
    expect(matchesPattern("ARTTXXX", "ARTT100")).toBe(true);
    // A department ending in X keeps its X.
    expect(matchesPattern("ABCXXXX", "ABCX100")).toBe(true);
    expect(matchesPattern("ABCXXXX", "ABCD100")).toBe(false);
  });

  it("agrees with a digit-by-digit reading", () => {
    const code = fc
      .tuple(
        fc.constantFrom("CMSC", "MATH"),
        fc.stringMatching(/^\d{3}[A-Z]?$/),
      )
      .map(([d, n]) => d + n);
    const pat = fc
      .tuple(
        fc.constantFrom("CMSC", "MATH"),
        fc.stringMatching(/^(\d\dX|\dXX|XXX)$/),
      )
      .map(([d, n]) => d + n);
    fc.assert(
      fc.property(pat, code, (p, c) => {
        const byDigit = [...p].every((ch, i) => ch === "X" || ch === c[i]);
        expect(matchesPattern(p, c)).toBe(byDigit);
      }),
    );
  });

  it("counts a gen-ed choice for each of its codes", () => {
    expect(countsForGenEd(PSYC100, "DSHS")).toBe(true);
    expect(countsForGenEd(PSYC100, "DSNS")).toBe(true);
    expect(countsForGenEd(PSYC100, "DSHU")).toBe(false);
  });

  it("skips conditional gen-eds unless asked", () => {
    expect(countsForGenEd(GEOL100, "DSNS")).toBe(true);
    expect(countsForGenEd(GEOL100, "DSNL")).toBe(false);
    expect(countsForGenEd(GEOL100, "DSNL", { conditional: true })).toBe(true);
    expect(matchesWildcard(genEd("DSNL"), GEOL100)).toBe(false);
    expect(matchesWildcard(genEd("DSNL"), GEOL100, { conditional: true })).toBe(
      true,
    );
  });
});

describe("wildcardCourses", () => {
  it("filters a term's catalog to courses with sections", () => {
    const codes = wildcardCourses(mockCourses(), pattern("CMSC4XX")).map(
      (c) => c.code,
    );
    expect(codes).toContain("CMSC412");
    expect(codes).toContain("CMSC498E");
    // Independent study, no sections this term.
    expect(codes).not.toContain("CMSC499A");
    expect(codes.every((c) => /^CMSC4\d\d[A-Z]?$/.test(c))).toBe(true);
  });

  it("finds gen-ed courses across departments", () => {
    const codes = wildcardCourses(mockCourses(), genEd("DSHS")).map(
      (c) => c.code,
    );
    expect(new Set(codes.map((c) => c.slice(0, 4))).size).toBeGreaterThan(1);
    expect(
      wildcardCourses(mockCourses(), genEd("DSNL")).map((c) => c.code),
    ).not.toContain("GEOL100");
  });

  it("leaves out courses listed on their own", () => {
    const courses = [
      aCourse({ code: "CMSC412" }),
      aCourse({ code: "CMSC420" }),
      aCourse({ code: "CMSC430", sections: [] }),
      aCourse({ code: "CMSC330", sections: [aSection()] }),
    ];
    expect(
      wildcardCourses(courses, pattern("CMSC4XX"), {
        exclude: new Set(["CMSC412"]),
      }).map((c) => c.code),
    ).toEqual(["CMSC420"]);
  });
});
