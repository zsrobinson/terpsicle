import { courseOfferings } from "~/core/history";
import {
  type CoursePageData,
  courseFromSlug,
  coursePageData,
  courseSlug,
  type InstructorMatch,
  type InstructorPageData,
  instructorIdCandidates,
  instructorPageData,
  instructorSlug,
  matchCourses,
  matchInstructors,
  mergeReviews,
  type ShownReview,
  type Suggestion,
  type TaughtOnlyPageData,
  taughtOnlyPageData,
} from "~/core/reviews";
import type { PageRequestContext } from "~/core/routing";
import {
  type CourseCode,
  CourseCodeSchema,
  type CourseSearchRow,
  type DeptCode,
  type InstructorId,
  InstructorIdSchema,
  instructorNameKey,
  type LatestReviews,
  MintedInstructorIdSchema,
  type PageReviews,
  type PlanetTerpDept,
  type PlanetTerpIndex,
  type PlanetTerpTotals,
  type ReviewSort,
  type TermId,
} from "~/core/schema";
import { suggestCourses, suggestInstructors } from "~/core/seo";
import { clientConfig } from "~/lib/config";
import {
  loadCourseEntry,
  loadCourseSearch,
  loadCurrentCourse,
  loadHistoryDept,
  loadOurNumbers,
  loadPlanetTerp,
  loadPlanetTerpIndex,
  type Reader,
  readerFor,
} from "./data";
import { reviewsClient } from "./reviews-store";

// What each public Reviews route's loader returns (src/routes/reviews.*).
// The server's render hydrates with its own data, so its HTML and the page
// agree, reviews and all; after a navigation in the browser the same loader
// runs there, reading the published files and `reviews/page`. Our numbers
// come from D1 on the server and from the hourly `reviews/` files in the
// browser. Null means "not found": the route answers 404.

/** Departments' files an instructor page reads, at most. */
const INSTRUCTOR_DEPTS_MAX = 4;

// ---------- a course ----------

/** `$code` as typed (`cmsc351`), checked; null for anything that isn't a code. */
export function parseCourseParam(code: string): CourseCode | null {
  const parsed = CourseCodeSchema.safeParse(code.toUpperCase());
  return parsed.success ? parsed.data : null;
}

export async function loadCoursePage(
  code: CourseCode,
  serverContext?: PageRequestContext,
): Promise<CoursePageData | null> {
  const reader = await readerFor(serverContext);
  const dept = code.slice(0, 4);
  const [entry, current, planetTerp, terpsicle, history] = await Promise.all([
    loadCourseEntry(reader, code),
    loadCurrentCourse(reader, code),
    loadPlanetTerp(reader, dept),
    reader.reviews?.courseNumbers(code) ?? null,
    // Without it, "Who taught it" falls back to PlanetTerp's newest terms.
    loadHistoryDept(reader, dept).catch(() => null),
  ]);
  const offerings = courseOfferings(history, code);
  const ids = Object.keys(
    planetTerp.dept?.courses[code]?.byInstructor ?? {},
  ).concat(
    [
      ...(current?.course?.sections ?? []).flatMap((s) => s.instructors),
      ...offerings.flatMap((o) => o.instructors),
    ].flatMap((name) => {
      const id = planetTerp.dept?.names[instructorNameKey(name)];
      return id ? [id] : [];
    }),
  );
  const ourNumbers = await loadOurNumbers(reader, [...new Set(ids)], [dept]);
  return coursePageData({
    code,
    entry,
    current,
    ptDept: planetTerp.dept,
    gradesThrough: planetTerp.gradesThrough,
    source: planetTerp.source,
    terpsicle,
    offerings,
    ourNumbers,
  });
}

// ---------- an instructor ----------

/** Instructor → departments learned this visit, so "All courses" needs no index. */
const knownDepts = new Map<InstructorId, DeptCode[]>();

