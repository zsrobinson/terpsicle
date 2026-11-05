import { describe, expect, it } from "vitest";
import {
  aCourse,
  aGradeRecord,
  anInstructor,
  anUntimedMeeting,
  aPlanetTerpDept,
  aSection,
  aTbaMeeting,
  aTerm,
  aTimedMeeting,
  someCourseGrades,
} from "~/fixtures";
import { DEFAULT_TRAVEL_SETTINGS } from "../schema";
import type { HistoryDept } from "../schema/history";
import { EMPTY_CAMPUS } from "../travel";
import { courseOfferingFacts, likelihood, offeringView } from "./offering";
import { checkSchedule, messageText, scheduleWeek } from "./schedule";
import {
  defaultTerm,
  newestTerm,
  readTermInput,
  semestersAfter,
  termRef,
} from "./terms";
import {
  genEdWords,
  gradesByInstructor,
  gradesView,
  instructorRef,
  instructorWords,
  meetingText,
  sectionView,
  termSummary,
} from "./views";

// The MCP server's answers (docs/MCP.md), shaped from the published data.

describe("terms", () => {
  it("reads a term id or a name, any case, and nothing else", () => {
    expect(readTermInput("202708")).toBe("202708");
    expect(readTermInput(" Fall 2027 ")).toBe("202708");
    expect(readTermInput("winter 2027")).toBe("202612");
    expect(readTermInput("202703")).toBeNull();
    expect(readTermInput("next fall")).toBeNull();
  });

  it("names a term both ways", () => {
    expect(termRef("202612")).toEqual({ id: "202612", name: "Winter 2027" });
  });

  it("defaults to the newest active fall or spring, and knows the newest term", () => {
    const terms = [
      aTerm({ id: "202701", name: "Spring 2027" }),
      aTerm({ id: "202612", name: "Winter 2027", season: "winter" }),
      aTerm({ id: "202608", name: "Fall 2026", season: "fall" }),
    ];
    expect(defaultTerm(terms)?.id).toBe("202701");
    expect(newestTerm(terms)).toBe("202701");
    expect(defaultTerm([])).toBeNull();
    expect(newestTerm([])).toBeNull();
  });

  it("counts falls and springs forward from any season", () => {
    expect(semestersAfter("202701", 3)).toEqual(["202708", "202801", "202808"]);
    expect(semestersAfter("202708", 2)).toEqual(["202801", "202808"]);
    expect(semestersAfter("202612", 1)).toEqual(["202701"]);
    expect(semestersAfter("202605", 1)).toEqual(["202608"]);
  });
});

