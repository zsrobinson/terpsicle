import { z } from "zod";
import {
  type CourseGrades,
  DeptChunkSchema,
  deptChunkKey,
  GRADE_KEYS,
  type GradeCounts,
  type GradeRecord,
  type Instructor,
  instructorNameKey,
  JOBS_PREFIX,
  ManifestSchema,
  manifestKey,
  PLANETTERP_MANIFEST_KEY,
  PlanetTerpDeptSchema,
  PlanetTerpManifestSchema,
  type PlanetTerpSource,
  planetTerpDeptKey,
  SCHEMA_VERSIONS,
  TERMS_KEY,
  TermIdSchema,
  TermsFileSchema,
} from "~/core/schema";
import type { BlobStore } from "../blob-store";
import { type HttpClient, HttpError, mapLimit } from "../http";
import {
  type Logger,
  readJson,
  readJsonOrNull,
  SourceFailureError,
  updatePointer,
  writeHashed,
  writeJson,
} from "../publish";
import { activeTermIds } from "../soc/terms";
import aliasFile from "./aliases.json";
import { createNameMatcher, MATCH_RULES, type MatchRule } from "./names";
import {
  createReviewKeeper,
  ReviewApiSchema,
  type ReviewKeeper,
} from "./reviews";
import {
  implausibleReason,
  SOURCE_STATE_KEY,
  type SourceState,
  SourceStateSchema,
  statusAfterFailure,
  statusAfterSuccess,
} from "./source";

// The PlanetTerp job (daily; RESEARCH.md §5.5): every professor with review
// metadata (147 list pages), grade distributions for catalog courses on a
// bounded rotation, and the Testudo name → PlanetTerp slug join. Published
// per department (DATA.md §4.1).

export const PLANETTERP_API = "https://planetterp.com/api/v1";
/** The API rejects larger pages. */
const PAGE_SIZE = 100;
/** PlanetTerp asks to be gentle; list pages take 1–3 s each. */
const CONCURRENCY = 3;

// ---------- API shapes (validated at the boundary) ----------

const ProfessorApiSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  type: z.enum(["professor", "ta"]),
  courses: z.array(z.string()).default([]),
  average_rating: z.number().nullable(),
  reviews: z.array(ReviewApiSchema).default([]),
});

const count = z.number().int().min(0).catch(0);
const GradeRowApiSchema = z.object({
  course: z.string(),
  professor: z.string().nullable(),
  semester: z.string(),
  ...Object.fromEntries(GRADE_KEYS.map((k) => [k, count])),
});
type GradeRowApi = z.infer<typeof GradeRowApiSchema> & Record<string, unknown>;

/**
 * Hand-checked entries (aliases.json): Testudo names PlanetTerp lists under
 * another name, and people PlanetTerp lists under two slugs.
 */
export const AliasFileSchema = z.array(
  z.union([
    z.object({
      testudo: z.string().min(1),
      slug: z.string().min(1),
      why: z.string().min(1),
    }),
    z.object({
      duplicateSlug: z.string().min(1),
      slug: z.string().min(1),
      why: z.string().min(1),
    }),
  ]),
);
const ALIAS_ENTRIES = AliasFileSchema.parse(aliasFile);
const ALIASES = new Map(
  ALIAS_ENTRIES.flatMap((a) =>
    "testudo" in a ? [[instructorNameKey(a.testudo), a.slug] as const] : [],
  ),
);
const SAME_AS = new Map(
  ALIAS_ENTRIES.flatMap((a) =>
    "duplicateSlug" in a ? [[a.duplicateSlug, a.slug] as const] : [],
  ),
);

// ---------- job state ----------

const GRADES_KEY = `${JOBS_PREFIX}planetterp/grades.json`;
export const UNMATCHED_KEY = `${JOBS_PREFIX}planetterp/unmatched.json`;

