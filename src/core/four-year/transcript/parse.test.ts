import { describe, expect, it } from "vitest";
import { aTranscriptLine } from "~/fixtures";
import {
  type TranscriptLine,
  type TranscriptParse,
  TranscriptParseSchema,
} from "../../schema";
import { PASTES } from "./__fixtures__/pastes";
import { normalizePaste, parseGenEdText, parseTranscript } from "./parse";

const paste = (name: string): string => {
  const text = PASTES[name];
  if (text === undefined) throw new Error(`No paste ${name}`);
  return text;
};
const fourSemesters = paste("synthetic-four-semesters");
const apTransfer = paste("synthetic-ap-transfer");
const inProgress = paste("synthetic-in-progress");

/** One JSON object per line, so a golden diff shows exactly what changed. */
function outline(parse: TranscriptParse): string {
  return [
    `recognized: ${parse.recognized}`,
    "",
    "lines:",
    ...parse.lines.map((l) => JSON.stringify(l)),
    "",
    "skipped:",
    ...parse.skipped.map((s) => JSON.stringify(s)),
    "",
  ].join("\n");
}

const find = (parse: TranscriptParse, code: string): TranscriptLine => {
  const line = parse.lines.find((l) => l.code === code);
  if (!line) throw new Error(`${code} wasn't read`);
  return line;
};

describe("golden pastes", () => {
  it.each(Object.entries(PASTES))("%s", async (name, text) => {
    const parse = parseTranscript(text);
    expect(TranscriptParseSchema.parse(parse)).toEqual(parse);
    expect(parse.recognized).toBe(true);
    await expect(outline(parse)).toMatchFileSnapshot(
      `__fixtures__/${name}.golden.txt`,
    );
  });
});

describe("the fixtures are redacted", () => {
  // A real paste is redacted before it's committed (docs/V3.md §2.10): these
  // are the fixed fakes, and nothing shaped like the real values survives.
  const FAKE_EMAIL = "sam.testudo@example.edu";
  const FAKE_BIRTH_DATE = "01/01/2000";

  it.each(Object.entries(PASTES))("%s", (_, text) => {
    expect(text).not.toMatch(/\b\d{9}\b/); // a UID
    const emails = text.match(/[^\s@]+@[^\s@]+/g) ?? [];
    expect(new Set(emails)).toEqual(new Set([FAKE_EMAIL]));
    for (const [, date] of text.matchAll(/birth\D{0,20}(\d[\d/.-]{5,9})/gi))
      expect(date).toBe(FAKE_BIRTH_DATE);
  });

  it("marks synthetic pastes as synthetic", () => {
    for (const [name, text] of Object.entries(PASTES))
      if (name.startsWith("synthetic-"))
        expect(text.split("\n")[0]).toMatch(/^SYNTHETIC FIXTURE/);
  });

  it("keeps the header out of the result", () => {
    for (const text of Object.values(PASTES)) {
      const json = JSON.stringify(parseTranscript(text));
      for (const header of [
        "Sam Testudo",
        "XXXXXXXXX",
        "example.edu",
        "01/01/2000",
        "Program",
      ])
        expect(json).not.toContain(header);
    }
  });
});

describe("parseTranscript: UMD terms", () => {
  const parse = parseTranscript(fourSemesters);

  it("reads a finished course: code, title, grade, credits, quality points, GenEds", () => {
    expect(find(parse, "MATH140")).toEqual(
      aTranscriptLine({
        term: "202308",
        code: "MATH140",
        title: "CALCULUS I",
        grade: "B-",
        credits: 4,
        earned: 4,
        qualityPoints: 10.8,
        genEds: [[{ code: "FSMA" }], [{ code: "FSAR" }]],
      }),
    );
  });

  it("puts each course in its term", () => {
    expect(new Set(parse.lines.map((l) => l.term))).toEqual(
      new Set(["202308", "202401", "202408", "202501"]),
    );
    expect(parse.lines).toHaveLength(24);
  });

  it("keeps an 'or' as options within one group", () => {
    expect(find(parse, "PSYC100").genEds).toEqual([
      [{ code: "DSHS" }, { code: "DSNS" }],
    ]);
  });

  it("keeps a GenEd's condition", () => {
    expect(find(parse, "GEOL100").genEds).toEqual([
      [{ code: "DSNL", condition: "if taken with GEOL110" }, { code: "DSNS" }],
    ]);
  });

  it("reads P and F as grades", () => {
    expect(find(parse, "MUSC130").grade).toBe("P");
    expect(find(parse, "PHYS121")).toMatchObject({ grade: "F", earned: 0 });
  });

  it("ignores page furniture: semester totals, rules, cumulative lines, the site's chrome", () => {
    expect(parse.skipped).toEqual([]);
  });

  it("names winter for the next year and reads summer", () => {
    const transfer = parseTranscript(apTransfer);
    expect(find(transfer, "PHIL140").term).toBe("202412");
    expect(find(transfer, "STAT400").term).toBe("202505");
  });
});

