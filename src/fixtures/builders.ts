// One-off fixtures: each builder returns a schema-valid object with
// deterministic defaults, shallow-merged with the overrides you pass.
// Defaults echo the mock catalog (CMSC351 in IRB 0324, Spring 2027), so a
// builder's output looks like real data. Use these instead of hand-rolling
// objects in tests (CLAUDE.md).
import {
  type AcademicCalendar,
  type Block,
  type Building,
  type BuildingsFile,
  type CatalogChange,
  type ChangesFile,
  type Connection,
  type ConnectionEnd,
  type Course,
  type CourseGrades,
  connectionId,
  DEFAULT_GENERATE_LIMITS,
  DEFAULT_MUST_HAVES,
  DEFAULT_TRAVEL_SETTINGS,
  type DeptChunk,
  type GenerateRequest,
  GRADE_KEYS,
  type GradeCounts,
  type GradeKey,
  type GradeRecord,
  type Instructor,
  type Manifest,
  type ManifestDepartment,
  type Plan,
  type PlanCourse,
  type PlanetTerpDept,
  type PlanetTerpSource,
  PROBLEM_SEVERITY,
  type Problem,
  type Review,
  type ReviewSummary,
  type RouteGeometry,
  type SeatsFile,
  type SeatTuple,
  type Section,
  type SectionSnapshot,
  type SharePayload,
  type StoredReviews,
  type Term,
  type TermsFile,
  type TimedMeeting,
  type UntimedMeeting,
} from "~/core/schema";

/** Term id of the mock catalog's active, default term (Spring 2027). */
export const fixtureTermId = "202701";
/** Term id of the mock catalog's archived term (Summer 2026). */
export const archivedFixtureTermId = "202605";

/** "Now" for fixtures: the recon capture morning. Pass it wherever core needs a time. */
export const FIXTURE_NOW = "2026-09-25T12:00:00.000Z";

/** A content hash that looks real. */
export const FIXTURE_HASH = "0123456789abcdef";

// ---------- catalog ----------

export function aTerm(overrides: Partial<Term> = {}): Term {
  return {
    id: fixtureTermId,
    name: "Spring 2027",
    season: "spring",
    year: 2027,
    status: "active",
    firstSeen: "2026-09-01T00:00:00.000Z",
    lastSeen: FIXTURE_NOW,
    ...overrides,
  };
}

export function aTermsFile(overrides: Partial<TermsFile> = {}): TermsFile {
  return {
    schemaVersion: 1,
    generatedAt: FIXTURE_NOW,
    terms: [aTerm()],
    ...overrides,
  };
}

/** A timed, in-person lecture: MWF 10:00–10:50am in IRB 0324. */
export function aTimedMeeting(
  overrides: Partial<Omit<TimedMeeting, "timed">> = {},
): TimedMeeting {
  return {
    timed: true,
    days: ["M", "W", "F"],
    start: 600,
    end: 650,
    kind: "lecture",
    building: "IRB",
    room: "0324",
    online: false,
    ...overrides,
  };
}

/** The usual meeting; an alias of `aTimedMeeting`. */
export const aMeeting = aTimedMeeting;

/** A meeting with no set time. Defaults to async online ("Class time/details on ELMS"). */
export function anUntimedMeeting(
  overrides: Partial<Omit<UntimedMeeting, "timed">> = {},
): UntimedMeeting {
  return {
    timed: false,
    kind: "lecture",
    building: null,
    room: null,
    online: true,
    ...overrides,
  };
}

/** Days TBA but with a room, as IDEA201 has. */
export function aTbaMeeting(
  overrides: Partial<Omit<UntimedMeeting, "timed">> = {},
): UntimedMeeting {
  return anUntimedMeeting({
    kind: "discussion",
    building: "ESJ",
    room: "2101",
    online: false,
    ...overrides,
  });
}

export function aSection(overrides: Partial<Section> = {}): Section {
  return {
    code: "0101",
    instructors: ["Ada Brandt"],
    delivery: "f2f",
    meetings: [aTimedMeeting()],
    notes: null,
    restriction: null,
    ...overrides,
  };
}

export function aCourse(overrides: Partial<Course> = {}): Course {
  return {
    code: "CMSC351",
    title: "Algorithms",
    credits: { min: 3, max: 3 },
    genEds: [],
    gradingMethods: ["Reg"],
    permission: null,
    description:
      "A systematic study of the complexity of some elementary algorithms related to sorting, graphs and trees, and combinatorics.",
    prerequisite: "Minimum grade of C- in CMSC250 and CMSC216.",
    corequisite: null,
    restriction: null,
    otherNotes: [],
    crossListings: [],
    sections: [aSection()],
    ...overrides,
  };
}