/** Per course: PlanetTerp professor name → summed counts and the semesters seen. */
const CourseGradesStateSchema = z.object({
  fetchedAt: z.string(),
  byProfessor: z.record(
    z.string(),
    z.object({ counts: z.array(z.number()), semesters: z.array(z.string()) }),
  ),
});
const GradesStateSchema = z.object({
  courses: z.record(z.string(), CourseGradesStateSchema),
});
type GradesState = z.infer<typeof GradesStateSchema>;

export interface PlanetTerpOptions {
  http: HttpClient;
  store: BlobStore;
  now: Date;
  log: Logger;
  /** Grade requests per run; courses never fetched go first, then the stalest. */
  gradeRequests?: number;
}

export interface PlanetTerpResult {
  professors: number;
  reviews: number;
  departments: number;
  written: number;
  gradeRequests: number;
  /** Courses whose fetch came back empty, so their stored grades were kept. */
  gradesKept: number;
  coursesWithGrades: number;
  testudoNames: number;
  unmatchedNames: number;
  /** Review files written to the private store this run. */
  reviewFilesWritten: number;
  /** Testudo names matched by each rule. */
  matchedBy: Record<MatchRule, number>;
  latestReviewAt: string | null;
  /** What the manifest now says about PlanetTerp. */
  source: PlanetTerpSource;
  errors: string[];
}

interface CatalogIndex {
  /** dept → course codes. */
  courses: Map<string, Set<string>>;
  /** dept → Testudo instructor names. */
  names: Map<string, Set<string>>;
  /** Testudo name → courses they teach, for disambiguating slugs. */
  coursesByName: Map<string, Set<string>>;
}

