import { termLabel } from "~/core/catalog/terms";
import {
  type CourseOfferingFacts,
  courseOfferingFacts,
  LIKELIHOOD_MEANING,
  type Likelihood,
  likelihood,
  type OfferingView,
  offeringView,
} from "~/core/mcp/offering";
import { newestTerm, semestersAfter, termRef } from "~/core/mcp/terms";
import type {
  CourseCode,
  CourseIndexEntry,
  DeptCode,
  Term,
  TermId,
} from "~/core/schema";
import type { HistoryDept } from "~/core/schema/history";
import type { McpData } from "../data";
import {
  anyTerm,
  deptOf,
  inBatches,
  readCourseCode,
  unknownCourse,
} from "../lookup";

// When courses run: offering patterns (umd_get_course's `offering`,
// umd_check_offerings) and who taught each term (umd_course_history).

/** The course index's entry for `code`, or null. */
export async function indexEntry(
  data: McpData,
  code: CourseCode,
): Promise<CourseIndexEntry | null> {
  const dept = await data.courseIndexDept(deptOf(code));
  return dept?.courses.find((c) => c.code === code) ?? null;
}

/**
 * The offering facts of `code` merged with its cross-listings; null when
 * neither the history nor the index has it.
 */
export async function offeringFactsFor(
  data: McpData,
  terms: readonly Term[],
  code: CourseCode,
  crossListings: readonly CourseCode[],
): Promise<CourseOfferingFacts | null> {
  const codes = [code, ...crossListings.filter((c) => c !== code)];
  const depts = [...new Set(codes.map(deptOf))];
  const [manifest, historyFiles, indexFiles] = await Promise.all([
    data.historyManifest(),
    Promise.all(depts.map((d) => data.historyDept(d))),
    Promise.all(depts.map((d) => data.courseIndexDept(d))),
  ]);
  const history = new Map<DeptCode, HistoryDept>();
  for (const file of historyFiles) if (file) history.set(file.dept, file);
  const indexOffered = new Map<CourseCode, TermId[]>();
  for (const file of indexFiles)
    for (const entry of file?.courses ?? [])
      if (codes.includes(entry.code))
        indexOffered.set(entry.code, entry.offered);
  const known =
    indexOffered.size > 0 ||
    codes.some((c) =>
      history.get(deptOf(c))?.courses.some((x) => x.code === c),
    );
  const now = newestTerm(terms);
  if (!known || !now) return null;
  return courseOfferingFacts({
    codes,
    history,
    historyTerms: new Set(manifest?.terms.map((t) => t.termId) ?? []),
    indexOffered,
    listed: new Set(
      terms.filter((t) => t.status === "active").map((t) => t.id),
    ),
    now,
  });
}

/** The pattern as course details shows it, with when it runs next after `after`. */
export async function offeringFor(
  data: McpData,
  terms: readonly Term[],
  code: CourseCode,
  crossListings: readonly CourseCode[],
  after: TermId,
): Promise<OfferingView | null> {
  const facts = await offeringFactsFor(data, terms, code, crossListings);
  return facts ? offeringView(facts, after) : null;
}

/** The terms check_offerings asks about by default: listed falls and springs, then the next four. */
export function defaultLookAhead(terms: readonly Term[]): TermId[] {
  const listed = terms
    .filter(
      (t) =>
        t.status === "active" && (t.id.endsWith("01") || t.id.endsWith("08")),
    )
    .map((t) => t.id)
    .sort();
  const newest = newestTerm(terms);
  if (!newest) return listed;
  return [...listed, ...semestersAfter(newest, 4)];
}

export async function checkOfferings(
  data: McpData,
  input: { courses: string[]; terms?: string[] | undefined },
) {
  const terms = await data.terms();
  const codes = [...new Set(input.courses.map(readCourseCode))];
  const asked = input.terms?.length
    ? [...new Set(input.terms.map(anyTerm))].sort()
    : defaultLookAhead(terms);
  const rows = await inBatches(codes, 6, async (code) => {
    const entry = await indexEntry(data, code);
    const facts = await offeringFactsFor(
      data,
      terms,
      code,
      entry?.crossListings ?? [],
    );
    if (!facts) return { course: code, error: `No course ${code} on record.` };
    const view = offeringView(facts, newestTerm(terms) ?? asked[0] ?? "");
    const byTerm: Record<string, Likelihood> = {};
    for (const t of asked) byTerm[termLabel(t)] = likelihood(facts, t);
    return {
      course: code,
      title: entry?.title ?? null,
      usually: view.usually,
      pattern: view.pattern,
      confidence: view.confidence,
      lastOffered: view.lastOffered?.name ?? null,
      terms: byTerm,
    };
  });
  return {
    terms: asked.map(termRef),
    courses: rows,
    meaning: LIKELIHOOD_MEANING,
    note: "Patterns come from the last eight school years on record. They're a guide, not a promise: departments decide each term.",
  };
}

export async function courseHistory(
  data: McpData,
  input: { course_code: string; limit?: number | undefined },
) {
  const code = readCourseCode(input.course_code);
  const [dept, terms, entry] = await Promise.all([
    data.historyDept(deptOf(code)),
    data.terms(),
    indexEntry(data, code),
  ]);
  const course = dept?.courses.find((c) => c.code === code);
  if (!course && !entry) throw await unknownCourse(data, code);
  const limit = input.limit ?? 24;
  const offerings = course?.offerings ?? [];
  const newest = newestTerm(terms);
  const offering = newest
    ? await offeringFor(data, terms, code, entry?.crossListings ?? [], newest)
    : null;
  return {
    course: code,
    title: course?.title ?? entry?.title ?? null,
    crossListedWith: entry?.crossListings ?? [],
    usually: offering?.usually ?? null,
    termsOnRecord: offerings.length,
    terms: offerings.slice(0, limit).map((o) => ({
      term: termLabel(o.termId),
      instructors: o.instructors.length > 0 ? o.instructors : ["TBA"],
      sections: o.sections.length,
      source: o.source,
    })),
    more:
      offerings.length > limit
        ? `${offerings.length - limit} older terms not shown; raise limit to see them.`
        : null,
    note: "Sources: Terpsicle's own copies of Testudo (2026 on), umd.io's copy of Testudo (2017 on, all seasons) and PlanetTerp's grade data (2012 on, fall and spring sections that reported grades). A term missing here is unknown, not proof it wasn't offered.",
  };
}