export async function loadInstructorPage(
  id: string,
  course: string | undefined,
  serverContext?: PageRequestContext,
): Promise<InstructorPageData | null> {
  const parsedId = InstructorIdSchema.safeParse(id);
  if (!parsedId.success) return null;
  const instructorId = parsedId.data;
  const courseCode = course ? parseCourseParam(course) : null;
  const reader = await readerFor(serverContext);
  const minted = MintedInstructorIdSchema.safeParse(instructorId).success;

  const registry = minted
    ? ((await reader.reviews?.instructor(instructorId)) ?? null)
    : null;
  const courseDept = courseCode?.slice(0, 4) ?? null;
  const known = knownDepts.get(instructorId);
  let depts: DeptCode[] = [
    ...(courseDept ? [courseDept] : []),
    ...(known ?? []),
    ...(registry?.depts ?? []),
  ];
  let files = await planetTerpFiles(reader, depts);
  // Not in the files we know of: PlanetTerp's index says where else to look,
  // and whether they're anywhere at all.
  let lookedEverywhere = registry !== null;
  if (!minted && !files.some((f) => f.instructors[instructorId])) {
    const index = await loadPlanetTerpIndex(reader);
    if (index) {
      lookedEverywhere = true;
      depts = [...depts, ...(index.instructors[instructorId]?.[1] ?? [])];
      files = await planetTerpFiles(reader, depts);
    }
  }
  const planetTerp = await loadPlanetTerp(reader, depts[0] ?? "");
  const terpsicle =
    (await loadOurNumbers(reader, [instructorId], depts))[instructorId] ?? null;
  const input = {
    id: instructorId,
    course: courseCode,
    ptDepts: files,
    registryName: registry?.name ?? null,
    gradesThrough: planetTerp.gradesThrough,
    source: planetTerp.source,
    terpsicle,
  };
  const data = instructorPageData(input);
  if (data) {
    // The browser's visit only: a server isolate outlives nightly updates.
    if (!serverContext) knownDepts.set(instructorId, data.depts);
    return data;
  }
  // Nothing published could say who they are: a minted id in the browser,
  // or PlanetTerp's index not out yet. The page asks the API instead.
  if (!lookedEverywhere)
    return {
      ...emptyInstructor(instructorId, courseCode),
      gradesThrough: planetTerp.gradesThrough,
      source: planetTerp.source,
    };
  return null;
}

function emptyInstructor(
  id: InstructorId,
  course: CourseCode | null,
): InstructorPageData {
  return {
    id,
    name: null,
    ta: false,
    slug: null,
    planetTerp: null,
    depts: [],
    courses: [],
    course,
    gradesThrough: null,
    source: null,
    terpsicle: null,
  };
}

async function planetTerpFiles(
  reader: Reader,
  depts: readonly DeptCode[],
): Promise<PlanetTerpDept[]> {
  const unique = [...new Set(depts)].slice(0, INSTRUCTOR_DEPTS_MAX);
  const loaded = await Promise.all(
    unique.map((d) => loadPlanetTerp(reader, d)),
  );
  return loaded.flatMap((l) => (l.dept ? [l.dept] : []));
}

// ---------- /reviews/$slug: either ----------

/** What `/reviews/$slug` shows: a course's page or an instructor's. */
export type ReviewsPageData =
  | { kind: "course"; course: CoursePageData; reviews: PageReviews }
  | {
      kind: "instructor";
      instructor: InstructorPageData;
      reviews: PageReviews;
    }
  /** Someone only the history knows, reached from a course's page. */
  | { kind: "taught"; taught: TaughtOnlyPageData };

export type ReviewsPageLoad =
  | ReviewsPageData
  /** The page lives at another address (`CMSC351`, `goldman_aaron`). */
  | { kind: "moved"; slug: string }
  | { kind: "missing"; what: "course" | "instructor" };

/**
 * A course's page when the address is a course code (the pattern alone
 * says so), else an instructor's. An instructor's address with a hyphen may
 * be PlanetTerp's underscore, so PlanetTerp's index says which it is.
 */
