import { describe, expect, it } from "vitest";
import { aFourYear, aFourYearEntry, aFourYearWildcardEntry } from "~/fixtures";
import { FourYearDocSchema } from "./four-year";
import {
  FourYearLinkDocSchema,
  FourYearLinkEntrySchema,
} from "./four-year-link";

// The scheduler's slice of a four-year doc must read every doc Plan saves,
// and refuse what Plan would refuse in the fields it reads.

describe("FourYearLinkDocSchema and FourYearLinkEntrySchema", () => {
  const doc = aFourYear({
    entries: [
      aFourYearEntry({ id: "entry_course", code: "CMSC351" }),
      aFourYearWildcardEntry({
        id: "entry_gened",
        wildcard: { kind: "gen-ed", code: "DSHS" },
      }),
      {
        kind: "credit",
        id: "entry_credit",
        term: "before",
        title: "CHEM 1XX",
        credits: 4,
        genEds: [],
        source: "transcript",
      },
    ],
  });

  it("reads every doc Plan saves, and its course and placeholder entries", () => {
    expect(FourYearDocSchema.safeParse(doc).success).toBe(true);
    const link = FourYearLinkDocSchema.parse(doc);
    expect(link.id).toBe(doc.id);
    expect(
      link.entries.map((e) => FourYearLinkEntrySchema.safeParse(e).success),
    ).toEqual([true, true, false]);
  });

  it("refuses what Plan refuses in the fields it reads", () => {
    for (const bad of [
      { ...doc, id: "x" },
      { ...doc, createdAt: "yesterday" },
    ]) {
      expect(FourYearDocSchema.safeParse(bad).success).toBe(false);
      expect(FourYearLinkDocSchema.safeParse(bad).success).toBe(false);
    }
    for (const bad of [
      { ...aFourYearEntry(), code: "cmsc351" },
      { ...aFourYearEntry(), term: "2027" },
      {
        ...aFourYearWildcardEntry(),
        wildcard: { kind: "pattern", pattern: "CMSC4X1" },
      },
    ])
      expect(FourYearLinkEntrySchema.safeParse(bad).success).toBe(false);
  });
});