export function aDeptChunk(overrides: Partial<DeptChunk> = {}): DeptChunk {
  return {
    schemaVersion: 1,
    termId: fixtureTermId,
    dept: "CMSC",
    courses: [aCourse()],
    ...overrides,
  };
}

/** `[open, total, waitlist, holdfile]`; defaults to 12 of 36 open, waitlist 0, no holdfile. */
export function aSeatTuple(
  overrides: Partial<{
    open: number;
    total: number;
    waitlist: number | null;
    holdfile: number | null;
  }> = {},
): SeatTuple {
  const s = { open: 12, total: 36, waitlist: 0, holdfile: null, ...overrides };
  return [s.open, s.total, s.waitlist, s.holdfile];
}

export function aSeatsFile(overrides: Partial<SeatsFile> = {}): SeatsFile {
  return {
    schemaVersion: 1,
    termId: fixtureTermId,
    // Testudo's "Open Seats as of 09/24/2026 at 10:30 PM" (Eastern).
    asOf: "2026-09-25T02:30:00.000Z",
    seats: { "CMSC351-0101": aSeatTuple() },
    ...overrides,
  };
}

/** The parts of a section a plan snapshots. */
export function snapshotOf(section: Section): SectionSnapshot {
  return {
    instructors: section.instructors,
    delivery: section.delivery,
    meetings: section.meetings,
    ...(section.dates ? { dates: section.dates } : {}),
  };
}

export function aSectionSnapshot(
  overrides: Partial<SectionSnapshot> = {},
): SectionSnapshot {
  return { ...snapshotOf(aSection()), ...overrides };
}

export function aCatalogChange(
  overrides: Partial<Extract<CatalogChange, { kind: "changed" }>> = {},
): CatalogChange {
  return {
    kind: "changed",
    sectionKey: "CMSC351-0101",
    at: FIXTURE_NOW,
    before: aSectionSnapshot({
      meetings: [aTimedMeeting({ start: 540, end: 590 })],
    }),
    after: aSectionSnapshot(),
    ...overrides,
  };
}

export function aChangesFile(
  overrides: Partial<ChangesFile> = {},
): ChangesFile {
  return {
    schemaVersion: 1,
    termId: fixtureTermId,
    since: "2026-08-26T12:00:00.000Z",
    changes: [aCatalogChange()],
    ...overrides,
  };
}

export function aManifestDepartment(
  overrides: Partial<ManifestDepartment> = {},
): ManifestDepartment {
  return {
    code: "CMSC",
    name: "Computer Science",
    hash: FIXTURE_HASH,
    courseCount: 1,
    sectionCount: 1,
    ...overrides,
  };
}

export function aManifest(overrides: Partial<Manifest> = {}): Manifest {
  return {
    schemaVersion: 1,
    termId: fixtureTermId,
    generatedAt: FIXTURE_NOW,
    catalogCrawledAt: FIXTURE_NOW,
    departments: [aManifestDepartment()],
    seats: {
      hash: FIXTURE_HASH,
      asOf: "2026-09-25T02:30:00.000Z",
      fetchedAt: FIXTURE_NOW,
    },
    changes: { hash: FIXTURE_HASH, count: 1, latestAt: FIXTURE_NOW },
    ...overrides,
  };
}

// ---------- plans and blocks ----------

export function aPlanCourse(overrides: Partial<PlanCourse> = {}): PlanCourse {
  const sectionCode =
    overrides.sectionCode === undefined ? "0101" : overrides.sectionCode;
  return {
    courseCode: "CMSC351",
    sectionCode,
    snapshot: sectionCode === null ? null : aSectionSnapshot(),
    ...overrides,
  };
}

/** A saved-for-later course: in the plan, not placed. */
export function aSavedCourse(courseCode = "MUSC130"): PlanCourse {
  return { courseCode, sectionCode: null, snapshot: null };
}

export function aPlan(overrides: Partial<Plan> = {}): Plan {
  return {
    id: "plan_fixture_a",
    termId: fixtureTermId,
    name: "Plan A",
    order: 0,
    createdAt: FIXTURE_NOW,
    updatedAt: FIXTURE_NOW,
    courses: [aPlanCourse()],
    ...overrides,
  };
}

export function aBlock(overrides: Partial<Block> = {}): Block {
  return {
    id: "block_fixture_1",
    termId: fixtureTermId,
    label: "Lunch",
    days: ["M", "W", "F"],
    start: 720,
    end: 780,
    ...overrides,
  };
}

export function aSharePayload(
  overrides: Partial<SharePayload> = {},
): SharePayload {
  return {
    v: 1,
    termId: fixtureTermId,
    name: "Plan A",
    sections: ["CMSC351-0101"],
    ...overrides,
  };
}

