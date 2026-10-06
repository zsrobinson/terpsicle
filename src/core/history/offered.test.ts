import { describe, expect, it } from "vitest";
import type { TermId } from "~/core/schema";
import { HistoryOfferedSchema } from "~/core/schema/history";
import {
  decodeTermBits,
  encodeTermBits,
  notOfferedMatches,
  type OfferedSighting,
  offeredWindow,
  patchHistoryOffered,
  readHistoryOffered,
} from "./offered";

const sighting = (
  code: string,
  title: string | null = `${code} title`,
  credits: number | null = 3,
): OfferedSighting => ({
  code,
  title,
  credits: credits === null ? null : { min: credits, max: credits },
});

/** Falls and springs from Fall 2018 to Spring 2027. */
const SEMESTERS: TermId[] = [];
for (let y = 2018; y <= 2026; y++) SEMESTERS.push(`${y}08`, `${y + 1}01`);

describe("term bits", () => {
  it("round-trips any set of term indices", () => {
    const terms = SEMESTERS;
    for (const picked of [[], [0], [3, 4], [0, 5, 9, 17], [...terms.keys()]]) {
      const hex = encodeTermBits(picked);
      expect(hex).toMatch(/^[0-9a-f]*$/);
      expect(decodeTermBits(hex, terms)).toEqual(picked.map((i) => terms[i]));
    }
  });

  it("is short: two digits for eight terms", () => {
    expect(encodeTermBits([0, 7])).toBe("18");
    expect(encodeTermBits([])).toBe("");
  });
});

describe("offeredWindow", () => {
  it("keeps the terms on record over the last eight school years", () => {
    const recorded = ["201701", "201805", "201808", "202612", "202701"];
    expect(offeredWindow(recorded)).toEqual(["201808", "202612", "202701"]);
  });
});

describe("patchHistoryOffered", () => {
  it("builds a file from terms, one column each", () => {
    const file = patchHistoryOffered(null, {
      recorded: ["202608", "202701"],
      reread: new Map([
        ["202608", [sighting("CMSC473"), sighting("CMSC351")]],
        ["202701", [sighting("CMSC351"), sighting("CMSC452")]],
      ]),
    });
    expect(HistoryOfferedSchema.parse(file)).toEqual(file);
    expect(file.terms).toEqual(["202608", "202701"]);
    const read = readHistoryOffered(file);
    expect([...(read.get("CMSC351")?.ran ?? [])]).toEqual(["202608", "202701"]);
    expect([...(read.get("CMSC473")?.ran ?? [])]).toEqual(["202608"]);
    expect([...(read.get("CMSC452")?.ran ?? [])]).toEqual(["202701"]);
  });

  it("replaces a re-read term's column and keeps the others", () => {
    const first = patchHistoryOffered(null, {
      recorded: ["202608", "202701"],
      reread: new Map([
        ["202608", [sighting("CMSC473")]],
        ["202701", [sighting("CMSC452")]],
      ]),
    });
    const next = patchHistoryOffered(first, {
      recorded: ["202608", "202612", "202701"],
      reread: new Map([
        ["202612", [sighting("CMSC100")]],
        ["202701", [sighting("CMSC452"), sighting("CMSC456")]],
      ]),
    });
    const read = readHistoryOffered(next);
    expect(next.terms).toEqual(["202608", "202612", "202701"]);
    expect([...(read.get("CMSC473")?.ran ?? [])]).toEqual(["202608"]);
    expect([...(read.get("CMSC100")?.ran ?? [])]).toEqual(["202612"]);
    expect([...(read.get("CMSC456")?.ran ?? [])]).toEqual(["202701"]);
  });

  it("takes the newest term's title and credits, and keeps a known one over none", () => {
    const file = patchHistoryOffered(null, {
      recorded: ["202408", "202608", "202701"],
      reread: new Map([
        ["202408", [sighting("CMSC473", "Old Name", 4)]],
        ["202608", [sighting("CMSC473", "Capstone in Machine Learning", 3)]],
        // umd.io names no credits.
        ["202701", [sighting("CMSC473", null, null)]],
      ]),
    });
    expect(file.courses).toEqual([
      [
        "CMSC473",
        "Capstone in Machine Learning",
        3,
        3,
        encodeTermBits([0, 1, 2]),
      ],
    ]);
  });

  it("drops terms that fell out of the window, and courses left with none", () => {
    const file = patchHistoryOffered(null, {
      recorded: ["201708", "202701"],
      reread: new Map([
        ["201708", [sighting("CMSC000")]],
        ["202701", [sighting("CMSC452")]],
      ]),
    });
    expect(file.terms).toEqual(["202701"]);
    expect(file.courses.map((c) => c[0])).toEqual(["CMSC452"]);
  });
});

