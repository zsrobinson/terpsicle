import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { CourseIndexEntry, GenEdGroup } from "~/core/schema";
import type { FourYearEntry } from "~/core/schema/four-year";
import {
  aCourseIndexEntry,
  aFourYear,
  aFourYearCreditEntry,
  aFourYearEntry,
  aFourYearWildcardEntry,
} from "~/fixtures";
import { fourYearCourses } from "./course-lookup";
import {
  allocateGenEds,
  conditionMet,
  GEN_ED_REQUIREMENTS,
  type GenEdProgress,
  genEdProgressLabel,
  genEdRequirementOf,
} from "./gen-ed";
import { statusAround } from "./test-helpers";

const withGenEds = (code: string, genEds: GenEdGroup[]): CourseIndexEntry =>
  aCourseIndexEntry({
    code,
    genEds,
    prerequisite: null,
    prereqs: { groups: [], complete: true },
  });

const lookup = fourYearCourses([
  withGenEds("ENGL101", [[{ code: "FSAW" }]]),
  withGenEds("GEOL100", [
    [{ code: "DSNL", condition: "if taken with GEOL110" }, { code: "DSNS" }],
  ]),
  withGenEds("GEOL110", [[{ code: "DSNL" }]]),
  withGenEds("HIST200", [[{ code: "DSHS" }, { code: "DSHU" }]]),
  withGenEds("HIST201", [[{ code: "DSHS" }, { code: "DSHU" }]]),
  withGenEds("HIST202", [[{ code: "DSHS" }, { code: "DSHU" }]]),
  withGenEds("ANTH260", [[{ code: "DSHS" }], [{ code: "DVUP" }]]),
  withGenEds("AAAS100", [[{ code: "DVUP" }], [{ code: "DVCC" }]]),
  withGenEds("CMSC131", []),
]);
const statusOf = statusAround("202608");

const course = (
  id: string,
  code: string,
  term = "202701",
  extra: Partial<Extract<FourYearEntry, { kind: "course" }>> = {},
) => aFourYearEntry({ id: `entry_${id}`, code, term, ...extra });

function row(progress: readonly GenEdProgress[], id: string): GenEdProgress {
  const found = progress.find((p) => p.requirement.id === id);
  if (!found) throw new Error(`no ${id}`);
  return found;
}

describe("GEN_ED_REQUIREMENTS", () => {
  it("has every category once, with the counts UMD asks for", () => {
    const codes = GEN_ED_REQUIREMENTS.flatMap((r) => r.codes);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes).toHaveLength(13);
    expect(GEN_ED_REQUIREMENTS.reduce((n, r) => n + r.needed, 0)).toBe(17);
    expect(genEdRequirementOf("DSNL")?.atLeast).toEqual({
      code: "DSNL",
      count: 1,
    });
    expect(genEdRequirementOf("CORE")).toBeUndefined();
  });
});

describe("conditionMet", () => {
  const doc = aFourYear({
    entries: [
      course("geol100", "GEOL100", "202608"),
      course("geol110", "GEOL110", "202701"),
    ],
  });
  it("holds when the named course is in the same or an earlier semester", () => {
    const [geol100, geol110] = doc.entries;
    if (!geol100 || !geol110) throw new Error("fixture");
    expect(conditionMet("if taken with GEOL110", geol100, doc)).toBe(false);
    expect(
      conditionMet(
        "if taken with GEOL 110",
        { ...geol100, term: "202701" },
        doc,
      ),
    ).toBe(true);
    expect(
      conditionMet(
        "if taken with GEOL110",
        { ...geol100, term: "202708" },
        doc,
      ),
    ).toBe(true);
  });
  it("doesn't hold for a condition naming no course, or the course itself", () => {
    const [geol100] = doc.entries;
    if (!geol100) throw new Error("fixture");
    expect(conditionMet("with departmental approval", geol100, doc)).toBe(
      false,
    );
    expect(conditionMet("if taken with GEOL100", geol100, doc)).toBe(false);
  });
});

