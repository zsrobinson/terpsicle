import { describe, expect, it } from "vitest";
import type { TermId } from "~/core/schema";
import type { HistoryDept } from "~/core/schema/history";
import {
  nextLikelyTerm,
  nextOffering,
  type OfferingSummary,
  offeredLikelihood,
  offeredTermsIn,
  offeringLine,
  offeringPhrase,
  offeringRecord,
  offeringStrip,
  offeringSummary,
  offeringText,
  offeringWords,
} from "./offering-pattern";

// Strips are the report's (fb3 offering-patterns): Fall 2018 to Spring 2027,
// fall then spring each year, `1` offered, `0` not, `-` not on record. The
// real ones are real courses' records from the production history of
// 30 September 2026, where Fall 2025 and Spring 2026 weren't on record yet.

const NOW: TermId = "202701";

function semestersFrom(start: TermId, count: number): TermId[] {
  const out: TermId[] = [];
  let term = start;
  while (out.length < count) {
    out.push(term);
    const year = Number(term.slice(0, 4));
    term = term.endsWith("08") ? `${year + 1}01` : `${year}08`;
  }
  return out;
}

/** A strip → the history's two sets, plus any extra terms (summers, winters). */
function strip(
  bits: string,
  extra: { offered?: TermId[]; recorded?: TermId[] } = {},
) {
  const terms = semestersFrom("201808", bits.length);
  const offered = new Set<TermId>(extra.offered ?? []);
  const recorded = new Set<TermId>([
    ...(extra.recorded ?? []),
    ...(extra.offered ?? []),
  ]);
  [...bits].forEach((bit, i) => {
    const term = terms[i];
    if (!term || bit === "-") return;
    recorded.add(term);
    if (bit === "1") offered.add(term);
  });
  return { offered, recorded };
}

const summary = (
  bits: string,
  extra?: Parameters<typeof strip>[1],
  now: TermId = NOW,
) => offeringSummary({ ...strip(bits, extra), now });

// Real records.
const CMSC452 = "01010101000101--01"; // spring only, missed 2023
const CMSC473 = "00000010101010--10"; // fall only since 2021
const CMSC416 = "00000010111110--11"; // every fall, some springs
const CMSC427 = "10101010100101--01"; // moved from fall to spring in 2023
const CMSC454 = "00010001101101--01"; // mostly spring
const CMSC477 = "00000000010101--01"; // spring only since 2023
const CCJS453 = "10001000100010--10"; // every other fall, even years
const NFSC412 = "01000100010001--01"; // every other spring, odd years
const GEMS296 = "10101010101010--11"; // fall, and Spring 2027 once
const EVERY = "11111111111111--11";