describe("notOfferedMatches", () => {
  const file = patchHistoryOffered(null, {
    recorded: SEMESTERS,
    reread: new Map(
      SEMESTERS.map((t) => [
        t,
        [
          // Every fall: a fall-only course.
          ...(t.endsWith("08") ? [sighting("CMSC473", "Capstone in ML")] : []),
          sighting("CMSC351", "Algorithms"),
          // Gone since 2019.
          ...(t < "201908" ? [sighting("CMSC298X", "Old Topics")] : []),
        ],
      ]),
    ),
  });
  const read = readHistoryOffered(file);
  const inSpring = new Set(["CMSC351"]);

  it("keeps the matches the term doesn't have, in the search's order, with when they run", () => {
    const rows = notOfferedMatches({
      ranked: ["CMSC351", "CMSC473", "CMSC298X"],
      inTerm: (code) => inSpring.has(code),
      offered: read,
      recorded: file.terms,
      listed: new Set(["202701"]),
      now: "202701",
      termId: "202701",
      query: "cmsc",
    });
    // A course that stopped running isn't news for a loose search.
    expect(rows.map((r) => r.code)).toEqual(["CMSC473"]);
    expect(rows[0]).toMatchObject({
      code: "CMSC473",
      title: "Capstone in ML",
      words:
        "Not offered in Spring 2027 · Usually fall only · Next likely Fall 2027",
    });
  });

  it("says when a course that stopped running last ran, for its exact code", () => {
    const rows = notOfferedMatches({
      ranked: ["CMSC298X"],
      inTerm: () => false,
      offered: read,
      recorded: file.terms,
      listed: new Set(["202701"]),
      now: "202701",
      termId: "202701",
      query: "cmsc 298x",
    });
    expect(rows.map((r) => r.words)).toEqual([
      "Not offered in Spring 2027 · Last offered Spring 2019",
    ]);
  });

  it("names a listed term that has it as next, not as likely", () => {
    const [row] = notOfferedMatches({
      ranked: ["CMSC473"],
      inTerm: () => false,
      offered: read,
      recorded: file.terms,
      listed: new Set(["202608", "202701"]),
      now: "202701",
      termId: "202701",
      query: "CMSC473",
    });
    // Fall 2026 lists it, but it's before Spring 2027: next is Fall 2027.
    expect(row?.next).toEqual({ termId: "202708", likely: true });
    const [earlier] = notOfferedMatches({
      ranked: ["CMSC473"],
      inTerm: () => false,
      offered: read,
      recorded: file.terms,
      listed: new Set(["202608", "202701"]),
      now: "202701",
      termId: "202601",
      query: "CMSC473",
    });
    expect(earlier?.next).toEqual({ termId: "202608", likely: false });
    expect(earlier?.words).toBe(
      "Not offered in Spring 2026 · Usually fall only · Next Fall 2026",
    );
  });

  it("stops at the limit, and skips codes it has no record of", () => {
    expect(
      notOfferedMatches({
        ranked: ["CMSC999", "CMSC473", "CMSC298X"],
        inTerm: () => false,
        offered: read,
        recorded: file.terms,
        listed: new Set(),
        now: "202701",
        termId: "202701",
        query: "cmsc",
        limit: 1,
      }).map((r) => r.code),
    ).toEqual(["CMSC473"]);
  });
});