describe("views", () => {
  it("says a meeting as a person would read it", () => {
    expect(meetingText(aTimedMeeting())).toBe("MWF 10am–10:50am · IRB 0324");
    expect(
      meetingText(
        aTimedMeeting({ kind: "discussion", building: null, room: null }),
      ),
    ).toBe("MWF 10am–10:50am · room TBA · discussion");
    expect(meetingText(anUntimedMeeting())).toBe("Online, no set times");
    expect(meetingText(aTbaMeeting())).toBe(
      "Times TBA · ESJ 2101 · discussion",
    );
    expect(
      meetingText(aTimedMeeting({ online: true, building: null, room: null })),
    ).toBe("MWF 10am–10:50am · online");
  });

  it("joins an instructor to PlanetTerp, or says it couldn't", () => {
    const dept = aPlanetTerpDept({
      instructors: { brandt: anInstructor({ rating: 4.2345 }) },
    });
    expect(instructorRef("Ada Brandt", dept)).toEqual({
      name: "Ada Brandt",
      slug: "brandt",
      rating: 4.23,
      reviews: 61,
    });
    expect(instructorRef("Nobody Known", dept)).toEqual({
      name: "Nobody Known",
      slug: null,
      rating: null,
      reviews: 0,
    });
    expect(instructorWords(instructorRef("Ada Brandt", dept))).toBe(
      "Ada Brandt (4.2★, 61 reviews)",
    );
    expect(
      instructorWords({ name: "Jo", slug: "jo", rating: 5, reviews: 1 }),
    ).toBe("Jo (5.0★, 1 review)");
    expect(instructorWords(instructorRef("Nobody Known", dept))).toBe(
      "Nobody Known",
    );
  });

  it("gives a section its key, meetings, seats and dates", () => {
    const course = aCourse();
    const section = aSection({
      dates: { start: "2027-06-01", end: "2027-07-10" },
      restriction: "Restricted to majors.",
    });
    const view = sectionView(
      course,
      section,
      { "CMSC351-0101": [3, 40, 0, null] },
      aPlanetTerpDept(),
    );
    expect(view).toMatchObject({
      section: "0101",
      key: "CMSC351-0101",
      delivery: "in person",
      meetings: ["MWF 10am–10:50am · IRB 0324"],
      seats: { open: 3, total: 40, waitlist: 0, holdfile: null },
      restriction: "Restricted to majors.",
    });
    expect(view.dates).toMatch(/Jun/);
    expect(view.instructors[0]?.slug).toBe("brandt");
    const unknown = sectionView(course, aSection({ meetings: [] }), null, null);
    expect(unknown.seats).toBeNull();
    expect(unknown.dates).toBeNull();
    expect(unknown.meetings).toEqual([
      "Contact the department or instructor for times",
    ]);
  });

  it("names gen-eds with their options and conditions", () => {
    expect(
      genEdWords([
        [
          { code: "DSNL", condition: "if taken with GEOL110" },
          { code: "DSNS" },
        ],
        [{ code: "SCIS" }],
        [{ code: "ZZZZ" }],
      ]),
    ).toEqual([
      "DSNL (Natural Sciences Lab) if taken with GEOL110 or DSNS (Natural Sciences)",
      "SCIS (I-Series)",
      "ZZZZ",
    ]);
  });

  it("sums grades as PlanetTerp does, and ranks instructors by students", () => {
    const view = gradesView(aGradeRecord());
    expect(view.averageGpa).toBeGreaterThan(2.5);
    expect(view.averageGpa).toBeLessThan(3.5);
    expect(view.percentAOrB).toBeGreaterThan(50);
    expect(view.latestTerm).toEqual({ id: "202501", name: "Spring 2025" });
    const empty = gradesView(
      aGradeRecord({ counts: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }),
    );
    expect(empty).toMatchObject({
      averageGpa: null,
      percentAOrB: null,
      percentW: null,
      students: 0,
    });

    const grades = someCourseGrades({
      byInstructor: {
        brandt: aGradeRecord(),
        ghost: aGradeRecord({
          counts: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        }),
      },
    });
    const ranked = gradesByInstructor(grades, aPlanetTerpDept(), 5);
    expect(ranked.map((r) => r.slug)).toEqual(["brandt", "ghost"]);
    expect(ranked[1]?.name).toBe("ghost");
    expect(gradesByInstructor(grades, aPlanetTerpDept(), 1)).toHaveLength(1);
    expect(gradesByInstructor(undefined, null, 5)).toEqual([]);
  });

  it("sums a term's sections", () => {
    const course = aCourse({
      sections: [
        aSection({ code: "0101" }),
        aSection({ code: "0201", instructors: ["Bo Chen", "Ada Brandt"] }),
        aSection({ code: "0301" }),
      ],
    });
    const summary = termSummary(
      course,
      { "CMSC351-0101": [0, 40, 3, null], "CMSC351-0201": [5, 40, 0, null] },
      aPlanetTerpDept(),
    );
    expect(summary).toMatchObject({
      sections: 3,
      sectionsWithOpenSeats: 1,
      openSeats: 5,
    });
    expect(summary.instructors.map((i) => i.name)).toEqual([
      "Ada Brandt",
      "Bo Chen",
    ]);
    expect(termSummary(course, null, null)).toMatchObject({
      sectionsWithOpenSeats: null,
      openSeats: null,
    });
  });
});

