import { describe, expect, it } from "vitest";
import { aHistoryDept, everyFall, semestersOnRecord } from "~/fixtures";
import type { HistoryDept } from "../schema/history";
import { courseOfferingFacts, likelihood, offeringView } from "./offering";

// When a course runs, as the MCP server answers it (docs/MCP.md): the
// offering pattern read as Plan reads it.

/** CMSC474-like: every fall since 2018, never in spring. */
function fallOnly(): HistoryDept {
  return aHistoryDept({
    courses: [
      {
        code: "CMSC474",
        title: "Game Theory",
        offerings: everyFall(2018, 2026, { source: "umdio" }),
      },
    ],
  });
}

/** Every fall and spring from Fall 2018 through Spring 2027. */
function everyTerm(): Set<string> {
  return new Set(semestersOnRecord(2018));
}

describe("offering", () => {
  const input = {
    codes: ["CMSC474"],
    history: new Map([["CMSC", fallOnly()]]),
    historyTerms: everyTerm(),
    indexOffered: new Map([["CMSC474", ["202608"]]]),
    listed: new Set(["202608", "202701"]),
    now: "202701",
  };

  it("reads a fall-only course from the history and the listed terms", () => {
    const facts = courseOfferingFacts(input);
    expect(facts.summary.pattern).toEqual({
      kind: "once-a-year",
      season: "fall",
    });
    expect(likelihood(facts, "202608")).toBe("yes");
    expect(likelihood(facts, "202701")).toBe("no");
    expect(likelihood(facts, "202708")).toBe("likely");
    expect(likelihood(facts, "202801")).toBe("unlikely");

    const view = offeringView(facts, "202701");
    expect(view.usually).toBe("Fall only");
    expect(view.pattern).toBe("once-a-year (fall)");
    expect(view.next).toEqual({
      id: "202708",
      name: "Fall 2027",
      certainty: "likely",
    });
    expect(view.lastOffered?.name).toBe("Fall 2026");
    expect(view.recent.offered[0]).toBe("Fall 2026");
    expect(view.recent.notOffered[0]).toBe("Spring 2027");
    expect(view.recent.notOnRecord).toEqual([]);
  });

  it("counts a term no source has as unknown, never as not offered", () => {
    const historyTerms = everyTerm();
    historyTerms.delete("202101");
    const view = offeringView(
      courseOfferingFacts({ ...input, historyTerms }),
      "202701",
    );
    expect(view.recent.notOnRecord).toEqual(["Spring 2021"]);
    expect(view.recent.notOffered).not.toContain("Spring 2021");
  });

  it("merges cross-listings, and has nothing to say with no record", () => {
    const facts = courseOfferingFacts({
      ...input,
      codes: ["MATH474", "CMSC474"],
    });
    expect(facts.offered.has("202508")).toBe(true);
    const none = courseOfferingFacts({
      ...input,
      codes: ["CMSC999"],
      indexOffered: new Map(),
    });
    expect(offeringView(none, "202701").usually).toBe(
      "Not enough history to tell",
    );
    expect(offeringView(none, "202701").lastOffered).toBeNull();
  });

  it("puts each pattern in words an agent can branch on", () => {
    const words = (pattern: Parameters<typeof wordsOf>[0]) => wordsOf(pattern);
    expect(
      words({ kind: "alternate-years", season: "spring", parity: "odd" }),
    ).toBe("alternate-years (spring, odd years)");
    expect(words({ kind: "summer-or-winter", seasons: ["summer"] })).toBe(
      "summer-or-winter (summer)",
    );
    expect(words({ kind: "irregular", lean: null })).toBe("irregular");
    expect(words({ kind: "irregular", lean: "fall" })).toBe(
      "irregular (leans fall)",
    );
    expect(words({ kind: "discontinued", last: "202101" })).toBe(
      "discontinued (last Spring 2021)",
    );
    expect(words({ kind: "leans", season: "spring" })).toBe("leans (spring)");
    expect(words({ kind: "rare" })).toBe("rare");
  });
});

/** offeringView's `pattern` for one pattern, through a stub summary. */
function wordsOf(
  pattern: ReturnType<typeof courseOfferingFacts>["summary"]["pattern"],
): string {
  const facts = courseOfferingFacts({
    codes: [],
    history: new Map(),
    historyTerms: new Set(),
    indexOffered: new Map(),
    listed: new Set(),
    now: "202701",
  });
  return offeringView(
    { ...facts, summary: { ...facts.summary, pattern } },
    "202701",
  ).pattern;
}
