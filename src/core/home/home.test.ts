import { describe, expect, it } from "vitest";
import {
  aFourYear,
  aFourYearCreditEntry,
  aFourYearEntry,
  aFourYearWildcardEntry,
  anUntimedMeeting,
  aPlan,
  aPlanCourse,
  aPublishedCalendar,
  aSectionSnapshot,
  aTimedMeeting,
} from "~/fixtures";
import { GEN_ED_REQUIREMENTS, type GenEdProgress } from "../four-year/gen-ed";
import {
  type ChatUnreadRoom,
  DEFAULT_TRAVEL_SETTINGS,
  type SeatWatch,
  type SectionSnapshot,
} from "../schema";
import { campusMap, EMPTY_CAMPUS } from "../travel/campus";
import { decodeRoutes, encodeRoutes } from "../travel/routes-binary";
import {
  fourYearDepts,
  genEdsCovered,
  greeting,
  openWatches,
  planDepts,
  planLine,
  seatsOpenWords,
  unreadByCourse,
} from "./summary";
import {
  classesLeft,
  classesOn,
  classPlaceWords,
  isUnderWay,
  type TodayWalk,
  walkWords,
} from "./today";

const travel = DEFAULT_TRAVEL_SETTINGS;

/** IRB ↔ ESJ is 2,000 ft: 8 minutes at a typical pace, tight in a 10-minute gap. */
const campus = campusMap(
  decodeRoutes(
    encodeRoutes({
      buildings: ["IRB", "ESJ"],
      distance: (_mode, from, to) => (from === to ? 0 : 2000),
    }),
  ),
  { offCampus: [] },
);

/** A placed course whose section meets at these times. */
function placed(
  courseCode: string,
  meetings: SectionSnapshot["meetings"],
  extra: Partial<SectionSnapshot> = {},
) {
  return aPlanCourse({
    courseCode,
    sectionCode: "0101",
    snapshot: aSectionSnapshot({ meetings, ...extra }),
  });
}

// 2027-02-03 is a Wednesday in Spring 2027's classes.
const WEDNESDAY = "2027-02-03";

describe("classesOn", () => {
  const plan = aPlan({
    courses: [
      placed("CMSC351", [aTimedMeeting({ start: 600, end: 650 })]),
      placed("MATH240", [
        aTimedMeeting({
          days: ["M", "W"],
          start: 660,
          end: 710,
          building: "ESJ",
          room: "0202",
        }),
      ]),
      placed("ENGL101", [
        aTimedMeeting({ days: ["Tu", "Th"], start: 540, end: 615 }),
      ]),
      // Saved for later: nothing to attend.
      aPlanCourse({ courseCode: "MUSC130", sectionCode: null, snapshot: null }),
      // Online with no set time: never on the day's list.
      placed("HIST200", [anUntimedMeeting()]),
    ],
  });

  it("lists the day's classes by time, with the walk between buildings", () => {
    const day = classesOn(
      plan,
      WEDNESDAY,
      aPublishedCalendar(),
      travel,
      campus,
    );
    expect(day.kind).toBe("classes");
    if (day.kind !== "classes") return;
    expect(day.classes.map((c) => c.courseCode)).toEqual([
      "CMSC351",
      "MATH240",
    ]);
    expect(day.classes[0]?.walk).toBeNull();
    expect(day.classes[1]).toMatchObject({
      sectionKey: "MATH240-0101",
      sectionCode: "0101",
      building: "ESJ",
      room: "0202",
      walk: { from: "IRB", minutes: 8, gapMinutes: 10, verdict: "tight" },
    });
  });

  it("gives no walk time until the routes file loads", () => {
    const day = classesOn(plan, WEDNESDAY, null, travel, EMPTY_CAMPUS);
    if (day.kind !== "classes") throw new Error("expected classes");
    expect(day.classes[1]?.walk).toMatchObject({
      minutes: null,
      verdict: "unknown",
    });
  });

  it("has no walk between two classes in one building", () => {
    const same = aPlan({
      courses: [
        placed("CMSC351", [aTimedMeeting({ start: 600, end: 650 })]),
        placed("CMSC330", [aTimedMeeting({ start: 660, end: 710 })]),
      ],
    });
    const day = classesOn(same, WEDNESDAY, null, travel, campus);
    if (day.kind !== "classes") throw new Error("expected classes");
    expect(day.classes.map((c) => c.walk)).toEqual([null, null]);
  });

  it("says nothing meets on a weekend, a break, or outside the term", () => {
    expect(
      classesOn(plan, "2027-02-06", aPublishedCalendar(), travel, campus),
    ).toEqual({ kind: "none" });
    expect(
      classesOn(plan, "2027-03-17", aPublishedCalendar(), travel, campus),
    ).toEqual({ kind: "break", name: "Spring Break" });
    expect(
      classesOn(plan, "2027-05-19", aPublishedCalendar(), travel, campus),
    ).toEqual({ kind: "none" });
  });

  it("reads the weekday alone without a published calendar", () => {
    const day = classesOn(plan, "2027-05-19", null, travel, campus);
    expect(day.kind).toBe("classes");
  });

  it("leaves out a section outside its own dates", () => {
    const half = aPlan({
      courses: [
        placed("CMSC351", [aTimedMeeting()], {
          dates: { start: "2027-03-22", end: "2027-05-11" },
        }),
      ],
    });
    expect(classesOn(half, WEDNESDAY, null, travel, campus)).toEqual({
      kind: "none",
    });
  });
});