/** CMSC474-like: every fall, never in spring, on record since Fall 2018. */
function fallOnly(): HistoryDept {
  const offerings = [];
  for (let year = 2018; year <= 2026; year++)
    offerings.push({
      termId: `${year}08`,
      source: "umdio" as const,
      instructors: ["Ada Brandt"],
      sections: [{ code: "0101", instructors: ["Ada Brandt"] }],
    });
  return {
    schemaVersion: 1,
    dept: "CMSC",
    courses: [
      { code: "CMSC474", title: "Game Theory", offerings: offerings.reverse() },
    ],
  };
}

function everyTerm(): Set<string> {
  const out = new Set<string>();
  for (let year = 2018; year <= 2027; year++) {
    out.add(`${year}01`);
    out.add(`${year}08`);
  }
  return out;
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

describe("schedule", () => {
  const algorithms = aCourse({
    sections: [
      aSection({ code: "0101" }),
      aSection({
        code: "0201",
        meetings: [aTimedMeeting({ start: 840, end: 890 })],
      }),
    ],
  });
  const compilers = aCourse({
    code: "CMSC430",
    title: "Compilers",
    credits: { min: 3, max: 4 },
    sections: [
      aSection({
        code: "0101",
        meetings: [
          aTimedMeeting({ days: ["M", "W"], start: 630, end: 690 }),
          aTimedMeeting({
            days: ["F"],
            start: 540,
            end: 590,
            kind: "discussion",
            building: "CSI",
            room: "1115",
          }),
        ],
      }),
    ],
  });
  const online = aCourse({
    code: "ENGL101",
    title: "Academic Writing",
    sections: [aSection({ code: "0101", meetings: [anUntimedMeeting()] })],
  });

  it("lays out the week and finds the overlap, with the switch that fixes it", () => {
    const check = checkSchedule({
      termId: "202701",
      courses: [algorithms, compilers, online],
      sections: ["CMSC351-0101", "CMSC430-0101", "ENGL101-0101"],
      seats: null,
      campus: EMPTY_CAMPUS,
      travel: DEFAULT_TRAVEL_SETTINGS,
      now: "2026-11-05T00:00:00.000Z",
    });
    expect(check.credits).toEqual({ min: 9, max: 10 });
    expect(check.week.M).toEqual([
      "10am–10:50am CMSC351 0101 · IRB 0324",
      "10:30am–11:30am CMSC430 0101 · IRB 0324",
    ]);
    expect(check.week.F?.[0]).toBe(
      "9am–9:50am CMSC430 0101 (discussion) · CSI 1115",
    );
    expect(check.week.Tu).toBeUndefined();
    expect(check.untimed).toEqual(["ENGL101 0101"]);
    const overlap = check.problems.find((p) => p.kind === "overlap");
    expect(overlap?.severity).toBe("warning");
    expect(overlap?.title).toContain("CMSC351");
    expect(overlap?.fix).toBe("Switch CMSC351 to 0201 (CMSC351-0201)");
    expect(check.problems.some((p) => p.kind === "no-set-times")).toBe(true);
  });

  it("leaves out keys the courses don't have", () => {
    const week = scheduleWeek([]);
    expect(week).toEqual({
      credits: { min: 0, max: 0 },
      week: {},
      untimed: [],
    });
    const check = checkSchedule({
      termId: "202701",
      courses: [algorithms],
      sections: ["CMSC351-0999"],
      seats: null,
      campus: EMPTY_CAMPUS,
      travel: DEFAULT_TRAVEL_SETTINGS,
      now: "2026-11-05T00:00:00.000Z",
    });
    expect(check.problems).toEqual([]);
  });

  it("writes every kind of message part as text", () => {
    expect(
      messageText([
        { kind: "text", text: "From " },
        { kind: "course", courseCode: "CMSC351" },
        { kind: "text", text: " " },
        { kind: "section", sectionKey: "CMSC351-0101" },
        { kind: "text", text: " on " },
        { kind: "day", day: "Th" },
        { kind: "text", text: " at " },
        { kind: "time", minutes: 570 },
        { kind: "text", text: ", " },
        { kind: "duration", minutes: 75 },
        { kind: "text", text: ", " },
        { kind: "block", blockId: "block-0001", label: "Work" },
      ]),
    ).toBe(
      "From CMSC351 CMSC351 0101 on Thursday at 9:30am, 1 hr 15 min, Work",
    );
  });
});