describe("allocateGenEds", () => {
  it("counts one-option groups, every group of a course, and credit entries", () => {
    const doc = aFourYear({
      entries: [
        aFourYearCreditEntry({ id: "entry_ap", genEds: ["FSMA", "DSNS"] }),
        course("engl", "ENGL101", "202601"),
        course("anth", "ANTH260", "202608"),
      ],
    });
    const { progress, picks } = allocateGenEds(doc, lookup, statusOf);
    expect(row(progress, "FSAW")).toMatchObject({
      done: 1,
      short: 0,
      searchCodes: [],
    });
    expect(row(progress, "FSMA").done).toBe(1);
    expect(row(progress, "DSHS")).toMatchObject({ inProgress: 1, short: 1 });
    expect(row(progress, "DV")).toMatchObject({ inProgress: 1, short: 1 });
    expect(picks.get("entry_anth")?.map((p) => p.code)).toEqual([
      "DSHS",
      "DVUP",
    ]);
    expect(picks.has("entry_ap")).toBe(false);
  });

  it("counts the GenEds someone gave a code Testudo doesn't list, each of them", () => {
    const details = { title: "Democratic Habits", genEds: ["DSHS", "SCIS"] };
    const doc = aFourYear({
      entries: [
        course("hnuh", "HNUH278B", "202601", { credits: 3, details }),
        // Testudo's GenEds win once it lists the code.
        course("anth", "ANTH260", "202601", {
          details: { title: null, genEds: ["FSAW"] },
        }),
      ],
    });
    const withHnuh = fourYearCourses([...lookup.courses.values()], ["HNUH"]);
    const { progress, picks } = allocateGenEds(doc, withHnuh, statusOf);
    expect(picks.get("entry_hnuh")?.map((p) => p.code)).toEqual([
      "DSHS",
      "SCIS",
    ]);
    expect(row(progress, "SCIS").done).toBe(1);
    expect(row(progress, "DSHS").done).toBe(2);
    expect(row(progress, "FSAW").done).toBe(0);
  });

  it("gives an open choice to the category furthest from done", () => {
    const doc = aFourYear({
      entries: [course("anth", "ANTH260", "202601"), course("h200", "HIST200")],
    });
    // ANTH260 already has a DSHS; DSHU still needs two.
    const { picks, progress } = allocateGenEds(doc, lookup, statusOf);
    expect(picks.get("entry_h200")?.[0]).toMatchObject({
      code: "DSHU",
      chosen: false,
      counts: true,
    });
    expect(row(progress, "DSHU").planned).toBe(1);
  });

  it("never overrides the person's choice", () => {
    const doc = aFourYear({
      entries: [
        course("anth", "ANTH260", "202601"),
        course("h200", "HIST200", "202701", { genEdChoices: { "0": "DSHS" } }),
      ],
    });
    const { picks, progress } = allocateGenEds(doc, lookup, statusOf);
    expect(picks.get("entry_h200")?.[0]).toMatchObject({
      code: "DSHS",
      chosen: true,
      counts: true,
    });
    expect(row(progress, "DSHS")).toMatchObject({
      done: 1,
      planned: 1,
      short: 0,
    });
  });

  it("ignores a stale choice that isn't one of the group's options", () => {
    const doc = aFourYear({
      entries: [
        course("h200", "HIST200", "202701", { genEdChoices: { "0": "FSAW" } }),
      ],
    });
    expect(
      allocateGenEds(doc, lookup, statusOf).picks.get("entry_h200")?.[0],
    ).toMatchObject({
      code: "DSHS",
      chosen: false,
    });
  });

  it("counts a conditional DSNL only with its partner in the same or an earlier semester", () => {
    const alone = aFourYear({ entries: [course("g100", "GEOL100")] });
    const aloneResult = allocateGenEds(alone, lookup, statusOf);
    expect(aloneResult.picks.get("entry_g100")?.[0]).toMatchObject({
      code: "DSNS",
      counts: true,
      condition: null,
    });
    const dsn = row(aloneResult.progress, "DSN");
    expect(dsn).toMatchObject({ planned: 1, short: 1, searchCodes: ["DSNL"] });

    const paired = aFourYear({
      entries: [course("g110", "GEOL110", "202608"), course("g100", "GEOL100")],
    });
    const pairedPick = allocateGenEds(paired, lookup, statusOf).picks.get(
      "entry_g100",
    )?.[0];
    // With GEOL110 before it, the DSNL option holds; it ties with DSNS, so the first option wins.
    expect(pairedPick).toMatchObject({ code: "DSNL", counts: true });
    // Chosen as DSNL, it counts too.
    const chosen = aFourYear({
      entries: [
        course("g110", "GEOL110", "202608"),
        course("g100", "GEOL100", "202701", { genEdChoices: { "0": "DSNL" } }),
      ],
    });
    const chosenResult = allocateGenEds(chosen, lookup, statusOf);
    expect(chosenResult.picks.get("entry_g100")?.[0]).toMatchObject({
      code: "DSNL",
      condition: "if taken with GEOL110",
      counts: true,
    });
    expect(row(chosenResult.progress, "DSN").short).toBe(0);
  });

  it("keeps a chosen option whose condition fails, but doesn't count it", () => {
    const doc = aFourYear({
      entries: [
        course("g100", "GEOL100", "202701", { genEdChoices: { "0": "DSNL" } }),
      ],
    });
    const { picks, progress } = allocateGenEds(doc, lookup, statusOf);
    expect(picks.get("entry_g100")?.[0]).toMatchObject({
      code: "DSNL",
      chosen: true,
      counts: false,
    });
    expect(row(progress, "DSN").entryIds).toEqual([]);
  });

  it("counts a course once per category", () => {
    const doc = aFourYear({ entries: [course("aaas", "AAAS100")] });
    const { picks, progress } = allocateGenEds(doc, lookup, statusOf);
    expect(picks.get("entry_aaas")?.map((p) => p.counts)).toEqual([
      true,
      false,
    ]);
    expect(row(progress, "DV")).toMatchObject({ planned: 1, short: 1 });
  });

  it("counts a GenEd placeholder as planned, and a pattern placeholder for nothing", () => {
    const doc = aFourYear({
      entries: [
        aFourYearWildcardEntry({
          id: "entry_w1",
          term: "202601",
          wildcard: { kind: "gen-ed", code: "DSSP" },
        }),
        aFourYearWildcardEntry({ id: "entry_w2" }),
      ],
    });
    const { progress, picks } = allocateGenEds(doc, lookup, statusOf);
    expect(row(progress, "DSSP")).toMatchObject({
      done: 0,
      planned: 1,
      short: 1,
    });
    expect(picks.size).toBe(0);
  });

  it("doesn't count a failed course or an attempt a retake replaced", () => {
    const doc = aFourYear({
      entries: [
        course("e1", "ENGL101", "202601"),
        course("e2", "ENGL101", "202608"),
        course("anth", "ANTH260", "202601"),
      ],
      grades: { entry_anth: "F" },
    });
    const { progress, picks } = allocateGenEds(doc, lookup, statusOf);
    expect(row(progress, "FSAW")).toMatchObject({
      done: 0,
      inProgress: 1,
      entryIds: ["entry_e2"],
    });
    expect(row(progress, "DSHS").entryIds).toEqual([]);
    expect(picks.get("entry_anth")?.[0]?.counts).toBe(false);
  });

  it("decides done courses before planned ones", () => {
    // Planned HIST200 comes first in the doc's order only if sorted wrong.
    const doc = aFourYear({
      entries: [
        course("h201", "HIST201", "202601"),
        course("h200", "HIST200", "202701"),
      ],
    });
    const { picks } = allocateGenEds(doc, lookup, statusOf);
    // The done one picks first (DSHS, tie → first option), the planned one then leans DSHU.
    expect(picks.get("entry_h201")?.[0]?.code).toBe("DSHS");
    expect(picks.get("entry_h200")?.[0]?.code).toBe("DSHU");
  });

  it("is deterministic and counts each course at most once per group", () => {
    const codes = [
      "ENGL101",
      "GEOL100",
      "GEOL110",
      "HIST200",
      "HIST201",
      "HIST202",
      "ANTH260",
      "AAAS100",
      "CMSC131",
    ];
    const terms = ["before", "202601", "202608", "202701", "202708"];
    const entry = fc.record({
      code: fc.constantFrom(...codes),
      term: fc.constantFrom(...terms),
      choose: fc.option(fc.constantFrom("DSHS", "DSHU", "DSNL"), {
        nil: undefined,
      }),
    });
    fc.assert(
      fc.property(fc.array(entry, { maxLength: 12 }), (list) => {
        const doc = aFourYear({
          entries: list.map((e, i) =>
            course(`p${i}`, e.code, e.term, {
              genEdChoices: e.choose ? { "0": e.choose } : {},
            }),
          ),
        });
        const a = allocateGenEds(doc, lookup, statusOf);
        const b = allocateGenEds(structuredClone(doc), lookup, statusOf);
        expect(b.progress).toEqual(a.progress);
        expect([...b.picks]).toEqual([...a.picks]);
        const counted = a.progress.flatMap((p) => p.entryIds);
        for (const [id, picks] of a.picks) {
          const inCategories = counted.filter((c) => c === id).length;
          expect(inCategories).toBe(picks.filter((p) => p.counts).length);
        }
        for (const e of doc.entries) {
          if (e.kind !== "course") continue;
          const choice = e.genEdChoices["0"];
          const pick = a.picks.get(e.id)?.[0];
          const options =
            lookup.courses.get(e.code)?.genEds[0]?.map((o) => o.code) ?? [];
          if (choice && options.includes(choice))
            expect(pick?.code).toBe(choice);
        }
      }),
    );
  });
});

