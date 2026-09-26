// Mock PlanetTerp data: invented ratings, review counts and grade
// distributions for the mock catalog's (invented) instructors. The one real
// number set is CMSC351's course-wide grade totals, summed from the recon's
// grades-CMSC351.json; it names nobody. Review summaries are marked mock.
import {
  type CourseGrades,
  GRADE_KEYS,
  type GradeCounts,
  type GradeRecord,
  GradeRecordSchema,
  type Instructor,
  instructorNameKey,
  type PlanetTerpDept,
  type ReviewSummary,
} from "~/core/schema";
import {
  archivedFixtureTermId,
  FIXTURE_NOW,
  fixtureTermId,
  gradeCountsFrom,
} from "../builders";
import { hashString, randomInt, seededRandom } from "../random";
import { mockCatalog } from "./catalog";
import realGrades from "./derived/planetterp-grades.json";

/** Newest semester in the mock grade data, as in PlanetTerp today. */
export const MOCK_GRADES_THROUGH = "202501";
/** PlanetTerp's newest review, as in real life: intake stopped in May 2026. */
export const MOCK_LATEST_REVIEW_AT = "2026-05-01T14:00:00.000Z";

/** The prototype's instructors, pinned so the demo reads the same every time. */
const PINNED: Readonly<
  Record<string, { rating: number; reviewCount: number }>
> = {
  "Kemi Adeyemi": { rating: 4.4, reviewCount: 72 },
  "Rana Haddad": { rating: 2.4, reviewCount: 57 },
  "Signe Lindqvist": { rating: 4.8, reviewCount: 23 },
  "Helena Ferreira": { rating: 3.3, reviewCount: 48 },
  "Maeve Brennan": { rating: 3.5, reviewCount: 19 },
  "Daniel Novak": { rating: 3.9, reviewCount: 204 },
  "Elena Castillo": { rating: 4.7, reviewCount: 41 },
  "Tae Park": { rating: 4.1, reviewCount: 30 },
  "Jada Abernathy": { rating: 4.6, reviewCount: 88 },
  "Keiko Ashdown": { rating: 3.1, reviewCount: 142 },
  "Grace Kowalczyk": { rating: 4.2, reviewCount: 61 },
  "Nils Zielinski": { rating: 3.8, reviewCount: 35 },
  "Jonah Hollis": { rating: 4.3, reviewCount: 96 },
  "Farid Kincaid": { rating: 3.4, reviewCount: 131 },
};

/** About one Testudo name in 20 has no PlanetTerp match, as in real data. */
const UNMATCHED_PERCENT = 5;

function allInstructorNames(): string[] {
  const names = new Set<string>();
  for (const termId of [fixtureTermId, archivedFixtureTermId])
    for (const chunk of mockCatalog[termId] ?? [])
      for (const course of chunk.courses)
        for (const section of course.sections)
          for (const name of section.instructors) names.add(name);
  return [...names].sort();
}

function slugBase(name: string): string {
  const parts = name
    .toLowerCase()
    .replace(/[^a-z ]/g, "")
    .split(" ");
  return parts[parts.length - 1] ?? "instructor";
}

/**
 * Testudo name → PlanetTerp slug, PlanetTerp-style: the last name, or
 * `last_first` when that's taken (the mock has three Zielinskis).
 */
function assignSlugs(names: readonly string[]): Map<string, string> {
  const slugs = new Map<string, string>();
  const taken = new Set<string>();
  for (const name of names) {
    if (!(name in PINNED) && hashString(`pt:${name}`) % 100 < UNMATCHED_PERCENT)
      continue;
    const base = slugBase(name);
    const first =
      name
        .toLowerCase()
        .split(" ")[0]
        ?.replace(/[^a-z]/g, "") ?? "x";
    const slug = taken.has(base) ? `${base}_${first}` : base;
    taken.add(slug);
    slugs.set(name, slug);
  }
  return slugs;
}

