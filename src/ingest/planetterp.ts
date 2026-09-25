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
  planetTerpDeptKey,
  SCHEMA_VERSIONS,
  TERMS_KEY,
  TermIdSchema,
  TermsFileSchema,
} from "~/core/schema";
import type { BlobStore } from "./blob-store";
import { type HttpClient, HttpError, mapLimit } from "./http";
import {
  type Logger,
  readJson,
  readJsonOrNull,
  updatePointer,
  writeHashed,
  writeJson,
} from "./publish";
import { activeTermIds } from "./soc/terms";

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

const ReviewApiSchema = z.object({
  created: z.string(),
});

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
  coursesWithGrades: number;
  testudoNames: number;
  unmatchedNames: number;
  latestReviewAt: string | null;
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

  const professors = await fetchProfessors(http);
  const bySlug = new Map<string, Instructor & { courses: Set<string> }>();
  const byName = new Map<string, string[]>();
  let reviews = 0;
  let latestReviewAt: string | null = null;
  for (const p of professors) {
    const created = p.reviews
      .map((r) => Date.parse(r.created))
      .filter((t) => Number.isFinite(t));
    const latest =
      created.length > 0 ? new Date(Math.max(...created)).toISOString() : null;
    reviews += p.reviews.length;
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
      reviewCount: p.reviews.length,
      latestReviewAt: latest,
      courses: new Set(p.courses),
    });
    const key = instructorNameKey(p.name);
    byName.set(key, [...(byName.get(key) ?? []), p.slug]);
  }

  // Testudo names → slugs. Shared names pick the slug that taught one of the
  // same courses, then a professor over a TA, then the one with more reviews.
  const pick = (name: string, courses: ReadonlySet<string>): string | null => {
    const slugs = byName.get(instructorNameKey(name)) ?? [];
    if (slugs.length <= 1) return slugs[0] ?? null;
    const ranked = slugs
      .map((slug) => {
        // biome-ignore lint/style/noNonNullAssertion: every slug in byName came from bySlug.
        const p = bySlug.get(slug)!;
        const overlap = [...courses].some((c) => p.courses.has(c)) ? 1 : 0;
        return {
          slug,
          score: [overlap, p.type === "professor" ? 1 : 0, p.reviewCount],
        };
      })
      .sort((a, b) => compareScores(b.score, a.score));
    return ranked[0]?.slug ?? null;
  };
  const slugForTestudo = new Map<string, string | null>();
  for (const [name, courses] of catalog.coursesByName) {
    slugForTestudo.set(name, pick(name, courses));
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
  await mapLimit(queue, CONCURRENCY, async ({ code }) => {
    gradeRequests++;
    try {
      grades.courses[code] = {
        fetchedAt: now.toISOString(),
        byProfessor: summarizeGrades(await fetchGrades(http, code)),
      };
    } catch (error) {
      errors.push(
        `grades ${code}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  });
  await writeJson(store, GRADES_KEY, grades);

  const gradeSlug = (professor: string, course: string): string | null =>
    pick(professor, new Set([course]));

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

  await updatePointer(
    store,
    PLANETTERP_MANIFEST_KEY,
    PlanetTerpManifestSchema,
    () => ({
      schemaVersion: SCHEMA_VERSIONS.planetterp,
      generatedAt: now.toISOString(),
      gradesThrough,
      departments,
    }),
  );
  await writeJson(store, UNMATCHED_KEY, {
    at: now.toISOString(),
    count: unmatched.length,
    names: unmatched,
  });

  return {
    professors: professors.length,
    reviews,
    departments: departments.length,
    written,
    gradeRequests,
    coursesWithGrades,
    testudoNames: slugForTestudo.size,
    unmatchedNames: unmatched.length,
    latestReviewAt,
    errors,
  };
}

function compareScores(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < a.length; i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
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

async function fetchProfessors(http: HttpClient) {
  const PageSchema = z.array(ProfessorApiSchema);
  const all: z.infer<typeof ProfessorApiSchema>[] = [];
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
    for (const page of pages) all.push(...page);
    if (pages.some((p) => p.length < PAGE_SIZE)) break;
  }
  return all;
}

async function fetchGrades(
  http: HttpClient,
  course: string,
): Promise<GradeRowApi[]> {
  let raw: unknown;
  try {
    raw = await http.json(
      `${PLANETTERP_API}/grades?course=${encodeURIComponent(course)}`,
    );
  } catch (error) {
    // PlanetTerp answers 400 "course not found" for courses it has never seen.
    if (error instanceof HttpError && error.status === 400) return [];
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
