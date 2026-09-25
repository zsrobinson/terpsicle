import { describe, expect, it } from "vitest";
import {
  aCourse,
  aGenerateRequest,
  aMeeting,
  anUntimedMeeting,
  aSection,
  fixtureTermId,
} from "~/fixtures";
import { buildCatalogIndex } from "../catalog/catalog-index";
import { DEFAULT_TRAVEL_SETTINGS, type GenItem } from "../schema";
import { campusMap } from "../travel/campus";
import { decodeRoutes, encodeRoutes } from "../travel/routes-binary";
import {
  chosenCourses,
  differencesFrom,
  freeWeekdays,
  hasChoices,
} from "./describe";
import { generatePlans } from "./generate";
import { mergeSameWeek } from "./merge";

// ENGL101 as it is in Spring 2027: the same time in several rooms, and
// hybrid sections that meet on different days at the same hour.
const engl = aCourse({
  code: "ENGL101",
  sections: [
    aSection({
      code: "0301",
      meetings: [
        aMeeting({
          days: ["M", "W", "F"],
          start: 660,
          end: 710,
          building: "TWS",
        }),
      ],
    }),
    aSection({
      code: "0302",
      meetings: [
        aMeeting({
          days: ["M", "W", "F"],
          start: 660,
          end: 710,
          building: "KEY",
        }),
      ],
    }),
    aSection({
      code: "0303",
      meetings: [
        aMeeting({
          days: ["M", "W", "F"],
          start: 660,
          end: 710,
          building: "JMZ",
        }),
      ],
    }),
    aSection({
      code: "9012",
      meetings: [
        aMeeting({ days: ["M", "W"], start: 660, end: 710, building: "TWS" }),
        anUntimedMeeting(),
      ],
    }),
  ],
});
const cmsc = aCourse({
  code: "CMSC131",
  sections: [
    aSection({
      code: "0101",
      meetings: [
        aMeeting({ days: ["Tu", "Th"], start: 540, end: 615, building: "IRB" }),
      ],
    }),
  ],
});
const psyc = aCourse({
  code: "PSYC100",
  sections: [
    aSection({
      code: "0101",
      meetings: [
        aMeeting({ days: ["Tu"], start: 780, end: 830, building: "BPS" }),
      ],
    }),
  ],
});
const socy = aCourse({
  code: "SOCY100",
  sections: [
    aSection({
      code: "0101",
      meetings: [
        aMeeting({ days: ["Th"], start: 780, end: 830, building: "ASY" }),
      ],
    }),
  ],
});
const index = buildCatalogIndex(fixtureTermId, [engl, cmsc, psyc, socy]);

// Every pair of buildings a short walk apart, so travel never rules anything out.
const BUILDINGS = ["TWS", "KEY", "JMZ", "IRB", "BPS", "ASY"];
const campus = campusMap(
  decodeRoutes(encodeRoutes({ buildings: BUILDINGS, distance: () => 200 })),
  null,
);

const items: GenItem[] = [
  { kind: "course", courseCode: "ENGL101", required: true },
  { kind: "course", courseCode: "CMSC131", required: true },
  {
    kind: "pick",
    id: "dshs",
    count: 1,
    courses: [{ courseCode: "PSYC100" }, { courseCode: "SOCY100" }],
  },
];

describe("merging results with the same week", () => {
  it("folds sections at the same times in other rooms into one result", () => {
    const { results } = generatePlans(
      aGenerateRequest({ items, travel: DEFAULT_TRAVEL_SETTINGS }),
      { index, seats: null, campus, quality: new Map() },
    );
    // Two ENGL101 weeks (MWF, or MW + online) × two DSHS choices.
    expect(results).toHaveLength(4);
    const mwf = results.find((r) => r.sections.includes("ENGL101-0301"));
    expect(mwf?.equivalents).toEqual({
      count: 3,
      byCourse: [
        { courseCode: "ENGL101", sectionCodes: ["0301", "0302", "0303"] },
      ],
    });
  });

  it("keeps the first of a group and the order", () => {
    const plan = (sections: string[]) => ({
      id: sections.join(","),
      sections,
      skipped: [],
      score: 1,
      breakdown: {
        compact: 1,
        "fewer-days": 1,
        "later-starts": 1,
        "best-rated": 1,
        "higher-gpa": 1,
        "safest-seats": 1,
      },
      stats: {
        credits: 3,
        daysOnCampus: 3,
        firstClass: 660,
        lastClass: 710,
        avgRating: null,
        avgGpa: null,
        fewestOpenSeats: null,
      },
      equivalents: { count: 1, byCourse: [] },
    });
    const merged = mergeSameWeek(
      [plan(["ENGL101-0302"]), plan(["ENGL101-9012"]), plan(["ENGL101-0303"])],
      index,
    );
    expect(merged.map((r) => r.id)).toEqual(["ENGL101-0302", "ENGL101-9012"]);
    expect(merged[0]?.equivalents.count).toBe(2);
  });
});

describe("describing a result", () => {
  it("names the free weekdays", () => {
    expect(
      freeWeekdays({ sections: ["ENGL101-9012", "CMSC131-0101"] }, index),
    ).toEqual(["F"]);
  });

  it("lists the pick-N and optional courses a result includes", () => {
    expect(hasChoices(items)).toBe(true);
    expect(hasChoices(items.slice(0, 2))).toBe(false);
    expect(
      chosenCourses(
        { sections: ["ENGL101-0301", "CMSC131-0101", "SOCY100-0101"] },
        [...items, { kind: "course", courseCode: "CMSC131", required: false }],
      ),
    ).toEqual(["SOCY100", "CMSC131"]);
  });

  it("says where a result differs from the top one", () => {
    expect(
      differencesFrom(
        { sections: ["ENGL101-9012", "CMSC131-0101", "SOCY100-0101"] },
        { sections: ["ENGL101-0301", "CMSC131-0101", "PSYC100-0101"] },
        index,
      ),
    ).toEqual([
      {
        courseCode: "ENGL101",
        sectionCode: "9012",
        days: "MW",
        onlineDays: "",
        start: 660,
      },
      {
        courseCode: "SOCY100",
        sectionCode: "0101",
        days: "Th",
        onlineDays: "",
        start: 780,
      },
    ]);
  });
});
