import { describe, expect, it } from "vitest";
import {
  aBlock,
  aCourse,
  aMeeting,
  anUntimedMeeting,
  aPlan,
  aPlanCourse,
  aSavedCourse,
  aSection,
  snapshotOf,
} from "~/fixtures";
import { buildCatalogIndex } from "../catalog/catalog-index";
import {
  type Course,
  DEFAULT_TRAVEL_SETTINGS,
  type PlanCourse,
} from "../schema";
import { campusMap, EMPTY_CAMPUS } from "../travel/campus";
import { decodeRoutes, encodeRoutes } from "../travel/routes-binary";
import {
  buildFitContext,
  countFittingSections,
  courseFitsPlan,
  evaluateFit,
  type FitInput,
  fitLabel,
  sectionFits,
  sectionMask,
} from "./fit";

/** A plan course placed in one of `course`'s sections, snapshotted as it is now. */
function placed(course: Course, sectionCode: string): PlanCourse {
  const section = course.sections.find((s) => s.code === sectionCode);
  if (!section) throw new Error(`${course.code} has no section ${sectionCode}`);
  return aPlanCourse({
    courseCode: course.code,
    sectionCode,
    snapshot: snapshotOf(section),
  });
}

const TERM = "202701";

const routes = decodeRoutes(
  encodeRoutes({
    buildings: ["IRB", "ESJ", "KEY"],
    // IRB–KEY is a long walk (12 min typical); everything else is 3 min.
    distance: (_m, a, b) =>
      a + b === "IRBKEY" || a + b === "KEYIRB" ? 3000 : 700,
  }),
);

/** CMSC330 MWF 10:00–10:50 in IRB, placed. */
const cmsc330 = aCourse({
  code: "CMSC330",
  sections: [
    aSection({
      code: "0101",
      meetings: [aMeeting({ start: 600, end: 650, building: "IRB" })],
    }),
    aSection({
      code: "0201",
      meetings: [aMeeting({ days: ["Tu", "Th"], start: 600, end: 675 })],
    }),
  ],
});

/** CMSC351: one section for every fit outcome. */
const cmsc351 = aCourse({
  code: "CMSC351",
  sections: [
    aSection({
      code: "0101",
      meetings: [aMeeting({ start: 630, end: 680, building: "ESJ" })],
    }), // overlaps 330
    aSection({
      code: "0201",
      meetings: [aMeeting({ start: 655, end: 705, building: "KEY" })],
    }), // 5 min after 330, far
    aSection({
      code: "0301",
      meetings: [aMeeting({ start: 540, end: 595, building: "KEY" })],
    }), // 5 min before 330, far
    aSection({
      code: "0401",
      meetings: [aMeeting({ start: 660, end: 710, building: "ESJ" })],
    }), // fits
    aSection({
      code: "0501",
      meetings: [aMeeting({ start: 750, end: 800, building: "ESJ" })],
    }), // lunch block
    aSection({
      code: "0601",
      delivery: "online-async",
      meetings: [anUntimedMeeting()],
    }), // no set times
  ],
});

const english = aCourse({
  code: "ENGL393",
  sections: [aSection({ meetings: [] })],
});

function input(
  courses: Course[],
  plan = aPlan({ termId: TERM, courses: [placed(cmsc330, "0101")] }),
): FitInput {
  return {
    plan,
    index: buildCatalogIndex(TERM, courses),
    blocks: [
      aBlock({
        termId: TERM,
        id: "block-lunch",
        label: "Lunch",
        start: 720,
        end: 780,
      }),
    ],
    travel: DEFAULT_TRAVEL_SETTINGS,
    campus: campusMap(routes, null),
  };
}

const section = (code: string) => {
  const s = cmsc351.sections.find((x) => x.code === code);
  if (!s) throw new Error(code);
  return s;
};