function instructorFor(name: string, slug: string): Instructor {
  const rand = seededRandom(`rating:${name}`);
  const pinned = PINNED[name];
  const noReviews = !pinned && rand() < 0.2;
  const reviewCount =
    pinned?.reviewCount ?? (noReviews ? 0 : randomInt(rand, 2, 220));
  const rating =
    pinned?.rating ??
    (noReviews ? null : Math.round((2.2 + rand() * 2.7) * 10) / 10);
  // Reviews stopped arriving on 2026-05-01 (RESEARCH §5.5), so they're all older.
  const daysBack = randomInt(rand, 0, 700);
  const latest = new Date(
    Date.parse(MOCK_LATEST_REVIEW_AT) - daysBack * 86_400_000,
  );
  return {
    slug,
    name,
    type: hashString(`ta:${name}`) % 17 === 0 && !pinned ? "ta" : "professor",
    rating,
    reviewCount,
    latestReviewAt: reviewCount === 0 ? null : latest.toISOString(),
  };
}

/** Rank of each grade key for skewing: A's 0 … F 4; W and Other in between. */
const RANK = [0, 0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 2.5, 2];
const BASE = [10, 30, 18, 15, 20, 10, 7, 9, 5, 2, 3, 1, 5, 6, 2];

function generatedCounts(seed: string): GradeCounts {
  const rand = seededRandom(seed);
  const total = randomInt(rand, 40, 700);
  const q = 0.35 + rand() * 0.55;
  const weights = BASE.map((b, i) => b * q ** (RANK[i] ?? 0));
  const sum = weights.reduce((a, b) => a + b, 0);
  return gradeCountsFrom(weights.map((w) => Math.round((w / sum) * total)));
}

function sumCounts(records: readonly GradeRecord[]): GradeCounts {
  return gradeCountsFrom(
    GRADE_KEYS.map((_, i) =>
      records.reduce((n, r) => n + (r.counts[i] ?? 0), 0),
    ),
  );
}

const REAL: Readonly<Record<string, GradeRecord>> = Object.fromEntries(
  Object.entries(realGrades).map(([code, record]) => [
    code,
    GradeRecordSchema.parse(record),
  ]),
);

function isUndergrad(code: string): boolean {
  return Number(code.slice(4, 7)) < 500;
}

function build() {
  const names = allInstructorNames();
  const slugs = assignSlugs(names);
  const instructors = new Map<string, Instructor>();
  for (const [name, slug] of slugs)
    instructors.set(slug, instructorFor(name, slug));

  const depts: PlanetTerpDept[] = [];
  for (const chunk of mockCatalog[fixtureTermId] ?? []) {
    const deptInstructors: Record<string, Instructor> = {};
    const deptNames: Record<string, string> = {};
    const courses: Record<string, CourseGrades> = {};
    for (const course of chunk.courses) {
      const teaching = new Set(course.sections.flatMap((s) => s.instructors));
      const byInstructor: Record<string, GradeRecord> = {};
      for (const name of teaching) {
        const slug = slugs.get(name);
        const instructor = slug ? instructors.get(slug) : undefined;
        if (!slug || !instructor) continue;
        deptInstructors[slug] = instructor;
        deptNames[instructorNameKey(name)] = slug;
        // New instructors and graduate courses often have no grade data.
        if (
          isUndergrad(course.code) &&
          hashString(`g:${course.code}:${slug}`) % 5 !== 0
        ) {
          const rand = seededRandom(`sem:${course.code}:${slug}`);
          byInstructor[slug] = {
            counts: generatedCounts(`grades:${course.code}:${slug}`),
            semesters: randomInt(rand, 1, 12),
            latestTermId: MOCK_GRADES_THROUGH,
          };
        }
      }
      const records = Object.values(byInstructor);
      const all =
        REAL[course.code] ??
        (records.length === 0
          ? null
          : {
              counts: sumCounts(records),
              semesters: Math.max(...records.map((r) => r.semesters)),
              latestTermId: MOCK_GRADES_THROUGH,
            });
      if (all || records.length > 0)
        courses[course.code] = { all, byInstructor };
    }
    depts.push({
      schemaVersion: 1,
      dept: chunk.dept,
      instructors: deptInstructors,
      names: deptNames,
      courses,
    });
  }
  return { depts, instructors, slugs };
}

