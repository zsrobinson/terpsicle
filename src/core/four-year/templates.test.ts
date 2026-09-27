import { describe, expect, it } from "vitest";
import {
  aCourseIndexEntry,
  aFourYear,
  aFourYearEntry,
  aFourYearTemplate,
  FIXTURE_NOW,
} from "~/fixtures";
import { fourYearCourses } from "./course-lookup";
import { fourYearReducer } from "./reducer";
import {
  checkTemplate,
  templateAddedLabel,
  templateCredits,
  templateFit,
  templateFitSentence,
  templateRef,
  templateSemesters,
} from "./templates";

const template = aFourYearTemplate();

function counter() {
  let n = 0;
  return () => `entry_t${++n}`;
}

const lookup = fourYearCourses([
  aCourseIndexEntry({ code: "CMSC131", credits: { min: 4, max: 4 } }),
  aCourseIndexEntry({ code: "CMSC132", credits: { min: 4, max: 4 } }),
  aCourseIndexEntry({ code: "CMSC498A", credits: { min: 1, max: 3 } }),
]);

describe("templateSemesters", () => {
  it("gives each block a new id and marks it as from a template", () => {
    expect(templateSemesters(template, counter())).toEqual([
      {
        index: 0,
        entries: [
          {
            kind: "course",
            id: "entry_t1",
            code: "CMSC131",
            credits: null,
            genEdChoices: {},
            source: "template",
            transcript: null,
          },
          {
            kind: "wildcard",
            id: "entry_t2",
            wildcard: { kind: "gen-ed", code: "DSHS" },
            credits: 3,
            source: "template",
          },
        ],
      },
      {
        index: 1,
        entries: [expect.objectContaining({ id: "entry_t3", code: "CMSC132" })],
      },
    ]);
  });

  it("lands relative to the plan's first semester, spring starts included", () => {
    const doc = aFourYear({ firstTermId: "202701" });
    const s = fourYearReducer(
      { docs: [doc] },
      {
        type: "apply-template",
        docId: doc.id,
        template: templateRef(template),
        semesters: templateSemesters(template, counter()),
        now: FIXTURE_NOW,
      },
    );
    expect(s.docs[0]?.entries.map((e) => [e.term, e.id])).toEqual([
      ["202701", "entry_t1"],
      ["202701", "entry_t2"],
      ["202708", "entry_t3"],
    ]);
    expect(s.docs[0]?.template).toEqual({
      id: "test-2026",
      department: "Department of Computer Science",
      year: "2026–27",
    });
  });
});

describe("templateFit", () => {
  it("fills empty semesters and leaves ones with courses alone", () => {
    const doc = aFourYear({
      firstTermId: "202608",
      entries: [aFourYearEntry({ term: "202608" })],
    });
    expect(templateFit(doc, template)).toEqual({
      fills: ["202701"],
      keeps: ["202608"],
    });
  });

  it("says so in words", () => {
    expect(
      templateFitSentence({ fills: ["202608", "202701"], keeps: [] }),
    ).toBe("Fills 2 empty semesters, from Fall 2026.");
    expect(templateFitSentence({ fills: ["202701"], keeps: ["202608"] })).toBe(
      "Fills 1 empty semester, from Spring 2027. Fall 2026 has courses, so it stays as it is.",
    );
    expect(
      templateFitSentence({
        fills: ["202808"],
        keeps: ["202608", "202701", "202708"],
      }),
    ).toBe(
      "Fills 1 empty semester, from Fall 2028. Fall 2026, Spring 2027 and Fall 2027 have courses, so they stay as they are.",
    );
    expect(templateFitSentence({ fills: [], keeps: ["202608"] })).toBe(
      "Every semester it covers already has courses, so there's nothing to fill.",
    );
  });
});

describe("templateCredits and templateAddedLabel", () => {
  it("adds up the semesters and names the toast", () => {
    expect(templateCredits(template)).toBe(11);
    expect(templateAddedLabel(template, 8)).toBe(
      "Added the Computer Science sample plan to 8 semesters",
    );
    expect(templateAddedLabel(template, 1)).toBe(
      "Added the Computer Science sample plan to 1 semester",
    );
  });
});

describe("checkTemplate", () => {
  it("passes a sound template", () => {
    const sound = aFourYearTemplate({
      semesters: [
        {
          index: 0,
          credits: 12,
          entries: [
            { kind: "course", code: "CMSC131" },
            { kind: "course", code: "CMSC132" },
            {
              kind: "wildcard",
              wildcard: { kind: "gen-ed", code: "DSNL" },
              credits: 4,
            },
          ],
        },
      ],
    });
    expect(checkTemplate(sound, lookup)).toEqual([]);
  });

  it("names unknown codes, unknown GenEds, variable credits, sums that don't add up, light semesters and http", () => {
    const bad = aFourYearTemplate({
      sourceUrl: "http://example.com/plan",
      semesters: [
        {
          index: 0,
          credits: 12,
          entries: [
            { kind: "course", code: "CMSC999" },
            { kind: "course", code: "CMSC498A" },
            {
              kind: "wildcard",
              wildcard: { kind: "gen-ed", code: "ZZZZ" },
              credits: 3,
            },
          ],
        },
        {
          index: 1,
          credits: 4,
          entries: [{ kind: "course", code: "CMSC132" }],
        },
      ],
    });
    expect(checkTemplate(bad, lookup)).toEqual([
      "test-2026: the source link isn't https.",
      "test-2026, semester 0: CMSC999 isn't in the course index.",
      "test-2026, semester 0: CMSC498A has variable credits, so the sample can't say how many.",
      "test-2026, semester 0: ZZZZ isn't a GenEd UMD uses.",
      "test-2026, semester 0: its blocks add up to 4 credits, not the 12 it says.",
      "test-2026, semester 1: 4 credits is less than full time (12).",
    ]);
  });
});
