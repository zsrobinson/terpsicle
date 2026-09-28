import { describe, expect, it } from "vitest";
import {
  type FourYearEntry,
  FourYearProblemSchema,
} from "~/core/schema/four-year";
import {
  aCourseIndexEntry,
  aFourYear,
  aFourYearCreditEntry,
  aFourYearEntry,
  aFourYearWildcardEntry,
} from "~/fixtures";
import { fourYearCourses } from "./course-lookup";
import {
  firstSemesterMeetingPrereqs,
  meetsGroup,
  unmetPrereqGroups,
} from "./prereqs";
import {
  applyFourYearFix,
  detectFourYearProblems,
  type FourYearProblemsInput,
  recentSemesters,
} from "./problems";
import { statusAround } from "./test-helpers";

const none = { prerequisite: null, prereqs: { groups: [], complete: true } };
const lookup = fourYearCourses([
  aCourseIndexEntry({ code: "CMSC131", credits: { min: 4, max: 4 }, ...none }),
  aCourseIndexEntry({
    code: "CMSC132",
    credits: { min: 4, max: 4 },
    prerequisite: "Minimum grade of C- in CMSC131.",
    prereqs: { groups: [["CMSC131"]], complete: true },
  }),
  aCourseIndexEntry({
    code: "CMSC216",
    credits: { min: 4, max: 4 },
    prerequisite: "Minimum grade of C- in CMSC132.",
    prereqs: { groups: [["CMSC132"]], complete: true },
  }),
  aCourseIndexEntry({ code: "CMSC250", credits: { min: 4, max: 4 }, ...none }),
  aCourseIndexEntry(), // CMSC351: CMSC250 and CMSC216
  aCourseIndexEntry({
    code: "CMSC330",
    prerequisite: "CMSC216 and CMSC250; or MATH141.",
    prereqs: {
      groups: [
        ["CMSC216", "MATH141"],
        ["CMSC250", "MATH141"],
      ],
      complete: true,
    },
  }),
  aCourseIndexEntry({ code: "MATH140", credits: { min: 4, max: 4 }, ...none }),
  aCourseIndexEntry({ code: "MATH141", credits: { min: 4, max: 4 }, ...none }),
  aCourseIndexEntry({ code: "AMSC460", crossListings: ["CMSC460"], ...none }),
  aCourseIndexEntry({
    code: "CMSC466",
    prerequisite: "CMSC460.",
    prereqs: { groups: [["CMSC460"]], complete: true },
  }),
  aCourseIndexEntry({
    code: "CMSC498A",
    offered: ["202401", "202308"],
    ...none,
  }),
]);
const statusOf = statusAround("202608");

const course = (id: string, code: string, term = "202701") =>
  aFourYearEntry({ id: `entry_${id}`, code, term });

function input(
  entries: FourYearEntry[],
  extra: Partial<FourYearProblemsInput> = {},
): FourYearProblemsInput {
  return {
    doc: aFourYear({ entries }),
    lookup,
    statusOf,
    latestTermId: "202701",
    ...extra,
  };
}