export async function runPlanetTerp(
  options: PlanetTerpOptions,
): Promise<PlanetTerpResult> {
  const { http, store, now, log } = options;
  const errors: string[] = [];
  const catalog = await loadCatalog(store, log);
  const lastState = await readJsonOrNull(
    store,
    SOURCE_STATE_KEY,
    SourceStateSchema,
    log,
  );

  // The professor list, checked against the last good run before anything
  // is published: an empty or truncated list that parses must not replace
  // good data (DATA.md §4.1).
  const keeper = await createReviewKeeper(store, log);
  let professors: ProfessorSummary[];
  let reviewFilesWritten = 0;
  try {
    professors = await fetchProfessors(http, keeper);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw await sourceFailure(store, log, now, lastState, reason, {});
  } finally {
    reviewFilesWritten = (await keeper.finish()).written;
  }
  const bySlug = new Map<string, Instructor & { courses: Set<string> }>();
  let reviews = 0;
  let latestReviewAt: string | null = null;
  for (const p of professors) {
    const latest = p.latestReviewAt;
    reviews += p.reviewCount;
    if (latest && (!latestReviewAt || latest > latestReviewAt))
      latestReviewAt = latest;
    const rating =
      p.average_rating !== null &&
      p.average_rating >= 1 &&
      p.average_rating <= 5
        ? Math.round(p.average_rating * 1000) / 1000
        : null;
    bySlug.set(p.slug, {
      slug: p.slug,
      name: p.name,
      type: p.type,
      rating,
      reviewCount: p.reviewCount,
      latestReviewAt: latest,
      courses: new Set(p.courses),
    });
  }
  const implausible = implausibleReason(
    { professors: professors.length, reviews },
    lastState?.lastSuccessAt ? lastState : null,
  );
  if (implausible) {
    throw await sourceFailure(store, log, now, lastState, implausible, {
      professors: professors.length,
      reviews,
      previousProfessors: lastState?.professors ?? 0,
      previousReviews: lastState?.reviews ?? 0,
    });
  }

  // Testudo names → slugs (names.ts has the rules).
  const matcher = createNameMatcher([...bySlug.values()], {
    aliases: ALIASES,
    sameAs: SAME_AS,
    testudoNames: catalog.coursesByName.keys(),
  });
  const slugForTestudo = new Map<string, string | null>();
  const matchedBy = Object.fromEntries(
    MATCH_RULES.map((r) => [r, 0]),
  ) as Record<MatchRule, number>;
  for (const [name, courses] of catalog.coursesByName) {
    const match = matcher.match(name, courses);
    slugForTestudo.set(name, match?.slug ?? null);
    if (match) matchedBy[match.rule]++;
  }
  const unmatched = [...slugForTestudo]
    .filter(([, s]) => s === null)
    .map(([n]) => n)
    .sort();

  // Grades: never-fetched courses first, then the stalest.
  const grades = (await readJsonOrNull(
    store,
    GRADES_KEY,
    GradesStateSchema,
    log,
  )) ?? { courses: {} };
  const allCourses = [...catalog.courses.values()].flatMap((s) => [...s]);
  const queue = allCourses
    .map((code) => ({ code, at: grades.courses[code]?.fetchedAt ?? "" }))
    .sort((a, b) =>
      a.at < b.at ? -1 : a.at > b.at ? 1 : a.code < b.code ? -1 : 1,
    )
    .slice(0, options.gradeRequests ?? 700);
  let gradeRequests = 0;
  let gradesKept = 0;
  await mapLimit(queue, CONCURRENCY, async ({ code }) => {
    gradeRequests++;
    try {
      const next = mergeCourseGrades(
        grades.courses[code],
        summarizeGrades((await fetchGrades(http, code)) ?? []),
        now,
      );
      if (next.kept) gradesKept++;
      grades.courses[code] = next.state;
    } catch (error) {
      errors.push(
        `grades ${code}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  });
  await writeJson(store, GRADES_KEY, grades);

  const gradeSlug = (professor: string, course: string): string | null =>
    matcher.exact(professor, new Set([course]));

  // One file per catalog department.
  const previous = await readJsonOrNull(
    store,
    PLANETTERP_MANIFEST_KEY,
    PlanetTerpManifestSchema,
    log,
  );
  const previousHashes = new Map(
    previous?.schemaVersion === SCHEMA_VERSIONS.planetterp
      ? previous.departments.map((d) => [d.code, d.hash])
      : [],
  );
  let written = 0;
  let gradesThrough: string | null = null;
  let coursesWithGrades = 0;
  const departments: { code: string; hash: string }[] = [];
  for (const [dept, courses] of [...catalog.courses].sort(([a], [b]) =>
    a < b ? -1 : 1,
  )) {
    const instructors: Record<string, Instructor> = {};
    const names: Record<string, string> = {};
    const addInstructor = (slug: string) => {
      const p = bySlug.get(slug);
      if (!p) return;
      const { courses: _, ...instructor } = p;
      instructors[slug] = instructor;
    };
    for (const name of catalog.names.get(dept) ?? []) {
      const slug = slugForTestudo.get(name);
      if (!slug) continue;
      names[instructorNameKey(name)] = slug;
      addInstructor(slug);
    }
    const courseGrades: Record<string, CourseGrades> = {};
    for (const code of [...courses].sort()) {
      const state = grades.courses[code];
      const record = state
        ? buildCourseGrades(state.byProfessor, code, gradeSlug)
        : null;
      courseGrades[code] = record ?? { all: null, byInstructor: {} };
      if (record?.all) {
        coursesWithGrades++;
        if (!gradesThrough || record.all.latestTermId > gradesThrough)
          gradesThrough = record.all.latestTermId;
      }
      for (const slug of Object.keys(record?.byInstructor ?? {}))
        addInstructor(slug);
    }
    try {
      const out = await writeHashed(
        store,
        PlanetTerpDeptSchema,
        {
          schemaVersion: SCHEMA_VERSIONS.planetterp,
          dept,
          instructors: sortRecord(instructors),
          names: sortRecord(names),
          courses: courseGrades,
        },
        (h) => planetTerpDeptKey(dept, h),
        `PlanetTerp ${dept}`,
        previousHashes.get(dept) ?? null,
      );
      if (out.written) written++;
      departments.push({ code: dept, hash: out.hash });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${dept}: ${message}`);
      log.error(`Kept the previous PlanetTerp ${dept}`, { error: message });
      const prior = previousHashes.get(dept);
      if (prior) departments.push({ code: dept, hash: prior });
    }
  }

  const { status, reason } = statusAfterSuccess(latestReviewAt, now);
  const source: PlanetTerpSource = {
    status,
    lastSuccessAt: now.toISOString(),
    gradesThrough,
    latestReviewAt,
  };
  await updatePointer(
    store,
    PLANETTERP_MANIFEST_KEY,
    PlanetTerpManifestSchema,
    () => ({
      schemaVersion: SCHEMA_VERSIONS.planetterp,
      generatedAt: now.toISOString(),
      gradesThrough,
      departments,
      source,
    }),
  );
  await writeJson(store, UNMATCHED_KEY, {
    at: now.toISOString(),
    count: unmatched.length,
    names: unmatched,
    matchedBy,
  });
  await writeJson(store, SOURCE_STATE_KEY, {
    status,
    reason,
    lastRunAt: now.toISOString(),
    lastSuccessAt: now.toISOString(),
    professors: professors.length,
    reviews,
    latestReviewAt,
    gradesThrough,
  } satisfies SourceState);

  return {
    professors: professors.length,
    reviews,
    departments: departments.length,
    written,
    gradeRequests,
    gradesKept,
    coursesWithGrades,
    testudoNames: slugForTestudo.size,
    unmatchedNames: unmatched.length,
    reviewFilesWritten,
    matchedBy,
    latestReviewAt,
    source,
    errors,
  };
}

/**
 * Records that PlanetTerp failed: the job state and the manifest's `source`
 * say `stale` (or `gone` after weeks), and nothing else is touched, so the
 * last good department files stay published. Returns the error to throw.
 */
async function sourceFailure(
  store: BlobStore,
  log: Logger,
  now: Date,
  last: SourceState | null,
  reason: string,
  counts: Record<string, number>,
): Promise<SourceFailureError> {
  log.error("PlanetTerp failed; kept the last good files", { reason });
  let lastSuccessAt = last?.lastSuccessAt ?? null;
  try {
    await updatePointer(
      store,
      PLANETTERP_MANIFEST_KEY,
      PlanetTerpManifestSchema,
      (current) => {
        if (!current) return null;
        // Manifests from before job state existed were only written by good
        // runs, so their generatedAt is the last success.
        lastSuccessAt ??=
          current.source?.lastSuccessAt ?? current.generatedAt ?? null;
        return {
          // generatedAt stays: the files it points at are that old.
          ...current,
          source: {
            status: statusAfterFailure(lastSuccessAt, now),
            lastSuccessAt,
            gradesThrough: current.gradesThrough,
            latestReviewAt:
              last?.latestReviewAt ?? current.source?.latestReviewAt ?? null,
          },
        };
      },
    );
  } catch (error) {
    // The manifest is unreadable or busy: the failure itself still counts.
    log.error("Couldn't mark the PlanetTerp manifest stale", {
      error: String(error),
    });
  }
  await writeJson(store, SOURCE_STATE_KEY, {
    status: statusAfterFailure(lastSuccessAt, now),
    reason,
    lastRunAt: now.toISOString(),
    lastSuccessAt,
    professors: last?.professors ?? 0,
    reviews: last?.reviews ?? 0,
    latestReviewAt: last?.latestReviewAt ?? null,
    gradesThrough: last?.gradesThrough ?? null,
  } satisfies SourceState);
  return new SourceFailureError("PlanetTerp", reason, counts);
}

/**
 * A course's stored grades after a fetch. Grades never go from something to
 * nothing: an empty answer for a course that had rows is PlanetTerp losing
 * data, not the course losing its history, so the old rows stay (and the
 * course still moves to the back of the rotation).
 */
export function mergeCourseGrades(
  previous: GradesState["courses"][string] | undefined,
  fetched: GradesState["courses"][string]["byProfessor"],
  now: Date,
): { state: GradesState["courses"][string]; kept: boolean } {
  const fetchedAt = now.toISOString();
  if (
    Object.keys(fetched).length === 0 &&
    previous &&
    Object.keys(previous.byProfessor).length > 0
  )
    return { state: { ...previous, fetchedAt }, kept: true };
  return { state: { fetchedAt, byProfessor: fetched }, kept: false };
}

function sortRecord<T>(record: Record<string, T>): Record<string, T> {
  return Object.fromEntries(
    Object.entries(record).sort(([a], [b]) => (a < b ? -1 : 1)),
  );
}

/** Course codes and Testudo instructor names per department, across active terms. */
async function loadCatalog(
  store: BlobStore,
  log: Logger,
): Promise<CatalogIndex> {
  const terms = await readJson(store, TERMS_KEY, TermsFileSchema);
  if (!terms)
    throw new Error(`${TERMS_KEY} is missing; run the catalog job first`);
  const index: CatalogIndex = {
    courses: new Map(),
    names: new Map(),
    coursesByName: new Map(),
  };
  const add = <K, V>(map: Map<K, Set<V>>, key: K, value: V) => {
    const set = map.get(key) ?? new Set<V>();
    set.add(value);
    map.set(key, set);
  };
  for (const termId of activeTermIds(terms)) {
    const manifest = await readJson(store, manifestKey(termId), ManifestSchema);
    if (!manifest) {
      log.warn(`No manifest for active term ${termId}; skipped`);
      continue;
    }
    // Sequential on purpose: one chunk in memory at a time.
    for (const dept of manifest.departments) {
      const chunk = await readJson(
        store,
        deptChunkKey(termId, dept.code, dept.hash),
        DeptChunkSchema,
      );
      if (!chunk) continue;
      for (const course of chunk.courses) {
        add(index.courses, dept.code, course.code);
        for (const section of course.sections) {
          for (const name of section.instructors) {
            add(index.names, dept.code, name);
            add(index.coursesByName, name, course.code);
          }
        }
      }
    }
  }
  if (index.courses.size === 0)
    throw new Error("No catalog departments to attach PlanetTerp data to");
  return index;
}

/** A listed professor with the review text dropped once it's stored. */
type ProfessorSummary = Omit<z.infer<typeof ProfessorApiSchema>, "reviews"> & {
  reviewCount: number;
  latestReviewAt: string | null;
};

function summarizeProfessor(
  p: z.infer<typeof ProfessorApiSchema>,
): ProfessorSummary {
  const { reviews, ...rest } = p;
  const created = reviews
    .map((r) => Date.parse(r.created))
    .filter((t) => Number.isFinite(t));
  return {
    ...rest,
    reviewCount: reviews.length,
    latestReviewAt:
      created.length > 0 ? new Date(Math.max(...created)).toISOString() : null,
  };
}

/**
 * Every listed professor, paging until a short page. Each batch's review
 * text goes to the private store and is then dropped, so the 37 MB of text
 * is never in memory at once. Whether the list is plausible is the caller's
 * check: a short page early looks the same as the end.
 */
async function fetchProfessors(
  http: HttpClient,
  keeper: ReviewKeeper,
): Promise<ProfessorSummary[]> {
  const PageSchema = z.array(ProfessorApiSchema);
  const all: ProfessorSummary[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE * CONCURRENCY) {
    const pages = await mapLimit(
      Array.from({ length: CONCURRENCY }, (_, i) => offset + i * PAGE_SIZE),
      CONCURRENCY,
      async (start) => {
        const url = `${PLANETTERP_API}/professors?reviews=true&limit=${PAGE_SIZE}&offset=${start}`;
        const parsed = PageSchema.safeParse(await http.json(url));
        if (!parsed.success) {
          const issue = parsed.error.issues[0];
          throw new Error(
            `${url} doesn't look like a professor list at ${issue?.path.join(".")}: ${issue?.message}`,
          );
        }
        return parsed.data;
      },
    );
    const batch = pages.flat();
    await keeper.keep(batch);
    for (const p of batch) all.push(summarizeProfessor(p));
    if (pages.some((p) => p.length < PAGE_SIZE)) break;
  }
  return all;
}

/**
 * A course's grade rows, or null when PlanetTerp has never heard of the
 * course (its 400 "course not found"). Any other failure throws, so the
 * caller keeps what it had.
 */
export async function fetchGrades(
  http: HttpClient,
  course: string,
): Promise<GradeRowApi[] | null> {
  let raw: unknown;
  try {
    raw = await http.json(
      `${PLANETTERP_API}/grades?course=${encodeURIComponent(course)}`,
    );
  } catch (error) {
    if (
      error instanceof HttpError &&
      error.status === 400 &&
      /course not found/i.test(error.detail)
    )
      return null;
    throw error;
  }
  const parsed = z.array(GradeRowApiSchema).safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `grades for ${course} aren't a list of grade rows: ${parsed.error.issues[0]?.message}`,
    );
  }
  return parsed.data as GradeRowApi[];
}