describe("genEdProgressLabel", () => {
  const [first] = GEN_ED_REQUIREMENTS;
  if (!first) throw new Error("no requirements");
  const base = {
    requirement: { ...first, needed: 2, atLeast: null },
    entryIds: [],
    searchCodes: [],
  };
  const none = { done: 0, inProgress: 0, planned: 0 };

  it("says what's still needed, in words (QA P2)", () => {
    expect(genEdProgressLabel({ ...base, ...none, short: 2 })).toBe(
      "Needs 2 courses",
    );
    expect(
      genEdProgressLabel({
        ...base,
        requirement: { ...base.requirement, needed: 1 },
        ...none,
        short: 1,
      }),
    ).toBe("Needs 1 course");
    expect(
      genEdProgressLabel({ ...base, ...none, inProgress: 1, short: 1 }),
    ).toBe("1 planned, needs 1 more");
  });

  it("says when it's covered, and by what", () => {
    expect(
      genEdProgressLabel({ ...base, ...none, done: 2, planned: 1, short: 0 }),
    ).toBe("Covered: 2 done, 1 planned");
    expect(genEdProgressLabel({ ...base, ...none, planned: 2, short: 0 })).toBe(
      "Covered: 2 planned",
    );
    expect(genEdProgressLabel({ ...base, ...none, done: 2, short: 0 })).toBe(
      "Done",
    );
  });

  it("names an at-least rule only while it's still short", () => {
    const requirement = {
      ...base.requirement,
      atLeast: { count: 1, code: "DSNL" as const },
    };
    expect(
      genEdProgressLabel({ ...base, requirement, ...none, short: 2 }),
    ).toBe("Needs 2 courses, at least 1 DSNL");
    expect(
      genEdProgressLabel({
        ...base,
        requirement,
        ...none,
        planned: 2,
        short: 0,
      }),
    ).toBe("Covered: 2 planned");
  });
});
