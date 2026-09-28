import { describe, expect, it } from "vitest";
import {
  aCourseIndexEntry,
  aFourYear,
  aFourYearEntry,
  aTranscriptLine,
} from "~/fixtures";
import type { TranscriptParse } from "../../schema";
import { fourYearCourses } from "../course-lookup";
import { EMPTY_FOUR_YEAR_STATE, fourYearReducer } from "../reducer";
import { statusAround } from "../test-helpers";
import { PASTES } from "./__fixtures__/pastes";
import {
  buildTranscriptImport,
  EMPTY_TRANSCRIPT_CHECKS,
  fitsEquivalentPattern,
  importReplaceTerms,
  importSummary,
  normalizeCourseCode,
  openChoices,
  pendingChoices,
  rowCode,
  rowIncluded,
  type TranscriptChecks,
  transcriptRows,
} from "./import";
import { parseTranscript } from "./parse";

const parse = (name: string): TranscriptParse => {
  const text = PASTES[name];
  if (text === undefined) throw new Error(`No paste ${name}`);
  return parseTranscript(text);
};

/** Ids in order, so tests can name what they expect. */
function ids() {
  let n = 0;
  return () => `entry_import_${++n}`;
}

const checks = (over: Partial<TranscriptChecks> = {}): TranscriptChecks => ({
  ...EMPTY_TRANSCRIPT_CHECKS,
  ...over,
});

const row = (
  rows: ReturnType<typeof transcriptRows>["rows"],
  title: string,
) => {
  const found = rows.find((r) => r.line.title === title);
  if (!found) throw new Error(`No row ${title}`);
  return found;
};

describe("transcriptRows", () => {
  it("lists read lines, then lines left out that can be ticked back in, by term", () => {
    const { rows, unreadable } = transcriptRows(parse("synthetic-in-progress"));
    expect([...new Set(rows.map((r) => r.line.term))]).toEqual([
      "before",
      "202508",
      "202601",
      "202608",
    ]);
    const skipped = rows.filter((r) => r.skipped !== null);
    expect(
      skipped.map((r) => [r.skipped, r.line.code ?? r.line.title]),
    ).toEqual([
      ["no-credit", "AP US HISTORY"],
      ["withdrawn", "KNES157"],
      ["dropped", "BMGT110"],
      ["withdrawn", "MUSC205"],
    ]);
    expect(unreadable).toEqual([
      "CMSC330 0101 ORGANIZATION OF PROG LANG 3.00 SEE ADVISOR",
    ]);
  });

  it("gives every row a key of its own", () => {
    for (const name of Object.keys(PASTES)) {
      const { rows } = transcriptRows(parse(name));
      expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length);
    }
  });

  it("puts a term's skipped lines after its read lines", () => {
    const { rows } = transcriptRows({
      recognized: true,
      lines: [aTranscriptLine({ term: "202508", code: "CMSC131" })],
      skipped: [
        {
          raw: "KNES157 RUNNING W 1.00",
          reason: "withdrawn",
          line: aTranscriptLine({ term: "202508", code: "KNES157" }),
        },
      ],
    });
    expect(rows.map((r) => r.line.code)).toEqual(["CMSC131", "KNES157"]);
  });
});

describe("rowIncluded", () => {
  const { rows } = transcriptRows(parse("synthetic-in-progress"));
  const read = rows.find((r) => r.skipped === null);
  const left = rows.find((r) => r.skipped === "dropped");
  if (!read || !left) throw new Error("fixture changed");

  it("imports what was read and leaves out what was skipped, until toggled", () => {
    expect(rowIncluded(read, checks())).toBe(true);
    expect(rowIncluded(left, checks())).toBe(false);
    const toggled = checks({ toggled: new Set([read.key, left.key]) });
    expect(rowIncluded(read, toggled)).toBe(false);
    expect(rowIncluded(left, toggled)).toBe(true);
  });
});

