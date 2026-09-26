import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parsePrerequisite } from "./prereqs";

// Every saved prerequisite sentence is snapshotted by the golden test in
// src/ingest/prereqs.golden.test.ts; these pin the rules one at a time.

describe("parsePrerequisite", () => {
  it("reads no sentence as no prerequisites", () => {
    expect(parsePrerequisite(null)).toEqual({ groups: [], complete: true });
    expect(parsePrerequisite("  ")).toEqual({ groups: [], complete: true });
  });

  it("reads a plain course, and joins a code written with a space", () => {
    expect(parsePrerequisite("CMSC330.")).toEqual({
      groups: [["CMSC330"]],
      complete: true,
    });
    expect(parsePrerequisite("Minimum grade of C- in CMSC 131.")).toEqual({
      groups: [["CMSC131"]],
      complete: true,
    });
  });

  it("splits clauses on ; and `and` into groups that all apply, with `or` inside one", () => {
    expect(
      parsePrerequisite(
        "Minimum grade of C- in CMSC132; and minimum grade of C- in MATH141.",
      ),
    ).toEqual({ groups: [["CMSC132"], ["MATH141"]], complete: true });
    expect(
      parsePrerequisite("MATH115 or MATH140; and (GEOL100 or GEOL120)."),
    ).toEqual({
      groups: [
        ["MATH115", "MATH140"],
        ["GEOL100", "GEOL120"],
      ],
      complete: true,
    });
  });

  it("gives commas the list's own conjunction", () => {
    expect(
      parsePrerequisite(
        "Minimum grade of C- in CMSC320, CMSC330, and CMSC351.",
      ),
    ).toEqual({
      groups: [["CMSC320"], ["CMSC330"], ["CMSC351"]],
      complete: true,
    });
    expect(parsePrerequisite("AMST655, ANTH655, or HIST610.")).toEqual({
      groups: [["AMST655", "ANTH655", "HIST610"]],
      complete: true,
    });
  });

  it("reads `1 course from (…)` as a choice", () => {
    expect(
      parsePrerequisite(
        "1 course with a minimum grade of C- from (MATH240, MATH341); and 1 course from (CMSC106, CMSC131).",
      ),
    ).toEqual({
      groups: [
        ["MATH240", "MATH341"],
        ["CMSC106", "CMSC131"],
      ],
      complete: true,
    });
  });

  it("turns `; or` alternatives into groups that all apply", () => {
    // GEOG276, or both CMSC330 and CMSC351.
    expect(
      parsePrerequisite(
        "GEOG276; or a minimum grade of C- in CMSC330 and CMSC351.",
      ),
    ).toEqual({
      groups: [
        ["GEOG276", "CMSC330"],
        ["GEOG276", "CMSC351"],
      ],
      complete: true,
    });
    // A sentence starting with "Or" joins the same way.
    expect(
      parsePrerequisite("GEOL120 or GEOL100; and GEOL110. Or GEOL200."),
    ).toEqual({
      groups: [
        ["GEOL120", "GEOL100", "GEOL200"],
        ["GEOL110", "GEOL200"],
      ],
      complete: true,
    });
  });

  it("never lets what it can't read add a requirement or meet one", () => {
    expect(
      parsePrerequisite(
        "Minimum grade of C- in CMSC131 or permission of instructor; and permission of CMNS-Computer Science department.",
      ),
    ).toEqual({ groups: [["CMSC131"]], complete: false });
    expect(
      parsePrerequisite(
        "Minimum grade of C- in CMSC351 and minimum grade of C- in any STAT400-level course; or DATA400; or ENEE324.",
      ),
    ).toEqual({
      groups: [["CMSC351", "DATA400", "ENEE324"]],
      complete: false,
    });
    expect(parsePrerequisite("Permission of instructor.")).toEqual({
      groups: [],
      complete: false,
    });
  });

  it("is incomplete for `or equivalent`, `must have completed` and programs", () => {
    for (const text of [
      "MATH410 or equivalent; or permission of instructor.",
      "Must have completed or be concurrently enrolled in GEOL423.",
      "Minimum grade of C- in CMSC330; or must be in the (Computer Science (Doctoral), Computer Science (Master's)) program.",
      "Must have earned a score of 5 on the AP exam.",
    ])
      expect(parsePrerequisite(text).complete).toBe(false);
    expect(
      parsePrerequisite(
        "Minimum grade of C- in CMSC330; or must be in the (Computer Science (Doctoral), Computer Science (Master's)) program.",
      ).groups,
    ).toEqual([["CMSC330"]]);
  });

  it("skips sentences that aren't requirements, and says so", () => {
    expect(
      parsePrerequisite(
        "ENEE620. Cross-listed with ENEE633. Credit will be only granted for CMSC828C or ENEE633.",
      ),
    ).toEqual({ groups: [["ENEE620"]], complete: false });
    expect(parsePrerequisite("Repeatable to 6 credits.")).toEqual({
      groups: [],
      complete: false,
    });
  });

  it("drops groups another group already implies, and repeats", () => {
    expect(parsePrerequisite("CMSC131; and CMSC131 or CMSC133.")).toEqual({
      groups: [["CMSC131"]],
      complete: true,
    });
    expect(parsePrerequisite("CMSC131 or CMSC131.")).toEqual({
      groups: [["CMSC131"]],
      complete: true,
    });
  });

  it("marks two codes side by side, and stray parentheses, as a partial reading", () => {
    expect(parsePrerequisite("CMSC131 CMSC132.")).toEqual({
      groups: [["CMSC131"], ["CMSC132"]],
      complete: false,
    });
    expect(parsePrerequisite("CMSC131) and (MATH140")).toEqual({
      groups: [["CMSC131"], ["MATH140"]],
      complete: true,
    });
  });

  it("gives up on a sentence whose alternatives multiply past the limit", () => {
    const all = (prefix: string, n: number) =>
      Array.from({ length: n }, (_, i) => `${prefix}${100 + i}`).join(" and ");
    expect(
      parsePrerequisite(`${all("CMSC", 8)}; or ${all("MATH", 9)}.`),
    ).toEqual({ groups: [], complete: false });
  });

  it("only ever returns codes the sentence names", () => {
    const code = fc
      .tuple(
        fc.constantFrom("CMSC", "MATH", "GEOL"),
        fc.integer({ min: 100, max: 499 }),
      )
      .map(([dept, n]) => `${dept}${n}`);
    const word = fc.constantFrom(
      "and",
      "or",
      ",",
      ";",
      "(",
      ")",
      ".",
      "permission of instructor",
      "or equivalent",
      "Minimum grade of C- in",
      "1 course from",
    );
    fc.assert(
      fc.property(
        fc.array(fc.oneof(code, word), { maxLength: 16 }),
        (parts) => {
          const text = parts.join(" ");
          const { groups } = parsePrerequisite(text);
          for (const group of groups) {
            expect(group.length).toBeGreaterThan(0);
            for (const c of group) expect(text).toContain(c);
          }
        },
      ),
    );
  });
});
