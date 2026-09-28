import fc from "fast-check";
import { deflateSync, strToU8 } from "fflate";
import { describe, expect, it } from "vitest";
import {
  aFourYear,
  aFourYearCreditEntry,
  aFourYearEntry,
  aFourYearWildcardEntry,
} from "~/fixtures";
import {
  type FourYearDoc,
  FourYearDocSchema,
  type FourYearEntry,
} from "../schema/four-year";
import { FOUR_YEAR_SHARE_VERSION } from "../schema/versions";
import {
  decodeFourYearShare,
  encodeFourYearShare,
  type FourYearShare,
  fourYearDocFromShare,
  fourYearShareOf,
  fourYearShareUrl,
  MAX_FOUR_YEAR_SHARE_LENGTH,
} from "./four-year-share";
import { toBase64Url } from "./share";

const NOW = "2026-09-28T12:00:00.000Z";

/** A doc with one of everything a link carries, and grades it must not. */
const everything: FourYearDoc = aFourYear({
  name: "Computer Science",
  firstTermId: "202608",
  template: {
    id: "cmsc-2026",
    department: "Computer Science",
    year: "2026–27",
  },
  entries: [
    aFourYearCreditEntry({ id: "e_credit_01", genEds: ["DSNL"] }),
    aFourYearEntry({
      id: "e_calc_0001",
      term: "before",
      code: "MATH140",
      source: "transcript",
      transcript: { title: "CALCULUS I", via: "ap" },
    }),
    aFourYearEntry({
      id: "e_cmsc_0001",
      term: "202608",
      code: "CMSC131",
      source: "template",
    }),
    aFourYearEntry({
      id: "e_hist_0001",
      term: "202608",
      code: "HIST200",
      genEdChoices: { "0": "DSHS" },
    }),
    aFourYearWildcardEntry({
      id: "e_wild_0001",
      term: "202701",
      wildcard: { kind: "gen-ed", code: "DSHU" },
      credits: 4,
      source: "template",
    }),
    aFourYearEntry({
      id: "e_hnrs_0001",
      term: "202701",
      code: "HONR208",
      credits: 1,
      details: { title: "Honors seminar", genEds: ["SCIS"] },
    }),
    aFourYearWildcardEntry({ id: "e_wild_0002", term: "202708" }),
  ],
  grades: { e_calc_0001: "A", e_cmsc_0001: "B+" },
});

function roundTrip(doc: FourYearDoc): FourYearShare {
  const result = decodeFourYearShare(encodeFourYearShare(doc));
  if (!result.ok) throw new Error(result.error.message);
  return result.share;
}

/** A version-`v` link holding `json`, the way a build would write one. */
function linkOf(v: number | string, json: unknown): string {
  return `${v}.${toBase64Url(deflateSync(strToU8(JSON.stringify(json))))}`;
}