export async function loadReviewsPage(
  slug: string,
  course: string | undefined,
  serverContext?: PageRequestContext,
  sort: ReviewSort = "latest",
): Promise<ReviewsPageLoad> {
  const code = courseFromSlug(slug);
  if (code) {
    if (slug !== courseSlug(code))
      return { kind: "moved", slug: courseSlug(code) };
    const [data, reviews] = await Promise.all([
      loadCoursePage(code, serverContext),
      readerFor(serverContext).then((r) =>
        r.pageReviews({ instructorId: null, course: code, sort }),
      ),
    ]);
    return data
      ? { kind: "course", course: data, reviews }
      : { kind: "missing", what: "course" };
  }
  const id = await resolveInstructor(slug, serverContext);
  if (id === null) return { kind: "missing", what: "instructor" };
  if (instructorSlug(id) !== slug)
    return { kind: "moved", slug: instructorSlug(id) };
  const courseCode = course ? parseCourseParam(course) : null;
  const reader = await readerFor(serverContext);
  const [data, first] = await Promise.all([
    loadInstructorPage(id, course, serverContext),
    reader.pageReviews({ instructorId: id, course: courseCode, sort }),
  ]);
  // PlanetTerp doesn't know them: someone the course's history names.
  if ((!data || data.name === null) && courseCode) {
    const history = await loadHistoryDept(reader, courseCode.slice(0, 4)).catch(
      () => null,
    );
    const taught = taughtOnlyPageData(history, courseCode, slug);
    if (taught) return { kind: "taught", taught };
  }
  if (!data) return { kind: "missing", what: "instructor" };
  // PlanetTerp has reviews of them that the nightly job hasn't stored yet
  // (it stores a share a night): ask again with their name, and the server
  // fetches them from PlanetTerp once (owner, 2026-09-29: Magdalene
  // Ngeve's page showed none).
  // Fixtures' names aren't PlanetTerp's, and e2e stays offline.
  const reviews =
    clientConfig.dataSource === "live" &&
    first.planetTerp.length === 0 &&
    !courseCode &&
    data.name &&
    (data.planetTerp?.reviewCount ?? 0) > 0
      ? await reader
          .pageReviews({
            instructorId: id,
            course: null,
            planetTerpName: data.name,
            sort,
          })
          .catch(() => first)
      : first;
  return { kind: "instructor", instructor: data, reviews };
}

/** The instructor an address names; null when it can't be anyone. */
async function resolveInstructor(
  slug: string,
  serverContext: PageRequestContext | undefined,
): Promise<InstructorId | null> {
  // Addresses are lowercase, as PlanetTerp's slugs are: /reviews/Kruskal moves.
  const candidates = instructorIdCandidates(slug.toLowerCase());
  if (candidates.length <= 1) return candidates[0] ?? null;
  const index = await loadPlanetTerpIndex(await readerFor(serverContext)).catch(
    () => null,
  );
  return (
    candidates.find((id) => index?.instructors[id] !== undefined) ??
    candidates[0] ??
    null
  );
}

// ---------- /reviews ----------

/** Rows a search shows at once; a department's code shows all of its courses. */
export const SEARCH_RESULTS = 8;

export interface ReviewsHomeData {
  /** [code, title, students], offered now. */
  mostTaken: [CourseCode, string, number][];
  /** [id, name, reviews, rating]: the professors most reviewed on PlanetTerp. */
  mostReviewed: PlanetTerpIndex["mostReviewed"];
  /** The newest reviews anywhere, ours and PlanetTerp's, newest first. */
  latest: LatestReview[];
  /** What PlanetTerp's data holds in all; null before it's published. */
  totals: PlanetTerpTotals | null;
  /** Newest semester in PlanetTerp's grades. */
  gradesThrough: TermId | null;
  /** `?q=`'s matches, so the server's HTML lists them. */
  results: SearchResults;
}

/** What a search found: instructors and courses, as equals. */
export interface SearchResults {
  instructors: InstructorMatch[];
  courses: CourseSearchRow[];
}

export const NO_RESULTS: SearchResults = { instructors: [], courses: [] };