// ---------- PlanetTerp ----------

export function anInstructor(overrides: Partial<Instructor> = {}): Instructor {
  return {
    slug: "brandt",
    name: "Ada Brandt",
    type: "professor",
    rating: 4.2,
    reviewCount: 61,
    latestReviewAt: "2026-04-29T15:02:11.000Z",
    ...overrides,
  };
}

/** A typical upper-level distribution (about 64% A or B), in `GRADE_KEYS` order. */
const TYPICAL_GRADES: Record<GradeKey, number> = {
  "A+": 12,
  A: 38,
  "A-": 21,
  "B+": 17,
  B: 22,
  "B-": 11,
  "C+": 8,
  C: 10,
  "C-": 5,
  "D+": 2,
  D: 3,
  "D-": 1,
  F: 6,
  W: 7,
  Other: 2,
};

/** 15 counts in `GRADE_KEYS` order as the tuple type (missing values are 0). */
export function gradeCountsFrom(values: readonly number[]): GradeCounts {
  const [a, b, c, d, e, f, g, h, i, j, k, l, m, n, o] = values;
  return [
    a ?? 0,
    b ?? 0,
    c ?? 0,
    d ?? 0,
    e ?? 0,
    f ?? 0,
    g ?? 0,
    h ?? 0,
    i ?? 0,
    j ?? 0,
    k ?? 0,
    l ?? 0,
    m ?? 0,
    n ?? 0,
    o ?? 0,
  ];
}

/** Grade counts keyed by letter; unspecified letters take typical values. */
export function someGrades(
  overrides: Partial<Record<GradeKey, number>> = {},
): GradeCounts {
  const all = { ...TYPICAL_GRADES, ...overrides };
  return gradeCountsFrom(GRADE_KEYS.map((key) => all[key]));
}

export function aGradeRecord(
  overrides: Partial<GradeRecord> = {},
): GradeRecord {
  return {
    counts: someGrades(),
    semesters: 6,
    latestTermId: "202501",
    ...overrides,
  };
}

export function someCourseGrades(
  overrides: Partial<CourseGrades> = {},
): CourseGrades {
  return {
    all: aGradeRecord(),
    byInstructor: { brandt: aGradeRecord() },
    ...overrides,
  };
}

export function aPlanetTerpDept(
  overrides: Partial<PlanetTerpDept> = {},
): PlanetTerpDept {
  return {
    schemaVersion: 1,
    dept: "CMSC",
    instructors: { brandt: anInstructor() },
    names: { "ada brandt": "brandt" },
    courses: { CMSC351: someCourseGrades() },
    ...overrides,
  };
}

export function aPlanetTerpSource(
  overrides: Partial<PlanetTerpSource> = {},
): PlanetTerpSource {
  return {
    status: "ok",
    lastSuccessAt: FIXTURE_NOW,
    gradesThrough: "202501",
    latestReviewAt: "2026-04-29T15:02:11.000Z",
    ...overrides,
  };
}

export function aReview(overrides: Partial<Review> = {}): Review {
  return {
    course: "CMSC351",
    text: "Clear lectures and fair exams. Go to office hours.",
    rating: 4,
    expectedGrade: "A-",
    created: "2026-04-29T15:02:11.000Z",
    ...overrides,
  };
}

/** The private review copy the PlanetTerp job keeps; `count` distinct reviews, oldest first. */
export function someStoredReviews(
  count: number,
  overrides: Partial<StoredReviews> = {},
): StoredReviews {
  return {
    slug: "brandt",
    name: "Ada Brandt",
    reviews: Array.from({ length: count }, (_, i) =>
      aReview({
        text: `Stored review ${i + 1}: clear lectures, fair exams.`,
        created: new Date(Date.UTC(2026, 0, 1 + i)).toISOString(),
      }),
    ),
    ...overrides,
  };
}

export function aReviewSummary(
  overrides: Partial<ReviewSummary> = {},
): ReviewSummary {
  return {
    schemaVersion: 1,
    slug: "brandt",
    summary:
      "Mock summary for fixtures. Clear, well-paced lectures; exams are hard but the curve is generous.",
    themes: [
      { label: "clear lectures", sentiment: "positive" },
      { label: "hard exams", sentiment: "negative" },
    ],
    basedOnReviewCount: 61,
    latestReviewAt: "2026-04-29T15:02:11.000Z",
    generatedAt: FIXTURE_NOW,
    model: "mock-fixture",
    ...overrides,
  };
}

// ---------- geo and travel ----------