describe("offeringSummary: the classes", () => {
  it("calls a course run every fall and spring every-semester", () => {
    const s = summary(EVERY);
    expect(s.pattern).toEqual({ kind: "every-semester" });
    expect(s.confidence).toBe("high");
    expect(s.onRecord).toBe(16);
    expect(s.offered).toBe(16);
    expect(s.lastOffered).toBe("202701");
  });

  it("calls a spring-only course once-a-year, counting each season apart", () => {
    const s = summary(CMSC452);
    expect(s.pattern).toEqual({ kind: "once-a-year", season: "spring" });
    expect(s.confidence).toBe("high");
    // Its span starts at its first offering, Spring 2019.
    expect(s.since).toBe("201901");
    expect(s.springs).toEqual({ offered: 7, onRecord: 8 });
    expect(s.falls).toEqual({ offered: 0, onRecord: 7 });
    expect(s.lastOffered).toBe("202701");
  });

  it("calls a fall-only course once-a-year", () => {
    expect(summary(CMSC473).pattern).toEqual({
      kind: "once-a-year",
      season: "fall",
    });
  });

  it("keeps fall only through one stray spring (rate ≤ 0.15)", () => {
    // GEMS296: 8 of 8 falls, 1 of 8 springs.
    expect(summary(GEMS296).pattern).toEqual({
      kind: "once-a-year",
      season: "fall",
    });
  });

  it("calls every fall and some springs leans fall", () => {
    expect(summary(CMSC416).pattern).toEqual({ kind: "leans", season: "fall" });
  });

  it("calls every spring and some falls leans spring", () => {
    expect(summary("01110111010111--01").pattern).toEqual({
      kind: "leans",
      season: "spring",
    });
  });

  it("calls even-year falls alternate-years", () => {
    const s = summary(CCJS453);
    expect(s.pattern).toEqual({
      kind: "alternate-years",
      season: "fall",
      parity: "even",
    });
  });

  it("calls odd-year springs alternate-years", () => {
    expect(summary(NFSC412).pattern).toEqual({
      kind: "alternate-years",
      season: "spring",
      parity: "odd",
    });
  });

  it("needs three of each year on record to call alternate years", () => {
    // Even falls 2022, 2024, 2026; odd falls only 2023 on record.
    const s = summary("00000000100-10--10");
    expect(s.pattern.kind).not.toBe("alternate-years");
  });

  it("calls a course that moved seasons irregular, leaning to where it went", () => {
    expect(summary(CMSC427).pattern).toEqual({
      kind: "irregular",
      lean: "spring",
    });
  });

  it("leans irregular courses by their recent years", () => {
    expect(summary(CMSC454).pattern).toEqual({
      kind: "irregular",
      lean: "spring",
    });
    // Offered in turns with no season to it.
    expect(summary("10010110011100--11").pattern).toEqual({
      kind: "irregular",
      lean: null,
    });
  });

  it("calls one or two offerings in the window rare", () => {
    expect(summary("00100000000000--10").pattern).toEqual({ kind: "rare" });
  });

  it("calls a course first offered in the last three years new", () => {
    const s = summary("00000000000010--10");
    expect(s.pattern).toEqual({ kind: "new" });
    expect(s.confidence).toBe("medium");
  });

  it("calls a course first on record this school year no-history", () => {
    const s = summary("00000000000000--10");
    expect(s.pattern).toEqual({ kind: "no-history" });
    expect(s.confidence).toBe("low");
  });

  it("calls a course with nothing on record no-history", () => {
    const s = summary("00000000000000--00");
    expect(s.pattern).toEqual({ kind: "no-history" });
    expect(s.lastOffered).toBeNull();
  });

  it("calls a course with nothing in the last three years discontinued", () => {
    const s = summary("11111111000000--00");
    expect(s.pattern).toEqual({ kind: "discontinued", last: "202201" });
    expect(s.lastOffered).toBe("202201");
  });

  it("calls a course run only in summers summer-or-winter", () => {
    const s = summary("00000000000000--00", {
      offered: ["202405", "202505", "202605"],
      recorded: ["202305"],
    });
    expect(s.pattern).toEqual({
      kind: "summer-or-winter",
      seasons: ["summer"],
    });
  });

  it("keeps a summer course's season through a stray fall", () => {
    const summers = [2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026].map(
      (y): TermId => `${y}05`,
    );
    // Every summer and Fall 2022 once: summers, not "Rarely".
    const s = summary("00000000100000--00", { offered: summers });
    expect(s.pattern).toEqual({
      kind: "summer-or-winter",
      seasons: ["summer"],
    });
    expect(offeringText(s)).toBe("Summer only");
    // Two summers and two falls aren't a summer course.
    expect(
      summary("00000000101000--00", { offered: ["202505", "202605"] }).pattern
        .kind,
    ).not.toBe("summer-or-winter");
  });

  it("calls one summer or winter low confidence", () => {
    const s = summary("00000000000000--00", { offered: ["202612"] });
    expect(s.pattern).toEqual({
      kind: "summer-or-winter",
      seasons: ["winter"],
    });
    expect(s.confidence).toBe("low");
  });

  it("reads a course older than the window from the window's start", () => {
    const s = summary(EVERY, { offered: ["201501", "201508"] });
    expect(s.since).toBe("201808");
    expect(s.pattern).toEqual({ kind: "every-semester" });
  });

  it("looks back `years` years", () => {
    // Fall only for the last four years, both seasons before.
    const bits = "11111111101010--10";
    expect(summary(bits).pattern.kind).not.toBe("once-a-year");
    expect(
      offeringSummary({ ...strip(bits), now: NOW, years: 4 }).pattern,
    ).toEqual({ kind: "once-a-year", season: "fall" });
  });
});