describe("fitLabel", () => {
  const ctx = buildFitContext(input([cmsc330, cmsc351, english]));

  it.each([
    [
      "0101",
      { kind: "overlaps", with: { kind: "course", courseCode: "CMSC330" } },
    ],
    [
      "0201",
      { kind: "not-enough-time", direction: "after", courseCode: "CMSC330" },
    ],
    [
      "0301",
      { kind: "not-enough-time", direction: "before", courseCode: "CMSC330" },
    ],
    ["0401", { kind: "fits" }],
    [
      "0501",
      {
        kind: "overlaps",
        with: { kind: "block", blockId: "block-lunch", label: "Lunch" },
      },
    ],
    ["0601", { kind: "no-set-times" }],
  ])("CMSC351 %s", (code, label) => {
    expect(fitLabel(ctx, cmsc351, section(code))).toEqual(label);
  });

  it("says in-plan for the placed section, and fits it against the rest", () => {
    // biome-ignore lint/style/noNonNullAssertion: the builder above has it
    const current = cmsc330.sections[0]!;
    expect(fitLabel(ctx, cmsc330, current)).toEqual({ kind: "in-plan" });
    expect(evaluateFit(ctx, cmsc330, current)).toEqual({ kind: "fits" });
    // biome-ignore lint/style/noNonNullAssertion: the builder above has it
    expect(fitLabel(ctx, cmsc330, cmsc330.sections[1]!)).toEqual({
      kind: "fits",
    });
  });

  it("never rules a section out for travel before routes load", () => {
    const noRoutes = buildFitContext({
      ...input([cmsc330, cmsc351]),
      campus: EMPTY_CAMPUS,
    });
    expect(fitLabel(noRoutes, cmsc351, section("0201"))).toEqual({
      kind: "fits",
    });
  });

  it("treats a saved-for-later course as not in the plan", () => {
    const plan = aPlan({
      termId: TERM,
      courses: [aSavedCourse("CMSC330"), placed(cmsc351, "0401")],
    });
    const c = buildFitContext(input([cmsc330, cmsc351], plan));
    // biome-ignore lint/style/noNonNullAssertion: the builder above has it
    expect(fitLabel(c, cmsc330, cmsc330.sections[0]!)).toEqual({
      kind: "fits",
    });
  });

  it("allows tight connections", () => {
    const tight = aCourse({
      code: "MATH240",
      sections: [
        aSection({
          meetings: [aMeeting({ start: 654, end: 700, building: "ESJ" })],
        }),
      ],
    });
    const c = buildFitContext(input([cmsc330, tight]));
    // 700 ft is 3 min; 4 min gap → tight, still fits.
    // biome-ignore lint/style/noNonNullAssertion: one section
    expect(fitLabel(c, tight, tight.sections[0]!)).toEqual({ kind: "fits" });
  });

  it("ignores overlaps across date ranges that don't meet", () => {
    const firstHalf = aPlan({
      termId: TERM,
      courses: [placed(cmsc330, "0101")],
    });
    const halfCourse = aCourse({
      code: "BMGT110",
      sections: [
        aSection({
          meetings: [aMeeting({ start: 600, end: 650 })],
          dates: { start: "2027-03-22", end: "2027-05-10" },
        } as never),
      ],
    });
    const halfPlanned = aCourse({
      code: "CMSC330",
      sections: [
        aSection({
          code: "0101",
          meetings: [aMeeting({ start: 600, end: 650 })],
          dates: { start: "2027-01-25", end: "2027-03-12" },
        } as never),
      ],
    });
    const c = buildFitContext(input([halfPlanned, halfCourse], firstHalf));
    // biome-ignore lint/style/noNonNullAssertion: one section
    expect(fitLabel(c, halfCourse, halfCourse.sections[0]!)).toEqual({
      kind: "fits",
    });
  });

  it("checks exact minutes when times aren't on 5-minute slots", () => {
    const odd = aCourse({
      code: "MATH240",
      sections: [
        aSection({
          meetings: [aMeeting({ start: 651, end: 698, building: "IRB" })],
        }),
      ],
    });
    const c = buildFitContext(input([cmsc330, odd]));
    // biome-ignore lint/style/noNonNullAssertion: one section
    expect(fitLabel(c, odd, odd.sections[0]!)).toEqual({ kind: "fits" });
  });
});

describe("counts and the search filter", () => {
  it("counts fitting sections", () => {
    const ctx = buildFitContext(input([cmsc330, cmsc351]));
    expect(countFittingSections(ctx, cmsc351)).toBe(2); // 0401 and 0601
    expect(sectionFits(ctx, cmsc351, section("0101"))).toBe(false);
    expect(courseFitsPlan(ctx, cmsc351)).toBe(true);
  });

  it("says a course doesn't fit when every section clashes", () => {
    const clash = aCourse({
      code: "MATH240",
      sections: [aSection({ meetings: [aMeeting({ start: 600, end: 650 })] })],
    });
    const ctx = buildFitContext(input([cmsc330, clash]));
    expect(courseFitsPlan(ctx, clash)).toBe(false);
  });

  it("memoizes a section's mask", () => {
    const s = section("0401");
    expect(sectionMask("CMSC351", s)).toBe(sectionMask("CMSC351", s));
  });
});