const built = build();

/** One `PlanetTerpDept` per active-term department, sorted by code. */
export const mockPlanetTerpDepts: readonly PlanetTerpDept[] = built.depts;

/** Every mock instructor, by slug. */
export const mockInstructors: ReadonlyMap<string, Instructor> =
  built.instructors;

/** Testudo name → slug; names absent here have no PlanetTerp match. */
export const mockInstructorSlugs: ReadonlyMap<string, string> = built.slugs;

const SUMMARIES: Readonly<
  Record<string, { summary: string; themes: ReviewSummary["themes"] }>
> = {
  "Jada Abernathy": {
    summary:
      "Clear, well-paced lectures. Exams are hard but the curve is generous; students who go to office hours rave about it.",
    themes: [
      { label: "clear lectures", sentiment: "positive" },
      { label: "hard exams", sentiment: "negative" },
      { label: "generous curve", sentiment: "positive" },
    ],
  },
  "Keiko Ashdown": {
    summary:
      "Knows the material deeply but moves fast. Projects are heavy; many say the discussion TAs carry the course.",
    themes: [
      { label: "fast pace", sentiment: "negative" },
      { label: "heavy projects", sentiment: "negative" },
      { label: "great TAs", sentiment: "positive" },
    ],
  },
  "Grace Kowalczyk": {
    summary:
      "Engaging and funny. Homework is weekly and predictable, and exams mirror it closely.",
    themes: [
      { label: "engaging", sentiment: "positive" },
      { label: "predictable exams", sentiment: "positive" },
    ],
  },
  "Nils Zielinski": {
    summary:
      "Organized and fair. Lectures read from slides, but the notes are thorough enough to study from.",
    themes: [
      { label: "organized", sentiment: "positive" },
      { label: "slide-heavy", sentiment: "neutral" },
    ],
  },
  "Kemi Adeyemi": {
    summary:
      "Explains intuition before formulas. Quizzes every week keep you on track.",
    themes: [
      { label: "intuitive", sentiment: "positive" },
      { label: "weekly quizzes", sentiment: "neutral" },
    ],
  },
  "Rana Haddad": {
    summary:
      "Frequent complaints about unclear grading and late feedback. Material is interesting.",
    themes: [
      { label: "unclear grading", sentiment: "negative" },
      { label: "late feedback", sentiment: "negative" },
    ],
  },
  "Signe Lindqvist": {
    summary:
      "Students call it the best writing class they've taken. Lots of individual feedback on drafts.",
    themes: [
      { label: "great feedback", sentiment: "positive" },
      { label: "light workload", sentiment: "positive" },
    ],
  },
  "Daniel Novak": {
    summary:
      "Huge lecture, well run. Recorded lectures and a very active Piazza.",
    themes: [
      { label: "recorded", sentiment: "positive" },
      { label: "huge lecture", sentiment: "neutral" },
    ],
  },
};

/** Mock review summaries (model "mock-fixture"), keyed by slug. Invented text about invented people. */
export const mockReviewSummaries: readonly ReviewSummary[] = Object.entries(
  SUMMARIES,
).flatMap(([name, s]) => {
  const slug = built.slugs.get(name);
  const instructor = slug ? built.instructors.get(slug) : undefined;
  if (!slug || !instructor || instructor.reviewCount === 0) return [];
  return [
    {
      schemaVersion: 1,
      slug,
      summary: s.summary,
      themes: s.themes,
      basedOnReviewCount: instructor.reviewCount,
      latestReviewAt: instructor.latestReviewAt,
      generatedAt: FIXTURE_NOW,
      model: "mock-fixture",
    },
  ];
});