describe("offeringSummary: gaps in the record", () => {
  it("doesn't count a term that isn't on record against a course", () => {
    // Every term it could have run, it did: the gap is unknown, not "no".
    expect(summary(EVERY).pattern).toEqual({ kind: "every-semester" });
    expect(summary("11111111--------11").pattern).toEqual({
      kind: "every-semester",
    });
  });

  it("counts a term on record that lacks the course as not offered", () => {
    expect(summary("11111111111111--10").pattern).toEqual({
      kind: "every-semester",
    });
    expect(summary("11111111111010--10").pattern).toEqual({
      kind: "leans",
      season: "fall",
    });
  });

  it("scales confidence with the terms on record", () => {
    expect(summary(CMSC452).confidence).toBe("high");
    // Spring 2023 to Spring 2027: seven fall and spring terms on record.
    expect(summary(CMSC477).pattern).toEqual({
      kind: "once-a-year",
      season: "spring",
    });
    expect(summary(CMSC477).confidence).toBe("medium");
    expect(summary("11--------------11").confidence).toBe("low");
  });

  it("holds alternate years to medium while a recent term is missing", () => {
    expect(summary(CCJS453).confidence).toBe("medium");
    // The same course with the 2025–26 gap filled.
    const filled = summary("100010001000100010");
    expect(filled.pattern).toEqual({
      kind: "alternate-years",
      season: "fall",
      parity: "even",
    });
    expect(filled.confidence).toBe("high");
  });
});

describe("offeredLikelihood", () => {
  const listed = new Set<TermId>(["202608", "202701"]);

  it("answers listed terms from what Testudo lists, not the pattern", () => {
    const { offered } = strip(CMSC452);
    const s = summary(CMSC452);
    expect(offeredLikelihood(s, "202701", listed, offered)).toBe("yes");
    expect(offeredLikelihood(s, "202608", listed, offered)).toBe("no");
  });

  it("answers other terms from the pattern", () => {
    const s = summary(CMSC452);
    const none = new Set<TermId>();
    expect(offeredLikelihood(s, "202801", listed, none)).toBe("likely");
    expect(offeredLikelihood(s, "202708", listed, none)).toBe("unlikely");
    // A season the pattern says nothing about.
    expect(offeredLikelihood(s, "202705", listed, none)).toBe("unknown");
  });

  it("knows which year an alternate-year course runs", () => {
    const s = summary(CCJS453);
    const none = new Set<TermId>();
    expect(offeredLikelihood(s, "202808", listed, none)).toBe("likely");
    expect(offeredLikelihood(s, "202708", listed, none)).toBe("unlikely");
    expect(offeredLikelihood(s, "202801", listed, none)).toBe("unlikely");
  });

  it("says unknown when the pattern is weak or has no season", () => {
    const none = new Set<TermId>();
    expect(
      offeredLikelihood(summary("11--------------11"), "202801", listed, none),
    ).toBe("unknown");
    expect(offeredLikelihood(summary(CMSC454), "202801", listed, none)).toBe(
      "unknown",
    );
    expect(offeredLikelihood(summary(CMSC416), "202801", listed, none)).toBe(
      "unknown",
    );
    expect(offeredLikelihood(summary(CMSC416), "202708", listed, none)).toBe(
      "likely",
    );
  });
});