describe("classesLeft and isUnderWay", () => {
  const day = classesOn(
    aPlan({
      courses: [
        placed("CMSC351", [aTimedMeeting({ start: 600, end: 650 })]),
        placed("CMSC330", [aTimedMeeting({ start: 660, end: 710 })]),
      ],
    }),
    WEDNESDAY,
    null,
    travel,
    campus,
  );
  const classes = day.kind === "classes" ? day.classes : [];

  it("drops classes that have ended and keeps the one under way", () => {
    expect(classesLeft(classes, 620).map((c) => c.courseCode)).toEqual([
      "CMSC351",
      "CMSC330",
    ]);
    expect(classesLeft(classes, 650).map((c) => c.courseCode)).toEqual([
      "CMSC330",
    ]);
    expect(classesLeft(classes, 720)).toEqual([]);
  });

  it("is under way from its start until its end", () => {
    const first = { start: 600, end: 650 };
    expect(isUnderWay(first, 599)).toBe(false);
    expect(isUnderWay(first, 600)).toBe(true);
    expect(isUnderWay(first, 650)).toBe(false);
  });
});

describe("words", () => {
  it("names the place", () => {
    expect(
      classPlaceWords({ building: "ESJ", room: "0202", online: false }),
    ).toBe("ESJ 0202");
    expect(
      classPlaceWords({ building: "ESJ", room: null, online: false }),
    ).toBe("ESJ");
    expect(classPlaceWords({ building: null, room: null, online: true })).toBe(
      "Online",
    );
    expect(
      classPlaceWords({ building: null, room: null, online: false }),
    ).toBeNull();
  });

  it("puts the walk in a few words, never alarming", () => {
    const walk = (over: Partial<TodayWalk>): TodayWalk => ({
      from: "IRB",
      minutes: 6,
      gapMinutes: 15,
      verdict: "ok",
      ...over,
    });
    expect(walkWords(walk({}))).toBe("6 min walk from IRB");
    expect(walkWords(walk({ verdict: "tight" }))).toBe(
      "Tight: 6 min walk from IRB",
    );
    expect(
      walkWords(walk({ minutes: 18, gapMinutes: 10, verdict: "insufficient" })),
    ).toBe("Not enough time: 18 min walk from IRB, 10 min between");
    expect(walkWords(walk({ minutes: null, verdict: "unknown" }))).toBe(
      "From IRB",
    );
    expect(walkWords(walk({ verdict: "no-route" }))).toBe(
      "No route on UMD's map from IRB",
    );
  });

  it("greets by the time of day", () => {
    expect(greeting(0)).toBe("Good morning");
    expect(greeting(11 * 60 + 59)).toBe("Good morning");
    expect(greeting(12 * 60)).toBe("Good afternoon");
    expect(greeting(17 * 60)).toBe("Good evening");
  });

  it("says what a plan holds", () => {
    expect(planLine({ courses: [] })).toBe("No courses yet");
    expect(planLine({ courses: [aPlanCourse()] })).toBe("1 course");
    expect(
      planLine({
        courses: [aPlanCourse(), aPlanCourse({ courseCode: "MATH240" })],
        registered: ["CMSC351-0101"],
      }),
    ).toBe("2 courses · 1 registered");
    expect(
      planLine(
        {
          courses: [aPlanCourse(), aPlanCourse({ courseCode: "MATH240" })],
          registered: ["CMSC351-0101"],
        },
        "7 credits",
      ),
    ).toBe("2 courses · 7 credits · 1 registered");
    expect(planLine({ courses: [] }, "0 credits")).toBe("No courses yet");
    expect(seatsOpenWords(1)).toBe("1 seat open");
    expect(seatsOpenWords(3)).toBe("3 seats open");
  });
});