describe("choices", () => {
  const psyc = aTranscriptLine({
    code: "PSYC100",
    genEds: [[{ code: "DSHS" }, { code: "DSNS" }], [{ code: "SCIS" }]],
  });
  const { rows } = transcriptRows({
    recognized: true,
    lines: [psyc],
    skipped: [],
  });
  const [r] = rows;
  if (!r) throw new Error("no row");

  it("asks for each group with an 'or' until one is chosen", () => {
    expect(openChoices(r, checks())).toEqual([0]);
    expect(pendingChoices(rows, checks())).toBe(1);
    const chosen = checks({ choices: { [r.key]: { 0: "DSNS" } } });
    expect(openChoices(r, chosen)).toEqual([]);
    expect(pendingChoices(rows, chosen)).toBe(0);
  });

  it("doesn't wait on a line that won't be imported", () => {
    expect(pendingChoices(rows, checks({ toggled: new Set([r.key]) }))).toBe(0);
  });

  it("counts the pastes' own 'or' lines", () => {
    const transfer = transcriptRows(parse("synthetic-ap-transfer")).rows;
    // AP PSYCHOLOGY (DSHS or DSNS) and AASP100 (DSHS or DSHU).
    expect(pendingChoices(transfer, checks())).toBe(2);
  });
});

describe("rowCode", () => {
  const { rows } = transcriptRows(parse("synthetic-ap-transfer"));

  it("is the line's own code, or the equivalent it counts as", () => {
    expect(rowCode(row(rows, "AP CALCULUS BC"), checks())).toBe("MATH141");
    expect(rowCode(row(rows, "CONTEMP MORAL ISSUES"), checks())).toBe(
      "PHIL140",
    );
  });

  it("is the mapped course for credit with no UMD course, else null", () => {
    const chem = row(rows, "AP CHEMISTRY");
    expect(rowCode(chem, checks())).toBeNull();
    expect(rowCode(chem, checks({ mappings: { [chem.key]: "CHEM131" } }))).toBe(
      "CHEM131",
    );
  });

  it("never remaps a line that already names its course", () => {
    const calc = row(rows, "AP CALCULUS BC");
    expect(rowCode(calc, checks({ mappings: { [calc.key]: "MATH140" } }))).toBe(
      "MATH141",
    );
  });
});

describe("fitsEquivalentPattern", () => {
  it("matches the pattern's digits and an honors letter", () => {
    expect(fitsEquivalentPattern("CHEM131", "CHEM1XX")).toBe(true);
    expect(fitsEquivalentPattern("CHEM131H", "CHEM1XX")).toBe(true);
    expect(fitsEquivalentPattern("CHEM231", "CHEM1XX")).toBe(false);
    expect(fitsEquivalentPattern("CHEM131", "CHEM.XX")).toBe(false);
  });
});

describe("normalizeCourseCode", () => {
  it("reads a code the way people type it", () => {
    expect(normalizeCourseCode("chem 131")).toBe("CHEM131");
    expect(normalizeCourseCode(" CMSC389a ")).toBe("CMSC389A");
    expect(normalizeCourseCode("CHEM1XX")).toBeNull();
    expect(normalizeCourseCode("")).toBeNull();
  });
});