export function aBuilding(overrides: Partial<Building> = {}): Building {
  return {
    code: "IRB",
    number: "432",
    name: "Brendan Iribe Center for Computer Science and Engineering",
    lat: 38.989206,
    lng: -76.936248,
    ...overrides,
  };
}

export function aBuildingsFile(
  overrides: Partial<BuildingsFile> = {},
): BuildingsFile {
  return {
    schemaVersion: 1,
    buildings: [aBuilding()],
    offCampus: [],
    ...overrides,
  };
}

export function aRouteGeometry(
  overrides: Partial<RouteGeometry> = {},
): RouteGeometry {
  return {
    schemaVersion: 1,
    from: "IRB",
    to: "CSI",
    mode: "standard",
    lengthFeet: 197,
    coordinates: [
      [-76.936134, 38.98898],
      [-76.936057, 38.988965],
      [-76.935939, 38.989311],
    ],
    source: "umd-gis",
    fetchedAt: "2026-09-25T07:45:00.000Z",
    ...overrides,
  };
}

function aConnectionEnd(overrides: Partial<ConnectionEnd>): ConnectionEnd {
  return {
    sectionKey: "CMSC351-0101",
    meetingIndex: 0,
    building: "IRB",
    room: "0324",
    time: 650,
    ...overrides,
  };
}

/** STAT400 in ESJ at 10:50 to CMSC351 in CSI at 11:00: 1,999 ft, 8 min at typical pace, tight. */
export function aConnection(overrides: Partial<Connection> = {}): Connection {
  const from = aConnectionEnd({
    sectionKey: "STAT400-0101",
    building: "ESJ",
    room: "0202",
    time: 650,
  });
  const to = aConnectionEnd({
    sectionKey: "CMSC351-0301",
    building: "CSI",
    room: "1115",
    time: 660,
  });
  return {
    id: connectionId("M", from, to),
    day: "M",
    from,
    to,
    gapMinutes: 10,
    distanceFeet: 1999,
    walkMinutes: 8,
    verdict: "tight",
    mode: "standard",
    ...overrides,
  };
}

// ---------- calendar ----------

/** Spring 2027 from provost.umd.edu/calendar.md (captured 2026-09-25). */
export function aPublishedCalendar(
  overrides: Partial<Extract<AcademicCalendar, { status: "published" }>> = {},
): AcademicCalendar {
  return {
    status: "published",
    schemaVersion: 1,
    termId: fixtureTermId,
    source: "https://provost.umd.edu/calendar.md",
    fetchedAt: FIXTURE_NOW,
    classesStart: "2027-01-27",
    classesEnd: "2027-05-11",
    noClasses: [
      { name: "Spring Break", start: "2027-03-14", end: "2027-03-21" },
    ],
    ...overrides,
  };
}

export function anUnpublishedCalendar(
  overrides: Partial<
    Extract<AcademicCalendar, { status: "not-published" }>
  > = {},
): AcademicCalendar {
  return {
    status: "not-published",
    schemaVersion: 1,
    termId: archivedFixtureTermId,
    source: "https://provost.umd.edu/calendar.md",
    fetchedAt: FIXTURE_NOW,
    ...overrides,
  };
}

// ---------- computed contracts ----------

export function aGenerateRequest(
  overrides: Partial<GenerateRequest> = {},
): GenerateRequest {
  return {
    termId: fixtureTermId,
    items: [
      { kind: "course", courseCode: "CMSC351", required: true },
      { kind: "course", courseCode: "CMSC330", required: true },
      {
        kind: "pick",
        id: "pick-humanities",
        count: 1,
        courses: [{ courseCode: "MUSC130" }, { courseCode: "PHIL140" }],
      },
    ],
    mustHaves: DEFAULT_MUST_HAVES,
    rankBy: { preset: "compact" },
    blocks: [],
    travel: DEFAULT_TRAVEL_SETTINGS,
    limits: DEFAULT_GENERATE_LIMITS,
    ...overrides,
  };
}

/** Defaults to a "full" warning on CMSC351 0101 with a switch fix. */
export function aProblem(overrides: Partial<Problem> = {}): Problem {
  const kind = overrides.kind ?? "full";
  return {
    id: `${kind}:CMSC351-0101`,
    severity: PROBLEM_SEVERITY[kind],
    kind,
    subjects: [{ kind: "section", sectionKey: "CMSC351-0101" }],
    title: [
      { kind: "section", sectionKey: "CMSC351-0101" },
      { kind: "text", text: " is full" },
    ],
    detail: [{ kind: "text", text: "14 on the waitlist" }],
    fix: {
      kind: "switch",
      sectionKey: "CMSC351-0201",
      label: "Switch to 0201",
    },
    ...overrides,
  };
}