describe("prerequisite checks", () => {
  it("counts a cross-listed code either way", () => {
    expect(meetsGroup("AMSC460", ["CMSC460"], lookup)).toBe(true);
    expect(meetsGroup("CMSC460", ["AMSC460"], lookup)).toBe(true);
    expect(meetsGroup("MATH140", ["CMSC460"], lookup)).toBe(false);
  });

  it("needs an earlier column: the same term doesn't count, Before UMD does", () => {
    const cs216 = course("216", "CMSC216", "202708");
    const doc = aFourYear({
      entries: [
        course("131", "CMSC131", "before"),
        course("132", "CMSC132", "202708"),
        cs216,
      ],
    });
    expect(unmetPrereqGroups(doc, cs216, lookup)).toEqual([["CMSC132"]]);
    const ok = aFourYear({
      entries: [course("132", "CMSC132", "202701"), cs216],
    });
    expect(unmetPrereqGroups(ok, cs216, lookup)).toEqual([]);
  });

  it("doesn't let a failed course or a placeholder meet anything", () => {
    const cs132 = course("132", "CMSC132", "202708");
    const doc = aFourYear({
      entries: [course("131", "CMSC131", "202601"), cs132],
      grades: { entry_131: "F" },
    });
    expect(unmetPrereqGroups(doc, cs132, lookup)).toEqual([["CMSC131"]]);
  });

  it("finds the first semester after every group's earliest course", () => {
    const cs351 = course("351", "CMSC351", "202608");
    const doc = aFourYear({
      entries: [
        cs351,
        course("250", "CMSC250", "202701"),
        course("216", "CMSC216", "202708"),
        course("216b", "CMSC216", "202801"),
      ],
    });
    expect(firstSemesterMeetingPrereqs(doc, cs351, lookup)).toBe("202801");
    const missing = aFourYear({
      entries: [cs351, course("250", "CMSC250", "202701")],
    });
    expect(firstSemesterMeetingPrereqs(missing, cs351, lookup)).toBeNull();
    const early = aFourYear({
      entries: [
        course("250", "CMSC250", "before"),
        course("216", "CMSC216", "before"),
        cs351,
      ],
    });
    expect(firstSemesterMeetingPrereqs(early, cs351, lookup)).toBe("202608");
  });

  it("never counts a course as its own prerequisite", () => {
    // Testudo's MATH140: "Minimum grade of C- in MATH115; or must have math
    // eligibility of MATH140 or higher." The eligibility is placement, not
    // the course.
    const own = fourYearCourses([
      aCourseIndexEntry({
        code: "MATH140",
        prerequisite:
          "Minimum grade of C- in MATH115; or must have math eligibility of MATH140 or higher.",
        prereqs: { groups: [["MATH115", "MATH140"]], complete: false },
      }),
      aCourseIndexEntry({
        code: "MATH141",
        prerequisite: "Math eligibility of MATH141.",
        prereqs: { groups: [["MATH141"]], complete: false },
      }),
    ]);
    const calc1 = course("140", "MATH140", "202608");
    const calc2 = course("141", "MATH141", "202608");
    const doc = aFourYear({ entries: [calc1, calc2] });
    expect(unmetPrereqGroups(doc, calc1, own)).toEqual([["MATH115"]]);
    expect(unmetPrereqGroups(doc, calc2, own)).toEqual([]);
    expect(firstSemesterMeetingPrereqs(doc, calc2, own)).toBe("202608");
    const [p] = detectFourYearProblems(input([calc1], { lookup: own })).filter(
      (q) => q.kind === "prereq-order",
    );
    expect(p?.title).toEqual([
      { kind: "course", courseCode: "MATH140" },
      { kind: "text", text: " needs " },
      { kind: "course", courseCode: "MATH115" },
      { kind: "text", text: " first" },
    ]);
  });
});