describe("nextLikelyTerm", () => {
  it("finds the next term in the course's season", () => {
    expect(nextLikelyTerm(summary(CMSC452), "202701")).toBe("202801");
    expect(nextLikelyTerm(summary(CMSC473), "202701")).toBe("202708");
    expect(nextLikelyTerm(summary(EVERY), "202701")).toBe("202708");
  });

  it("skips the off year of an alternate-year course", () => {
    expect(nextLikelyTerm(summary(CCJS453), "202608")).toBe("202808");
    expect(nextLikelyTerm(summary(NFSC412), "202701")).toBe("202901");
  });

  it("has none for a course with no season or a weak pattern", () => {
    expect(nextLikelyTerm(summary(CMSC454), "202701")).toBeNull();
    expect(nextLikelyTerm(summary("11--------------11"), "202701")).toBeNull();
  });
});

describe("nextOffering", () => {
  it("names a later listed term that has it", () => {
    const { offered } = strip(CMSC452);
    const listed = new Set<TermId>(["202608", "202701"]);
    expect(nextOffering(summary(CMSC452), "202608", listed, offered)).toEqual({
      termId: "202701",
      likely: false,
    });
  });

  it("falls back to the pattern past the listed terms", () => {
    const { offered } = strip(CMSC452);
    const listed = new Set<TermId>(["202608", "202701"]);
    expect(nextOffering(summary(CMSC452), "202701", listed, offered)).toEqual({
      termId: "202801",
      likely: true,
    });
  });

  it("has none when neither knows", () => {
    expect(
      nextOffering(summary(CMSC454), "202701", new Set(), new Set()),
    ).toBeNull();
  });
});

describe("offeringWords", () => {
  it("says each pattern in plain words", () => {
    expect(offeringWords({ kind: "every-semester" })).toBeNull();
    expect(offeringWords({ kind: "once-a-year", season: "spring" })).toBe(
      "Spring only",
    );
    expect(offeringWords({ kind: "once-a-year", season: "fall" })).toBe(
      "Fall only",
    );
    expect(offeringWords({ kind: "leans", season: "fall" })).toBe(
      "Every fall, some springs",
    );
    expect(
      offeringWords({
        kind: "alternate-years",
        season: "fall",
        parity: "even",
      }),
    ).toBe("Every other fall");
    expect(offeringWords({ kind: "irregular", lean: "spring" })).toBe(
      "Mostly spring",
    );
    expect(offeringWords({ kind: "irregular", lean: null })).toBe(
      "No fixed season",
    );
    expect(offeringWords({ kind: "rare" })).toBe("Rarely");
    expect(
      offeringWords({ kind: "summer-or-winter", seasons: ["summer"] }),
    ).toBe("Summer only");
    expect(
      offeringWords({
        kind: "summer-or-winter",
        seasons: ["summer", "winter"],
      }),
    ).toBe("Summer and winter only");
    expect(offeringWords({ kind: "new" })).toBeNull();
    expect(offeringWords({ kind: "no-history" })).toBeNull();
    expect(offeringWords({ kind: "discontinued", last: "202201" })).toBeNull();
  });
});

describe("offeringText and offeringPhrase", () => {
  const at = (
    pattern: OfferingSummary["pattern"],
    confidence: OfferingSummary["confidence"] = "high",
  ): OfferingSummary => ({
    pattern,
    confidence,
    lastOffered: null,
    since: null,
    onRecord: 0,
    offered: 0,
    falls: { offered: 0, onRecord: 0 },
    springs: { offered: 0, onRecord: 0 },
  });
  const both = (summary: OfferingSummary) => [
    offeringText(summary),
    offeringPhrase(summary),
  ];

  it("always says something, every-semester courses included", () => {
    expect(both(summary(EVERY))).toEqual([
      "Fall and spring",
      "Usually fall and spring",
    ]);
    expect(both(summary(CMSC452))).toEqual([
      "Spring only",
      "Usually spring only",
    ]);
    expect(both(summary(CCJS453))).toEqual([
      "Every other fall",
      "Usually every other fall",
    ]);
    expect(both(summary(CMSC416))).toEqual([
      "Every fall, some springs",
      "Usually every fall, some springs",
    ]);
    expect(both(summary(CMSC454))).toEqual(["Mostly spring", "Mostly spring"]);
    expect(both(at({ kind: "irregular", lean: null }))).toEqual([
      "No fixed season",
      "No fixed season",
    ]);
    expect(both(summary("00100000000000--10"))).toEqual([
      "Rarely",
      "Rarely offered",
    ]);
  });

  it("says plainly when the record is too thin to tell", () => {
    expect(both(summary("00000000000000--10"))).toEqual([
      "Not enough history to tell",
      "Not enough history to tell",
    ]);
    expect(both(summary("00000000000010--10"))).toEqual([
      "Too new to tell",
      "Too new to tell",
    ]);
    // A pattern on too few terms on record isn't one yet.
    expect(both(summary("11--------------11"))).toEqual([
      "Not enough history to tell",
      "Not enough history to tell",
    ]);
  });

  it("says when a discontinued course last ran", () => {
    expect(both(summary("11111111000000--00"))).toEqual([
      "Not since Spring 2022",
      "Last offered Spring 2022",
    ]);
  });
});