/** Rows (one per section) → per professor: counts summed over sections and semesters. */
export function summarizeGrades(rows: readonly GradeRowApi[]) {
  const out: Record<string, { counts: number[]; semesters: string[] }> = {};
  for (const row of rows) {
    if (!TermIdSchema.safeParse(row.semester).success) continue;
    const name = row.professor ?? "";
    const entry = out[name] ?? {
      counts: GRADE_KEYS.map(() => 0),
      semesters: [],
    };
    GRADE_KEYS.forEach((k, i) => {
      entry.counts[i] = (entry.counts[i] ?? 0) + Number(row[k] ?? 0);
    });
    if (!entry.semesters.includes(row.semester))
      entry.semesters.push(row.semester);
    out[name] = entry;
  }
  for (const entry of Object.values(out)) entry.semesters.sort();
  return out;
}

function toRecord(
  counts: readonly number[],
  semesters: ReadonlySet<string>,
): GradeRecord | null {
  if (semesters.size === 0 || counts.every((n) => n === 0)) return null;
  const sorted = [...semesters].sort();
  return {
    counts: GRADE_KEYS.map((_, i) => counts[i] ?? 0) as GradeCounts,
    semesters: sorted.length,
    // biome-ignore lint/style/noNonNullAssertion: semesters is non-empty (checked above).
    latestTermId: sorted[sorted.length - 1]!,
  };
}