describe("buildTranscriptImport", () => {
  const lookup = fourYearCourses([
    aCourseIndexEntry({ code: "CMSC131", credits: { min: 4, max: 4 } }),
    aCourseIndexEntry({
      code: "PSYC100",
      credits: { min: 3, max: 3 },
      // The catalog lists its groups in another order than the transcript.
      genEds: [[{ code: "SCIS" }], [{ code: "DSHS" }, { code: "DSNS" }]],
    }),
    aCourseIndexEntry({ code: "CMSC389A", credits: { min: 1, max: 3 } }),
  ]);

  it("makes a transcript course entry per line, with its grade", () => {
    const { rows } = transcriptRows({
      recognized: true,
      lines: [
        aTranscriptLine({ term: "202508", code: "CMSC131", grade: "A-" }),
      ],
      skipped: [],
    });
    expect(
      buildTranscriptImport(rows, checks(), { lookup, newId: ids() }),
    ).toEqual({
      entries: [
        {
          kind: "course",
          id: "entry_import_1",
          term: "202508",
          code: "CMSC131",
          credits: null,
          genEdChoices: {},
          source: "transcript",
          transcript: { title: "OBJECT-ORIENTED PROG I", via: "umd" },
        },
      ],
      grades: { entry_import_1: "A-" },
    });
  });

  it("keeps the GenEds the transcript lists for a code the index doesn't have", () => {
    const { rows } = transcriptRows({
      recognized: true,
      lines: [
        aTranscriptLine({
          code: "HNUH278B",
          title: "DEMOCRATIC HABITS",
          credits: 3,
          genEds: [[{ code: "DSHS" }], [{ code: "SCIS" }]],
        }),
        aTranscriptLine({ code: "HNUH218C", credits: 3, genEds: [] }),
        aTranscriptLine({
          code: "CMSC131",
          genEds: [[{ code: "DSNS" }]],
        }),
      ],
      skipped: [],
    });
    const { entries } = buildTranscriptImport(rows, checks(), {
      lookup,
      newId: ids(),
    });
    expect(entries[0]).toMatchObject({
      code: "HNUH278B",
      details: { title: null, genEds: ["DSHS", "SCIS"] },
    });
    // No GenEds printed, or a code Testudo knows: nothing to keep.
    expect(entries[1]).not.toHaveProperty("details");
    expect(entries[2]).not.toHaveProperty("details");
  });

  it("leaves grades out when they aren't kept", () => {
    const { rows } = transcriptRows(parse("synthetic-four-semesters"));
    const result = buildTranscriptImport(rows, checks({ keepGrades: false }), {
      lookup,
      newId: ids(),
    });
    expect(result.entries.length).toBeGreaterThan(0);
    expect(result.grades).toEqual({});
  });

  it("keeps the transcript's credits only where the index would count differently", () => {
    const { rows } = transcriptRows({
      recognized: true,
      lines: [
        aTranscriptLine({ code: "CMSC131", credits: 4 }),
        aTranscriptLine({ code: "CMSC389A", credits: 2 }),
        aTranscriptLine({ code: "HIST999", credits: 3 }),
      ],
      skipped: [],
    });
    const { entries } = buildTranscriptImport(rows, checks(), {
      lookup,
      newId: ids(),
    });
    expect(entries.map((e) => (e.kind === "course" ? e.credits : "?"))).toEqual(
      [null, 2, 3],
    );
  });

  it("sets the chosen GenEd on the catalog's group", () => {
    const { rows } = transcriptRows({
      recognized: true,
      lines: [
        aTranscriptLine({
          code: "PSYC100",
          genEds: [[{ code: "DSHS" }, { code: "DSNS" }], [{ code: "SCIS" }]],
        }),
      ],
      skipped: [],
    });
    const key = rows[0]?.key ?? "";
    const { entries } = buildTranscriptImport(
      rows,
      checks({ choices: { [key]: { 0: "DSNS" } } }),
      { lookup, newId: ids() },
    );
    expect(entries[0]).toMatchObject({ genEdChoices: { "1": "DSNS" } });
  });

  it("keeps the transcript's group for a course the index doesn't have", () => {
    const { rows } = transcriptRows({
      recognized: true,
      lines: [
        aTranscriptLine({
          code: "AASP100",
          genEds: [[{ code: "DSHS" }, { code: "DSHU" }], [{ code: "DVUP" }]],
        }),
      ],
      skipped: [],
    });
    const key = rows[0]?.key ?? "";
    const { entries } = buildTranscriptImport(
      rows,
      checks({ choices: { [key]: { 0: "DSHU" } } }),
      { lookup, newId: ids() },
    );
    expect(entries[0]).toMatchObject({ genEdChoices: { "0": "DSHU" } });
  });

  it("turns AP and transfer credit without a UMD course into credit entries", () => {
    const { rows } = transcriptRows(parse("synthetic-ap-transfer"));
    const { entries, grades } = buildTranscriptImport(
      rows,
      checks({ choices: {} }),
      { lookup, newId: ids() },
    );
    const credits = entries.filter((e) => e.kind === "credit");
    expect(credits).toEqual([
      expect.objectContaining({
        term: "before",
        title: "AP CHEMISTRY",
        credits: 4,
        genEds: ["DSNL"],
        source: "transcript",
        via: "ap",
        equivalentPattern: "CHEM1XX",
      }),
      expect.objectContaining({
        title: "WORLD RELIGIONS",
        credits: 3,
        genEds: ["DSHU"],
        via: "transfer",
        equivalentPattern: "RELS1XX",
      }),
      expect.objectContaining({
        title: "PUBLIC SPEAKING",
        genEds: [],
        equivalentPattern: null,
      }),
    ]);
    // Nobody has said what they count as yet: that's what Problems asks.
    for (const c of credits) expect(c).not.toHaveProperty("countsAs");
    // Credit entries carry no grade (V3 §2.3: only course entries have one).
    for (const c of credits) expect(grades[c.id]).toBeUndefined();
  });

  it("keeps a mapped line as its own credit, counting as the course it was mapped to", () => {
    const { rows } = transcriptRows(parse("synthetic-ap-transfer"));
    const chem = row(rows, "AP CHEMISTRY");
    const { entries } = buildTranscriptImport(
      rows,
      checks({ mappings: { [chem.key]: "CHEM131" } }),
      { lookup, newId: ids() },
    );
    expect(entries).toContainEqual(
      expect.objectContaining({
        kind: "credit",
        term: "before",
        title: "AP CHEMISTRY",
        credits: 4,
        genEds: ["DSNL"],
        countsAs: "CHEM131",
      }),
    );
    expect(entries.some((e) => e.kind === "course" && e.code === "CHEM131")).toBe(
      false,
    );
  });

  it("imports exam credit and electives from the transfer paste", () => {
    const { rows } = transcriptRows(parse("synthetic-transfer-credit"));
    const { entries } = buildTranscriptImport(rows, checks(), {
      lookup,
      newId: ids(),
    });
    expect(entries).toContainEqual(
      expect.objectContaining({
        kind: "credit",
        title: "IB ENGLISH A LIT HL",
        via: "exam",
        equivalentPattern: null,
      }),
    );
    // Not evaluated yet: left out until ticked in.
    expect(
      entries.some((e) => e.kind === "credit" && e.title.startsWith("ANATOMY")),
    ).toBe(false);
  });

  it("imports AP and transfer lines that name their course as that course", () => {
    const { rows } = transcriptRows(parse("synthetic-ap-transfer"));
    const { entries, grades } = buildTranscriptImport(rows, checks(), {
      lookup,
      newId: ids(),
    });
    const socy = entries.find(
      (e) => e.kind === "course" && e.code === "SOCY100",
    );
    expect(socy).toMatchObject({
      term: "before",
      transcript: { title: "INTRO TO SOCIOLOGY", via: "transfer" },
    });
    expect(socy && grades[socy.id]).toBe("A");
  });

  it("leaves out what's toggled off, and brings in a skipped line toggled on, without a grade", () => {
    const { rows } = transcriptRows(parse("synthetic-in-progress"));
    const dropped = rows.find((r) => r.skipped === "dropped");
    const first = rows.find((r) => r.skipped === null);
    if (!dropped || !first) throw new Error("fixture changed");
    const base = buildTranscriptImport(rows, checks(), {
      lookup,
      newId: ids(),
    });
    const { entries, grades } = buildTranscriptImport(
      rows,
      checks({ toggled: new Set([dropped.key, first.key]) }),
      { lookup, newId: ids() },
    );
    expect(entries).toHaveLength(base.entries.length);
    const bmgt = entries.find(
      (e) => e.kind === "course" && e.code === "BMGT110",
    );
    expect(bmgt).toBeDefined();
    expect(bmgt && grades[bmgt.id]).toBeUndefined();
  });

  it("never brings a grade in with a skipped line, even one with a grade-shaped mark", () => {
    const { rows } = transcriptRows({
      recognized: true,
      lines: [],
      skipped: [
        {
          raw: "AP BIOLOGY P BSCI105 4.00 Credit not granted",
          reason: "no-credit",
          line: aTranscriptLine({
            term: "before",
            code: "BSCI105",
            grade: "P",
            via: "ap",
          }),
        },
      ],
    });
    const key = rows[0]?.key ?? "";
    const { entries, grades } = buildTranscriptImport(
      rows,
      checks({ toggled: new Set([key]) }),
      { lookup, newId: ids() },
    );
    expect(entries).toHaveLength(1);
    expect(grades).toEqual({});
  });

  it("never imports an in-progress course's grade, since it has none", () => {
    const { rows } = transcriptRows(parse("synthetic-in-progress"));
    const { entries, grades } = buildTranscriptImport(rows, checks(), {
      lookup,
      newId: ids(),
    });
    const cmsc216 = entries.find(
      (e) => e.kind === "course" && e.code === "CMSC216",
    );
    expect(cmsc216 && grades[cmsc216.id]).toBeUndefined();
  });

  it("feeds the reducer's import: one step, grades and all", () => {
    const { rows } = transcriptRows(parse("synthetic-four-semesters"));
    const { entries, grades } = buildTranscriptImport(
      rows,
      checks({
        choices: Object.fromEntries(
          rows.flatMap((r) =>
            openChoices(r, checks()).map((g) => [
              r.key,
              { [g]: r.line.genEds[g]?.[0]?.code ?? "DSHS" },
            ]),
          ),
        ),
      }),
      { lookup, newId: ids() },
    );
    const doc = aFourYear({ firstTermId: "202608" });
    const state = fourYearReducer(
      { ...EMPTY_FOUR_YEAR_STATE, docs: [doc] },
      {
        type: "import",
        docId: doc.id,
        replace: [],
        entries,
        grades,
        now: "2026-09-27T12:00:00.000Z",
      },
    );
    const next = state.docs[0];
    expect(next?.entries).toHaveLength(24);
    expect(next?.firstTermId).toBe("202308");
    expect(Object.keys(next?.grades ?? {})).toHaveLength(24);
  });
});

describe("importReplaceTerms", () => {
  it("is the doc's done and in-progress columns, Before UMD included", () => {
    expect(
      importReplaceTerms(
        ["before", "202508", "202601", "202608", "202701"],
        statusAround("202601"),
      ),
    ).toEqual(["before", "202508", "202601"]);
  });
});

describe("importSummary", () => {
  const course = (term: string, id: string) =>
    aFourYearEntry({ term, id, code: "CMSC131" });

  it("counts courses and semesters, and says so plainly", () => {
    expect(
      importSummary([
        course("202508", "entry_a_000"),
        course("202508", "entry_b_000"),
        course("202601", "entry_c_000"),
      ]),
    ).toBe("Imported 3 courses from 2 semesters");
    expect(importSummary([course("202508", "entry_a_000")])).toBe(
      "Imported 1 course from 1 semester",
    );
  });

  it("names AP and transfer credit", () => {
    expect(
      importSummary([
        course("before", "entry_a_000"),
        course("202508", "entry_b_000"),
      ]),
    ).toBe("Imported 2 courses from 1 semester and Before UMD");
    expect(importSummary([course("before", "entry_a_000")])).toBe(
      "Imported 1 course from Before UMD",
    );
  });
});
