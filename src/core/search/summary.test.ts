import { describe, expect, it } from "vitest";
import {
  aCourse,
  anUntimedMeeting,
  aPlan,
  aPlanCourse,
  aSection,
  aTimedMeeting,
  snapshotOf,
} from "~/fixtures";
import { buildCatalogIndex } from "../catalog/catalog-index";
import { buildFitContext } from "../fit/fit";
import { type Course, DEFAULT_TRAVEL_SETTINGS } from "../schema";
import { EMPTY_CAMPUS } from "../travel/campus";
import {
  resultFitWords,
  resultSummary,
  sectionCountWords,
  sectionWhen,
} from "./summary";

const TERM = "202701";

/** A fit context for a plan holding `placed` in its first section. */
function fitWith(placed: Course, ...others: Course[]) {
  const section = placed.sections[0];
  if (!section) throw new Error("no section");
  return buildFitContext({
    plan: aPlan({
      termId: TERM,
      courses: [
        aPlanCourse({
          courseCode: placed.code,
          sectionCode: section.code,
          snapshot: snapshotOf(section),
        }),
      ],
    }),
    index: buildCatalogIndex(TERM, [placed, ...others]),
    blocks: [],
    travel: DEFAULT_TRAVEL_SETTINGS,
    campus: EMPTY_CAMPUS,
  });
}

describe("resultSummary", () => {
  // In the plan: CMSC330, MWF 10am.
  const cmsc330 = aCourse({ code: "CMSC330" });

  it("says when a one-section course meets, and whether it fits (SOCY411)", () => {
    const socy411 = aCourse({
      code: "SOCY411",
      sections: [
        aSection({
          meetings: [
            aTimedMeeting({ days: ["Tu", "Th"], start: 750, end: 825 }),
          ],
        }),
      ],
    });
    const summary = resultSummary(socy411, fitWith(cmsc330, socy411));
    expect(summary).toEqual({
      kind: "one",
      when: "TuTh 12:30pm–1:45pm",
      fit: { kind: "fits" },
    });
    expect(resultSummary(socy411, null)).toMatchObject({ fit: null });
  });

  it("names what a one-section course overlaps", () => {
    const clash = aCourse({ code: "SOCY412" });
    const summary = resultSummary(clash, fitWith(cmsc330, clash));
    expect(summary.kind === "one" && summary.fit).toMatchObject({
      kind: "overlaps",
    });
    if (summary.kind === "one" && summary.fit)
      expect(resultFitWords(summary.fit)).toBe("Overlaps CMSC330");
  });

  it("counts sections, and those that fit, from two on (CMSC330, ENGL101)", () => {
    const few = aCourse({
      code: "STAT400",
      sections: [
        aSection({ code: "0101" }),
        aSection({
          code: "0201",
          meetings: [aTimedMeeting({ days: ["Tu"] })],
        }),
      ],
    });
    expect(resultSummary(few, fitWith(cmsc330, few))).toEqual({
      kind: "some",
      sections: 2,
      fit: 1,
    });
    expect(resultSummary(few, null)).toEqual({
      kind: "some",
      sections: 2,
      fit: null,
    });
    expect(resultSummary(aCourse({ sections: [] }), null)).toEqual({
      kind: "none",
    });
  });
});

describe("words", () => {
  it("reads section counts plainly", () => {
    expect(sectionCountWords(4, 2)).toBe("4 sections · 2 fit");
    expect(sectionCountWords(92, 0)).toBe("92 sections · none fit");
    expect(sectionCountWords(3, null)).toBe("3 sections");
  });

  it("gives a meeting line with every meeting, no rooms", () => {
    expect(
      sectionWhen(
        aSection({
          meetings: [
            aTimedMeeting({ days: ["M", "W"], start: 600, end: 650 }),
            aTimedMeeting({
              days: ["F"],
              start: 540,
              end: 590,
              kind: "discussion",
            }),
          ],
        }),
      ),
    ).toBe("MW 10am–10:50am · F 9am–9:50am");
    expect(
      sectionWhen(
        aSection({ delivery: "online-async", meetings: [anUntimedMeeting()] }),
      ),
    ).toBe("Online, no set times");
    expect(
      sectionWhen(
        aSection({ delivery: "f2f", meetings: [anUntimedMeeting()] }),
      ),
    ).toBe("Times TBA");
    expect(sectionWhen(aSection({ meetings: [] }))).toBe(
      "Contact the department for times",
    );
  });

  it("leaves fit words out where the row already says it", () => {
    expect(resultFitWords({ kind: "fits" })).toBe("Fits");
    expect(resultFitWords({ kind: "in-plan" })).toBeNull();
    expect(resultFitWords({ kind: "no-set-times" })).toBeNull();
    expect(
      resultFitWords({
        kind: "not-enough-time",
        direction: "after",
        courseCode: "CMSC330",
      }),
    ).toBe("Not enough time after CMSC330");
  });
});