describe("offeredTermsIn", () => {
  const dept = (code: string, terms: TermId[]): HistoryDept => ({
    schemaVersion: 1,
    dept: code.slice(0, 4),
    courses: [
      {
        code,
        title: null,
        offerings: [...terms]
          .sort()
          .reverse()
          .map((termId) => ({
            termId,
            source: "planetterp" as const,
            instructors: [],
            sections: [],
          })),
      },
    ],
  });

  it("merges a course with its cross-listings", () => {
    // PlanetTerp files CMSC456's grades under MATH456.
    const depts = new Map([
      ["CMSC", dept("CMSC456", ["202608"])],
      ["MATH", dept("MATH456", ["202401", "202501"])],
    ]);
    expect([...offeredTermsIn(depts, ["CMSC456", "MATH456"])].sort()).toEqual([
      "202401",
      "202501",
      "202608",
    ]);
  });

  it("is empty for a course or department the history doesn't have", () => {
    expect(offeredTermsIn(new Map(), ["CMSC999"]).size).toBe(0);
  });
});

describe("offeringRecord", () => {
  it("counts the course's own season first", () => {
    expect(offeringRecord(summary(CMSC452))).toBe(
      "Offered in 7 of the 8 springs on record since 2019, and in no fall.",
    );
    expect(offeringRecord(summary(CMSC416))).toBe(
      "Offered in 5 of the 5 falls on record since 2021, and in 3 of the 5 springs.",
    );
    expect(offeringRecord(summary(CMSC454))).toBe(
      "Offered in 5 of the 7 springs on record since 2020, and in 2 of the 6 falls.",
    );
  });

  it("has nothing to count without a span", () => {
    expect(offeringRecord(summary("00000000000000--10"))).toBeNull();
  });
});

describe("offeringLine", () => {
  const listed = new Set<TermId>(["202608", "202701"]);

  it("says the pattern and when it's next", () => {
    const { offered } = strip(CCJS453);
    expect(offeringLine(summary(CCJS453), "202608", listed, offered)).toEqual({
      words: "Every other fall",
      next: { termId: "202808", likely: true },
    });
  });

  it("says every semester too, with no next to point out", () => {
    const { offered } = strip(EVERY);
    expect(offeringLine(summary(EVERY), "202701", listed, offered)).toEqual({
      words: "Fall and spring",
      next: null,
    });
  });
});

describe("offeringStrip", () => {
  it("lays out the window's falls and springs, oldest first", () => {
    const { offered, recorded } = strip(CMSC452);
    const cells = offeringStrip({ offered, recorded, now: NOW });
    expect(cells).toHaveLength(18);
    expect(cells[0]).toEqual({ termId: "201808", state: "not-offered" });
    expect(cells[1]).toEqual({ termId: "201901", state: "offered" });
    expect(cells[14]).toEqual({ termId: "202508", state: "not-on-record" });
    expect(cells.at(-1)).toEqual({ termId: "202701", state: "offered" });
  });
});