describe("parseTranscript: AP and transfer credit", () => {
  const parse = parseTranscript(apTransfer);

  it("reads AP credit before the first term, with its equivalent", () => {
    expect(find(parse, "MATH141")).toEqual(
      aTranscriptLine({
        term: "before",
        code: "MATH141",
        title: "AP CALCULUS BC",
        grade: "P",
        credits: 4,
        earned: 4,
        qualityPoints: null,
        genEds: [[{ code: "FSAR" }], [{ code: "FSMA" }]],
        via: "ap",
        equivalentOf: "MATH141",
      }),
    );
  });

  it("doesn't take a letter in an AP title for a grade", () => {
    expect(find(parse, "PHYS161")).toMatchObject({
      title: "AP PHYSICS C MECHANICS",
      grade: "P",
    });
  });

  it("keeps a generic equivalent for the import to map", () => {
    const chem = parse.lines.find((l) => l.title === "AP CHEMISTRY");
    expect(chem).toMatchObject({
      code: null,
      equivalentOf: null,
      equivalentPattern: "CHEM1XX",
      credits: 4,
    });
  });

  it("reads transfer lines with their grades, dropping v1's leading number", () => {
    expect(find(parse, "SOCY100")).toMatchObject({
      title: "INTRO TO SOCIOLOGY",
      grade: "A",
      via: "transfer",
      genEds: [[{ code: "DSHS" }], [{ code: "DVUP" }]],
    });
    expect(
      parse.lines.find((l) => l.title === "PUBLIC SPEAKING"),
    ).toMatchObject({ code: null, equivalentPattern: null, credits: 3 });
  });

  it("skips AP credit that wasn't granted", () => {
    expect(parse.skipped).toEqual([
      {
        raw: "AP US HISTORY NC Credit not granted",
        reason: "no-credit",
        line: expect.objectContaining({ title: "AP US HISTORY", credits: 0 }),
      },
    ]);
  });
});

describe("parseTranscript: in progress, withdrawn, dropped", () => {
  const parse = parseTranscript(inProgress);

  it("reads an in-progress course with its section and no grade", () => {
    expect(find(parse, "CMSC216")).toEqual(
      aTranscriptLine({
        term: "202608",
        code: "CMSC216",
        title: "INTRO COMPUTER SYSTEMS",
        grade: null,
        credits: 4,
        earned: null,
        qualityPoints: null,
        genEds: [],
        sectionCode: "0103",
        inProgress: true,
      }),
    );
  });

  it("reads an Incomplete as a grade, not as part of the title", () => {
    expect(find(parse, "CMSC389")).toMatchObject({
      title: "SPECIAL TOPICS IN CS",
      grade: "I",
    });
  });

  it("skips withdrawn, dropped and unreadable lines, saying why", () => {
    expect(parse.skipped.map((s) => [s.reason, s.line?.code ?? s.raw])).toEqual(
      [
        ["no-credit", "AP US HISTORY NC Credit not granted"],
        ["withdrawn", "KNES157"],
        ["dropped", "BMGT110"],
        ["withdrawn", "MUSC205"],
        [
          "unreadable",
          "CMSC330 0101 ORGANIZATION OF PROG LANG 3.00 SEE ADVISOR",
        ],
      ],
    );
  });

  it("keeps what a skipped line would import as, to tick it back in", () => {
    const dropped = parse.skipped.find((s) => s.reason === "dropped");
    expect(dropped?.line).toMatchObject({
      code: "BMGT110",
      sectionCode: "0101",
      grade: null,
      credits: 3,
    });
    const withdrawn = parse.skipped.find((s) => s.line?.code === "MUSC205");
    expect(withdrawn?.line?.genEds).toEqual([
      [{ code: "DSHU" }, { code: "DSSP" }],
      [{ code: "DVUP" }],
    ]);
  });
});