/** Reviews the home page lists under "Recent reviews". */
export const LATEST_SHOWN = 6;

/** One of "Recent reviews", with who it's about. */
export interface LatestReview {
  shown: ShownReview;
  /** Null when neither the registry nor PlanetTerp's index names them. */
  instructorName: string | null;
}

/** A department code on its own: browse all of it. */
export function isDeptQuery(q: string): boolean {
  return /^[A-Za-z]{4}$/.test(q.trim());
}

export function searchResults(
  rows: readonly CourseSearchRow[],
  index: PlanetTerpIndex | null,
  q: string,
): SearchResults {
  const found = matchCourses(rows, q);
  return {
    // A department's code browses its courses: nobody's name is four letters of code.
    instructors:
      isDeptQuery(q) && found.length > 0
        ? []
        : matchInstructors(
            index?.instructors ?? {},
            q,
            // An index from before it carried every count still has these.
            new Map(index?.mostReviewed.map(([slug, , n]) => [slug, n])),
          ).slice(0, SEARCH_RESULTS),
    courses: isDeptQuery(q) ? found : found.slice(0, SEARCH_RESULTS),
  };
}

export async function loadReviewsHome(
  q: string | undefined,
  serverContext?: PageRequestContext,
): Promise<ReviewsHomeData> {
  const reader = await readerFor(serverContext);
  const [index, latest, planetTerp, rows] = await Promise.all([
    loadPlanetTerpIndex(reader).catch(() => null),
    loadLatest(reader, serverContext),
    loadPlanetTerp(reader, "").catch(() => null),
    q?.trim() ? loadCourseSearch(reader).catch(() => []) : [],
  ]);
  // An index from before it counted them: the server counts the files.
  const totals =
    index?.totals ??
    (await loadTotals(reader, serverContext).catch(() => null));
  return {
    mostTaken: index?.mostTaken ?? [],
    mostReviewed: index?.mostReviewed ?? [],
    latest: mergeReviews(latest.terpsicle ?? [], latest.planetTerp, true)
      .slice(0, LATEST_SHOWN)
      .map((shown) => ({
        shown,
        instructorName:
          (shown.source === "terpsicle"
            ? latest.instructors[shown.review.instructorId]
            : undefined) ??
          index?.instructors[shown.review.instructorId]?.[0] ??
          null,
      })),
    totals,
    gradesThrough: planetTerp?.gradesThrough ?? null,
    results: q?.trim() ? searchResults(rows, index, q) : NO_RESULTS,
  };
}

const NO_LATEST: LatestReviews = {
  terpsicle: null,
  planetTerp: [],
  instructors: {},
};

async function loadLatest(
  reader: Reader,
  serverContext: PageRequestContext | undefined,
): Promise<LatestReviews> {
  // Offline, or D1 not answering, just means none to show.
  if (serverContext)
    return serverContext.latestReviews(LATEST_SHOWN).catch(() => NO_LATEST);
  return reader.memo("latest", () =>
    reviewsClient()
      .reviews.latest({ limit: LATEST_SHOWN })
      .catch(() => NO_LATEST),
  );
}

function loadTotals(
  reader: Reader,
  serverContext: PageRequestContext | undefined,
): Promise<PlanetTerpTotals | null> {
  if (serverContext) return serverContext.planetTerpTotals();
  return reader.memo(
    "totals",
    async () => (await reviewsClient().reviews.totals()).totals,
  );
}

// ---------- not found ----------

export async function instructorSuggestions(
  typed: string,
  serverContext?: PageRequestContext,
): Promise<Suggestion[]> {
  const index = await loadPlanetTerpIndex(await readerFor(serverContext)).catch(
    () => null,
  );
  return index ? suggestInstructors(typed, index.instructors) : [];
}

export async function courseSuggestions(
  typed: string,
  serverContext?: PageRequestContext,
): Promise<Suggestion[]> {
  const rows = await loadCourseSearch(await readerFor(serverContext)).catch(
    () => [],
  );
  return suggestCourses(typed, rows);
}