describe("unreadByCourse", () => {
  const room = (over: Partial<ChatUnreadRoom>): ChatUnreadRoom => ({
    room: "202608:CMSC351",
    courseCode: "CMSC351",
    lastSeq: 4,
    unread: 1,
    lastMessageAt: "2026-09-28T12:00:00Z",
    muted: false,
    ...over,
  });

  it("adds up a course's rooms, opens its newest, and skips muted or read ones", () => {
    expect(
      unreadByCourse([
        room({ unread: 2 }),
        room({
          room: "202608:CMSC351:0101",
          unread: 3,
          lastMessageAt: "2026-09-28T13:00:00Z",
        }),
        room({
          room: "202608:MATH240",
          courseCode: "MATH240",
          unread: 5,
          muted: true,
        }),
        room({ room: "202608:ENGL101", courseCode: "ENGL101", unread: 0 }),
        room({
          room: "202608:HIST200",
          courseCode: "HIST200",
          unread: 1,
          lastMessageAt: "2026-09-28T14:00:00Z",
        }),
      ]),
    ).toEqual([
      {
        courseCode: "HIST200",
        unread: 1,
        room: "202608:HIST200",
        lastMessageAt: "2026-09-28T14:00:00Z",
      },
      {
        courseCode: "CMSC351",
        unread: 5,
        room: "202608:CMSC351:0101",
        lastMessageAt: "2026-09-28T13:00:00Z",
      },
    ]);
  });
});

describe("openWatches", () => {
  const watch = (sectionKey: string, termId = "202701"): SeatWatch => ({
    termId,
    sectionKey,
    createdAt: "2026-09-20T12:00:00Z",
    lastNotifiedAt: null,
  });

  it("lists this term's watched sections with a seat open", () => {
    expect(
      openWatches(
        [
          watch("MATH240-0201"),
          watch("CMSC351-0101"),
          watch("CMSC330-0101"),
          watch("ENGL101-0101", "202608"),
        ],
        "202701",
        {
          "CMSC351-0101": [2, 40, 0, null],
          "MATH240-0201": [1, 30, null, null],
          "CMSC330-0101": [0, 40, 3, null],
          "ENGL101-0101": [5, 20, null, null],
        },
      ),
    ).toEqual([
      { termId: "202701", courseCode: "CMSC351", sectionCode: "0101", open: 2 },
      { termId: "202701", courseCode: "MATH240", sectionCode: "0201", open: 1 },
    ]);
    expect(openWatches([watch("CMSC351-0101")], "202701", null)).toEqual([]);
  });
});

describe("genEdsCovered", () => {
  it("counts the categories with nothing short", () => {
    const progress = GEN_ED_REQUIREMENTS.map(
      (requirement, n): GenEdProgress => ({
        requirement,
        done: 0,
        inProgress: 0,
        planned: 0,
        entryIds: [],
        short: n < 3 ? 0 : 1,
        searchCodes: [],
      }),
    );
    expect(genEdsCovered(progress)).toEqual({
      covered: 3,
      of: GEN_ED_REQUIREMENTS.length,
    });
  });
});

describe("planDepts", () => {
  it("lists a plan's departments once each, sorted", () => {
    const plan = aPlan({
      courses: [
        aPlanCourse({ courseCode: "MATH140", sectionCode: "0101" }),
        aPlanCourse({ courseCode: "CMSC351", sectionCode: "0101" }),
        aPlanCourse({ courseCode: "CMSC330", sectionCode: "0201" }),
      ],
    });
    expect(planDepts(plan)).toEqual(["CMSC", "MATH"]);
    expect(planDepts(aPlan({ courses: [] }))).toEqual([]);
  });
});

describe("fourYearDepts", () => {
  it("lists each course's department and what courses and credits count as", () => {
    const doc = aFourYear({
      entries: [
        aFourYearEntry({ code: "CMSC351" }),
        aFourYearEntry({
          id: "entry_fixture_2",
          code: "HIST289T",
          details: { title: null, genEds: [], countsAs: "ENGL101" },
        }),
        aFourYearCreditEntry({ countsAs: "CHEM135" }),
        aFourYearCreditEntry({ id: "entry_fixture_d", countsAs: null }),
        aFourYearWildcardEntry(),
      ],
    });
    expect(fourYearDepts(doc)).toEqual(["CHEM", "CMSC", "ENGL", "HIST"]);
    expect(fourYearDepts(aFourYear())).toEqual([]);
  });
});