/** Stored per-professor sums → the published course record. Unknown professors count toward `all` only. */
export function buildCourseGrades(
  byProfessor: GradesState["courses"][string]["byProfessor"],
  course: string,
  slugFor: (professor: string, course: string) => string | null,
): CourseGrades | null {
  const total = GRADE_KEYS.map(() => 0);
  const allSemesters = new Set<string>();
  const perSlug = new Map<
    string,
    { counts: number[]; semesters: Set<string> }
  >();
  for (const [professor, { counts, semesters }] of Object.entries(
    byProfessor,
  )) {
    counts.forEach((n, i) => {
      total[i] = (total[i] ?? 0) + n;
    });
    for (const s of semesters) allSemesters.add(s);
    const slug = professor ? slugFor(professor, course) : null;
    if (!slug) continue;
    const entry = perSlug.get(slug) ?? {
      counts: GRADE_KEYS.map(() => 0),
      semesters: new Set(),
    };
    counts.forEach((n, i) => {
      entry.counts[i] = (entry.counts[i] ?? 0) + n;
    });
    for (const s of semesters) entry.semesters.add(s);
    perSlug.set(slug, entry);
  }
  const all = toRecord(total, allSemesters);
  if (!all) return null;
  const byInstructor: Record<string, GradeRecord> = {};
  for (const [slug, entry] of [...perSlug].sort(([a], [b]) =>
    a < b ? -1 : 1,
  )) {
    const record = toRecord(entry.counts, entry.semesters);
    if (record) byInstructor[slug] = record;
  }
  return { all, byInstructor };
}