describe("detectFourYearProblems", () => {
  it("says a course is before its prerequisite, with Testudo's sentence and a move", () => {
    const problems = detectFourYearProblems(
      input([
        course("351", "CMSC351", "202701"),
        course("250", "CMSC250", "202608"),
        course("216", "CMSC216", "202708"),
        course("132", "CMSC132", "202608"),
        // Spring 2028 already has a full load, so the move leaves no light semester.
        course("140", "MATH140", "202801"),
        course("141", "MATH141", "202801"),
        course("131", "CMSC131", "202801"),
      ]),
    );
    const [p] = problems.filter((q) => q.kind === "prereq-order");
    expect(p?.title).toEqual([
      { kind: "course", courseCode: "CMSC351" },
      { kind: "text", text: " is before " },
      { kind: "course", courseCode: "CMSC216" },
    ]);
    expect(p?.detail).toEqual([
      {
        kind: "text",
        text: "Testudo says: Minimum grade of C- in CMSC250 and CMSC216.",
      },
    ]);
    expect(p?.fix).toEqual({
      kind: "move",
      entryId: "entry_351",
      term: "202801",
      label: "Move CMSC351 to Spring 2028",
    });
    for (const q of problems)
      expect(FourYearProblemSchema.safeParse(q).success).toBe(true);
  });

  it("says when they're in the same semester, and names what's missing", () => {
    const same = detectFourYearProblems(
      input([
        course("250", "CMSC250", "202708"),
        course("216", "CMSC216", "202608"),
        course("351", "CMSC351", "202708"),
      ]),
    );
    expect(
      same.find((p) => p.id === "prereq-order:entry_351")?.title[1],
    ).toEqual({
      kind: "text",
      text: " is in the same semester as ",
    });

    const missing = detectFourYearProblems(
      input([course("351", "CMSC351", "202708")]),
    );
    const p = missing.find((q) => q.kind === "prereq-order");
    expect(p?.title).toEqual([
      { kind: "course", courseCode: "CMSC351" },
      { kind: "text", text: " needs " },
      { kind: "course", courseCode: "CMSC250" },
      { kind: "text", text: " and " },
      { kind: "course", courseCode: "CMSC216" },
      { kind: "text", text: " first" },
    ]);
    expect(p?.fix).toBeNull();

    const alternatives = detectFourYearProblems(
      input([course("330", "CMSC330", "202708")]),
    );
    expect(
      alternatives
        .find((q) => q.kind === "prereq-order")
        ?.title.map((m) =>
          m.kind === "text" ? m.text : m.kind === "course" ? m.courseCode : "",
        )
        .join(""),
    ).toBe("CMSC330 needs CMSC216 or MATH141, and CMSC250 or MATH141 first");
  });

  it("doesn't check done semesters or Before UMD", () => {
    expect(
      detectFourYearProblems(
        input([
          course("351", "CMSC351", "202601"),
          course("132", "CMSC132", "before"),
        ]),
      ),
    ).toEqual([]);
  });

  it("drops a fix that would create a new problem", () => {
    // Moving CMSC216 after CMSC132 puts it after CMSC351, which needs it.
    const problems = detectFourYearProblems(
      input([
        course("131", "CMSC131", "202608"),
        course("216", "CMSC216", "202701"),
        course("132", "CMSC132", "202701"),
        course("250", "CMSC250", "202701"),
        course("351", "CMSC351", "202708"),
        course("140", "MATH140", "202708"),
        course("141", "MATH141", "202708"),
      ]),
    );
    const p = problems.find((q) => q.kind === "prereq-order");
    expect(p?.subjects).toEqual([{ kind: "entry", entryId: "entry_216" }]);
    expect(p?.fix).toBeNull();
  });

  it("flags a light planned semester, not an empty one or a summer", () => {
    const problems = detectFourYearProblems(
      input([
        course("250", "CMSC250", "202708"),
        aFourYearWildcardEntry({ id: "entry_w", term: "202708", credits: 2 }),
        course("131", "CMSC131", "202705"),
        course("140", "MATH140", "202608"),
      ]),
    );
    expect(problems.map((p) => p.id)).toEqual(["light-semester:202708"]);
    expect(problems[0]?.title).toEqual([
      { kind: "text", text: "Fall 2027 has 6 credits." },
    ]);
    expect(problems[0]?.detail).toEqual([
      { kind: "text", text: "Full time is 12." },
    ]);
  });

  it("flags a course taken twice, offering to remove the later one", () => {
    const problems = detectFourYearProblems(
      input([
        course("a", "CMSC131", "202601"),
        course("b", "CMSC131", "202701"),
        course("c", "CMSC131", "202701"),
        course("d", "MATH140", "202701"),
        course("e", "MATH141", "202701"),
      ]),
    );
    const repeated = problems.filter((p) => p.kind === "repeated-course");
    expect(repeated.map((p) => p.id)).toEqual([
      "repeated-course:entry_b:entry_a",
      "repeated-course:entry_c:entry_a",
    ]);
    expect(repeated[0]?.title).toEqual([
      { kind: "course", courseCode: "CMSC131" },
      { kind: "text", text: " is in Spring 2026 and Spring 2027" },
    ]);
    expect(repeated[0]?.fix).toEqual({
      kind: "remove",
      entryId: "entry_b",
      label: "Remove the later one",
    });
  });

  it("doesn't flag a retake of a course that earned nothing, or offer to remove history", () => {
    const retake = input([
      course("a", "CMSC131", "202601"),
      course("b", "CMSC131", "202608"),
    ]);
    const failed = {
      ...retake,
      doc: { ...retake.doc, grades: { entry_a: "F" as const } },
    };
    expect(
      detectFourYearProblems(failed).filter(
        (p) => p.kind === "repeated-course",
      ),
    ).toEqual([]);
    const both = detectFourYearProblems(
      input([
        course("a", "CMSC131", "202601"),
        course("b", "CMSC131", "202601"),
      ]),
    );
    expect(both[0]).toMatchObject({ kind: "repeated-course", fix: null });
    expect(both[0]?.title[1]).toEqual({
      kind: "text",
      text: " is in Spring 2026 twice",
    });
  });

  it("warns about a code Testudo doesn't have, first, but not before its department loads", () => {
    const problems = detectFourYearProblems(
      input([
        course("140", "MATH140", "202601"),
        course("x", "CMSC999", "202601"),
        course("h", "HIST999", "202601"),
      ]),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({
      kind: "unknown-course",
      severity: "warning",
      id: "unknown-course:entry_x",
    });
  });

  it("lets details answer a code Testudo doesn't have", () => {
    const x = aFourYearEntry({
      id: "entry_x",
      code: "CMSC999",
      term: "202601",
      credits: 3,
      details: { title: "Old topics course", genEds: [] },
    });
    expect(detectFourYearProblems(input([x]))).toEqual([]);
    const [problem] = detectFourYearProblems(input([{ ...x, details: null }]));
    expect(problem).toMatchObject({ kind: "unknown-course", fix: null });
  });

  it("offers an honors code Testudo dropped its base course's details", () => {
    const withBase = fourYearCourses([
      ...lookup.courses.values(),
      aCourseIndexEntry({
        code: "MATH241",
        title: "Calculus III",
        credits: { min: 4, max: 4 },
        genEds: [[{ code: "FSAR" }], [{ code: "DSHS" }, { code: "DSHU" }]],
        ...none,
      }),
    ]);
    const entry = course("math241h", "MATH241H", "202601");
    const [problem] = detectFourYearProblems(
      input([entry], { lookup: withBase }),
    );
    expect(problem?.fix).toEqual({
      kind: "details",
      code: "MATH241H",
      // Where Testudo says "or", the person picks: only one-option groups.
      details: { title: "Calculus III", genEds: ["FSAR"], countsAs: "MATH241" },
      credits: 4,
      label: "Count it as MATH241",
    });
    expect(FourYearProblemSchema.safeParse(problem).success).toBe(true);
    if (!problem?.fix) throw new Error("no fix");
    const fixed = applyFourYearFix(
      aFourYear({ entries: [entry] }),
      problem.fix,
    );
    expect(fixed.entries[0]).toMatchObject({
      credits: 4,
      details: { title: "Calculus III", genEds: ["FSAR"], countsAs: "MATH241" },
    });
    expect(
      detectFourYearProblems(input(fixed.entries, { lookup: withBase })),
    ).toEqual([]);
  });

  it("asks what credit Testudo gave as a department's level counts as, until someone says", () => {
    const chem = aFourYearCreditEntry({
      id: "entry_chem",
      title: "AP CHEMISTRY",
      equivalentPattern: "CHEM1XX",
    });
    const [problem, ...rest] = detectFourYearProblems(input([chem]));
    expect(rest).toEqual([]);
    expect(problem).toMatchObject({
      kind: "unmatched-credit",
      severity: "info",
      id: "unmatched-credit:entry_chem",
      title: [{ kind: "text", text: "AP Chemistry came in as CHEM1XX" }],
      fix: null,
    });
    expect(problem?.detail[0]).toMatchObject({
      text: expect.stringContaining("a 100-level CHEM course"),
    });
    // Saying a course, or saying it's none, answers it; so does having no placeholder.
    for (const answered of [
      { ...chem, countsAs: "CHEM131" },
      { ...chem, countsAs: null },
      { ...chem, equivalentPattern: null },
    ])
      expect(detectFourYearProblems(input([answered]))).toEqual([]);
  });

  /** Problems other than a light semester, which a one-course test always has. */
  const about = (entries: FourYearEntry[]) =>
    detectFourYearProblems(input(entries)).filter(
      (p) => p.kind !== "light-semester",
    );

  it("lets credit that counts as a course meet prerequisites and repeat it", () => {
    const ap = aFourYearCreditEntry({
      id: "entry_ap",
      title: "INTRO PROGRAMMING",
      countsAs: "CMSC131",
    });
    const cs132 = course("132", "CMSC132", "202701");
    expect(about([ap, cs132])).toEqual([]);
    expect(about([{ ...ap, countsAs: null }, cs132])).toMatchObject([
      { kind: "prereq-order" },
    ]);
    expect(about([ap, course("131", "CMSC131", "202608")])).toMatchObject([
      {
        kind: "repeated-course",
        title: [
          { kind: "course", courseCode: "CMSC131" },
          { kind: "text", text: " is in Before UMD and Fall 2026" },
        ],
      },
    ]);
  });

  it("lets course info's Counts as meet prerequisites for a code Testudo dropped", () => {
    const honors = aFourYearEntry({
      id: "entry_h",
      code: "CMSC131H",
      term: "202601",
      credits: 4,
      details: { title: "Honors OOP", genEds: [], countsAs: "CMSC131" },
    });
    const cs132 = course("132", "CMSC132", "202701");
    expect(about([honors, cs132])).toEqual([]);
    const without = { ...honors, details: { title: "Honors OOP", genEds: [] } };
    expect(about([without, cs132])).toMatchObject([{ kind: "prereq-order" }]);
  });

  it("says when a planned course hasn't been offered lately", () => {
    const problems = detectFourYearProblems(
      input([course("498", "CMSC498A", "202701")]),
    );
    expect(recentSemesters("202705")).toEqual([
      "202701",
      "202608",
      "202601",
      "202508",
    ]);
    expect(
      problems.find((p) => p.kind === "not-offered-lately")?.title,
    ).toEqual([
      { kind: "course", courseCode: "CMSC498A" },
      { kind: "text", text: " was last offered Spring 2024" },
    ]);
    expect(
      detectFourYearProblems(
        input([course("498", "CMSC498A", "202701")], { latestTermId: null }),
      ).some((p) => p.kind === "not-offered-lately"),
    ).toBe(false);
  });

  it("applies fixes the way the reducer would", () => {
    const doc = aFourYear({
      entries: [course("a", "CMSC131"), course("b", "CMSC132")],
    });
    expect(
      applyFourYearFix(doc, {
        kind: "move",
        entryId: "entry_a",
        term: "202608",
        label: "Move",
      }).entries[0],
    ).toMatchObject({ term: "202608" });
    expect(
      applyFourYearFix(doc, {
        kind: "remove",
        entryId: "entry_a",
        label: "Remove",
      }).entries,
    ).toHaveLength(1);
  });
});