describe("four-year share links", () => {
  it("round-trips everything but ids, times and grades", () => {
    const share = roundTrip(everything);
    expect(share).toEqual(fourYearShareOf(everything));
    expect(JSON.stringify(share)).not.toContain("e_calc_0001");
  });

  it("never carries grades", () => {
    const withGrades = encodeFourYearShare(everything);
    const without = encodeFourYearShare({ ...everything, grades: {} });
    expect(withGrades).toBe(without);
  });

  it("starts with its version, outside the compressed part", () => {
    expect(encodeFourYearShare(everything)).toMatch(
      new RegExp(`^${FOUR_YEAR_SHARE_VERSION}\\.[A-Za-z0-9_-]+$`),
    );
  });

  it("opens as a valid doc with fresh ids and no grades", () => {
    let n = 0;
    const doc = fourYearDocFromShare(roundTrip(everything), {
      id: "shared_fouryear",
      newId: () => `entry_new_${String(++n).padStart(2, "0")}`,
      now: NOW,
    });
    expect(FourYearDocSchema.safeParse(doc).success).toBe(true);
    expect(doc.grades).toEqual({});
    expect(doc.entries.map((e) => e.id)).toEqual(
      everything.entries.map(
        (_, i) => `entry_new_${String(i + 1).padStart(2, "0")}`,
      ),
    );
    expect(doc.entries.map(({ id: _, ...e }) => e)).toEqual(
      everything.entries.map(({ id: _, ...e }) => e),
    );
    expect(doc).toMatchObject({
      name: "Computer Science",
      firstTermId: "202608",
      template: everything.template,
      createdAt: NOW,
    });
  });

  it("keeps a typical plan's link short", () => {
    // Eight semesters of four or five courses and placeholders.
    const terms = [
      "202608",
      "202701",
      "202708",
      "202801",
      "202808",
      "202901",
      "202908",
      "203001",
    ];
    const entries: FourYearEntry[] = terms.flatMap((term, t) =>
      Array.from({ length: 5 }, (_, i) =>
        i === 4
          ? aFourYearWildcardEntry({ id: `w_${t}_${i}_entry`, term })
          : aFourYearEntry({
              id: `c_${t}_${i}_entry`,
              term,
              code: `CMSC${100 + t * 50 + i}`,
              source: "template",
            }),
      ),
    );
    const url = fourYearShareUrl(
      "https://terpsicle.com",
      aFourYear({ entries }),
    );
    expect(url.length).toBeLessThan(700);
    // …and the largest doc still fits under the decoder's limit.
    const full = aFourYear({
      entries: Array.from({ length: 150 }, (_, i) =>
        aFourYearEntry({
          id: `entry_${String(i).padStart(4, "0")}`,
          term: terms[i % 8],
          code: `ENGL${String(100 + i).padStart(3, "0")}`,
          transcript: { title: `A LONG TRANSCRIPT TITLE ${i}`, via: "umd" },
        }),
      ),
    });
    expect(encodeFourYearShare(full).length).toBeLessThan(
      MAX_FOUR_YEAR_SHARE_LENGTH,
    );
    expect(roundTrip(full).entries).toHaveLength(150);
  });

  it("builds the link on /plan/shared", () => {
    expect(fourYearShareUrl("https://terpsicle.com/", everything)).toMatch(
      /^https:\/\/terpsicle\.com\/plan\/shared\?plan=1\./,
    );
  });

  it("still opens a version 1 link made before any later version", () => {
    // Written by the first build with four-year links (2026-09-28). Never
    // change it: an advisor may open a link like it years from now.
    const V1_LINK =
      "1.q1bKU7JS8q1UKMhJzFPSUUoD8owMjMwMLICcEiWrahjPKrpaKRko6ewb7GxobKhUG6sDkjI3MARLlYOUZmfmpQCVFCSWlKQWgUyDsSDaTCIilGp1lJKLlKyMa2NrawE";
    const result = decodeFourYearShare(V1_LINK);
    expect(result).toEqual({
      ok: true,
      share: {
        name: "My plan",
        firstTermId: "202608",
        template: null,
        entries: [
          {
            kind: "course",
            term: "202608",
            code: "CMSC131",
            credits: null,
            genEdChoices: {},
            source: "typed",
            transcript: null,
          },
          {
            kind: "wildcard",
            term: "202701",
            wildcard: { kind: "pattern", pattern: "CMSC4XX" },
            credits: 3,
            source: "typed",
          },
        ],
      },
    });
  });

  it("says a link from a newer version is one, without reading it", () => {
    const newer = decodeFourYearShare(
      `${FOUR_YEAR_SHARE_VERSION + 1}.anything`,
    );
    expect(newer).toEqual({
      ok: false,
      error: expect.objectContaining({ kind: "newer-version" }),
    });
    if (!newer.ok)
      expect(newer.error.message).toBe(
        "This link was made by a newer version of Terpsicle. Reload to open it.",
      );
  });

  it("calls anything else damaged", () => {
    const valid = encodeFourYearShare(everything);
    for (const param of [
      "",
      "1",
      "1.",
      "v1.abc",
      "0.abc",
      "1.a",
      `1.${"A".repeat(MAX_FOUR_YEAR_SHARE_LENGTH)}`,
      "1.!!!!",
      valid.slice(0, -6),
      linkOf(1, { n: "My plan" }),
      linkOf(1, { n: "My plan", f: "202608", t: { "202608": [{ z: 1 }] } }),
      // Transfer credit belongs before UMD.
      linkOf(1, {
        n: "My plan",
        f: "202608",
        t: { "202608": [{ a: "CHEM 1XX", cr: 4, g: [] }] },
      }),
    ])
      expect(decodeFourYearShare(param)).toEqual({
        ok: false,
        error: expect.objectContaining({ kind: "malformed" }),
      });
  });

  it("round-trips any valid doc", () => {
    const term = fc.constantFrom("before", "202608", "202701", "202705");
    const course = fc.record({
      term,
      code: fc.constantFrom("CMSC131", "MATH140", "HIST200"),
      credits: fc.option(fc.integer({ min: 0, max: 6 }), { nil: null }),
      source: fc.constantFrom(
        "typed" as const,
        "transcript" as const,
        "template" as const,
      ),
    });
    fc.assert(
      fc.property(fc.array(course, { maxLength: 20 }), (drafts) => {
        const doc = aFourYear({
          entries: drafts.map((d, i) =>
            aFourYearEntry({ ...d, id: `entry_${String(i).padStart(4, "0")}` }),
          ),
        });
        expect(roundTrip(doc).entries).toEqual(
          fourYearShareOf(doc)
            .entries.map((e, i) => ({ e, i }))
            .sort((a, b) =>
              a.e.term === b.e.term
                ? a.i - b.i
                : a.e.term === "before"
                  ? -1
                  : b.e.term === "before"
                    ? 1
                    : a.e.term < b.e.term
                      ? -1
                      : 1,
            )
            .map(({ e }) => e),
        );
      }),
    );
  });
});