describe("parseTranscript: layout details", () => {
  const paste = (...lines: string[]) => ["x@example.edu", ...lines].join("\n");

  it("tells a title-ending letter from a grade column", () => {
    const parse = parseTranscript(
      paste(
        "Fall 2026",
        "    CHEM135  0101  VITAMIN D                  3.00",
        "    CMSC131  0101  OBJECT-ORIENTED PROG I     4.00",
        "    BMGT110  0101  INTRO TO BUSINESS    D     3.00",
      ),
    );
    expect(parse.lines.map((l) => l.title)).toEqual([
      "VITAMIN D",
      "OBJECT-ORIENTED PROG I",
    ]);
    expect(parse.skipped.map((s) => s.reason)).toEqual(["dropped"]);
  });

  it("reads a finished course's grade even with single spaces", () => {
    const parse = parseTranscript(
      paste("Fall 2025", "CMSC131 OBJECT-ORIENTED PROG I A- 4.00 4.00 14.80"),
    );
    expect(parse.lines[0]).toMatchObject({
      title: "OBJECT-ORIENTED PROG I",
      grade: "A-",
    });
  });

  it("reads a code printed with a space", () => {
    const parse = parseTranscript(
      paste(
        "Fall 2025",
        "  CMSC 131  OBJECT-ORIENTED PROG I   A   4.00   4.00  16.00",
      ),
    );
    expect(parse.lines[0]?.code).toBe("CMSC131");
  });

  it("starts at the first term when the paste has no header", () => {
    const parse = parseTranscript(
      "Fall 2025\n    ENGL101  ACADEMIC WRITING   A   3.00   3.00   12.00   FSAW\n",
    );
    expect(parse.lines.map((l) => l.code)).toEqual(["ENGL101"]);
  });

  it("starts at a transfer heading when the paste has no header", () => {
    const parse = parseTranscript(
      "Transfer Credit\n    AP BIOLOGY   P   BSCI105   4.00   DSNL\n",
    );
    expect(parse.lines[0]).toMatchObject({ code: "BSCI105", via: "ap" });
  });

  it("takes the kind of credit from a heading", () => {
    const parse = parseTranscript(
      paste(
        "Advanced Placement Examinations",
        "    BIOLOGY   P   BSCI105   4.00   DSNL",
        "Anne Arundel Community College",
        "    BIOLOGY   A   BSCI105   4.00   DSNL",
      ),
    );
    expect(parse.lines.map((l) => l.via)).toEqual(["ap", "transfer"]);
  });

  it("reads a withdrawn transfer line as withdrawn", () => {
    const parse = parseTranscript(paste("    STATISTICS   W   STAT100   3.00"));
    expect(parse.skipped.map((s) => s.reason)).toEqual(["withdrawn"]);
  });

  it("reports a course line it can't read, and nothing else", () => {
    const parse = parseTranscript(
      paste(
        "Spring 2026",
        "    CMSC132  OBJECT-ORIENTED PROG II  B+  4.00  4.00  13.20",
        "    CMSC250  DISCRETE STRUCTURES",
        "    CMSC351  ALGORITHMS  3.00  3.00  9.00",
        "    CMSC330  PROG LANG  A  99.00  99.00  1.00",
        "    CMSC420  DATA STRUCTURES  A  3.00  3.00  12.00  DSHS or (",
        "    Dean's List",
        "    AP BIOLOGY   P   BSCI105   4.00",
      ),
    );
    expect(parse.lines.map((l) => l.code)).toEqual(["CMSC132"]);
    expect(parse.skipped.map((s) => s.raw)).toEqual([
      "CMSC250 DISCRETE STRUCTURES",
      "CMSC351 ALGORITHMS 3.00 3.00 9.00",
      "CMSC330 PROG LANG A 99.00 99.00 1.00",
      "CMSC420 DATA STRUCTURES A 3.00 3.00 12.00 DSHS or (",
    ]);
    expect(new Set(parse.skipped.map((s) => s.reason))).toEqual(
      new Set(["unreadable"]),
    );
  });

  it("reports an unreadable AP or transfer line", () => {
    const parse = parseTranscript(
      paste("    AP BIOLOGY   P   BSCI105   4.00   LOTS OF CREDIT"),
    );
    expect(parse.skipped).toEqual([
      {
        raw: "AP BIOLOGY P BSCI105 4.00 LOTS OF CREDIT",
        reason: "unreadable",
        line: null,
      },
    ]);
  });

  it("isn't recognized when nothing reads as a transcript", () => {
    for (const text of [
      "",
      "hello",
      "Fall 2025\nnothing here",
      paste("Fall 2025", "    CMSC250  DISCRETE STRUCTURES"),
    ])
      expect(parseTranscript(text).recognized).toBe(false);
  });

  it("recognizes a paste whose only course was skipped for a reason", () => {
    const parse = parseTranscript(
      paste("Fall 2025", "    KNES157  RUNNING  W  1.00  0.00  0.00"),
    );
    expect(parse).toMatchObject({ recognized: true, lines: [] });
  });
});

describe("parseGenEdText", () => {
  it("reads groups, options and conditions", () => {
    expect(
      parseGenEdText("DSNL (if taken with GEOL110) or DSNS, SCIS"),
    ).toEqual([
      [{ code: "DSNL", condition: "if taken with GEOL110" }, { code: "DSNS" }],
      [{ code: "SCIS" }],
    ]);
  });

  it("doesn't split inside a condition", () => {
    expect(
      parseGenEdText("DSNL (if taken with GEOL110, or GEOL120) or DSNS"),
    ).toEqual([
      [
        { code: "DSNL", condition: "if taken with GEOL110, or GEOL120" },
        { code: "DSNS" },
      ],
    ]);
  });

  it("is empty for no text and null for anything that isn't codes", () => {
    expect(parseGenEdText("  ")).toEqual([]);
    for (const text of ["SEE ADVISOR", "DSHS,", "DSHS or", "DSHS (", "DSHS)"])
      expect(parseGenEdText(text)).toBeNull();
  });
});

describe("normalizePaste", () => {
  it("evens out line ends, a BOM, zero-width and non-breaking spaces, and tabs", () => {
    expect(
      normalizePaste("\uFEFFa\r\nb\rc\u2028d\u00A0\u00A0e\tf\u200B  \n"),
    ).toEqual(["a", "b", "c", "d  e  f", ""]);
  });
});
