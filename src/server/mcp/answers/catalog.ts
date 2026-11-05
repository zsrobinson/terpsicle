import { termLabel } from "~/core/catalog/terms";
import { readHistoryOffered } from "~/core/history/offered";
import {
  nextOffering,
  offeringPhrase,
  offeringSummary,
} from "~/core/history/offering-pattern";
import { defaultTerm, newestTerm, termRef } from "~/core/mcp/terms";
import {
  genEdWords,
  gradesByInstructor,
  gradesView,
  instructorWords,
  sectionView,
  termSummary,
} from "~/core/mcp/views";
import {
  type Course,
  type CourseCode,
  type CourseSearchRow,
  type Credits,
  GEN_ED_LABELS,
  planetTerpCourseUrl,
  type TermId,
} from "~/core/schema";
import { courseLevel, createRowSearch, searchCourses } from "~/core/search";
import type { McpData } from "../data";
import {
  catalogTerm,
  deptOf,
  inBatches,
  readCourseCode,
  ToolInputError,
  unknownCourse,
} from "../lookup";
import { indexEntry, offeringFor } from "./offerings";

// The catalog: terms, departments, search, a course, its sections.

const SITE = "https://terpsicle.com";

function creditsWords(credits: Credits): string {
  return credits.min === credits.max
    ? String(credits.min)
    : `${credits.min}–${credits.max}`;
}

export function courseLinks(code: CourseCode, termId: TermId) {
  return {
    terpsicle: `${SITE}/schedule/course/${code}?term=${termId}`,
    testudo: `https://app.testudo.umd.edu/soc/${termId}/${deptOf(code)}/${code}`,
    planetterp: planetTerpCourseUrl(code),
  };
}

export async function listTerms(data: McpData) {
  const [terms, history, planetTerp] = await Promise.all([
    data.terms(),
    data.historyManifest(),
    data.planetTerpManifest(),
  ]);
  const chosen = defaultTerm(terms);
  const active = terms.filter((t) => t.status === "active");
  const calendars = await Promise.all(active.map((t) => data.calendar(t.id)));
  const recorded = history?.terms.map((t) => t.termId) ?? [];
  return {
    defaultTerm: chosen ? termRef(chosen.id) : null,
    terms: active.map((t, i) => {
      const cal = calendars[i];
      return {
        id: t.id,
        name: t.name,
        calendar:
          cal?.status === "published"
            ? {
                classesStart: cal.classesStart,
                classesEnd: cal.classesEnd,
                noClasses: cal.noClasses.map(
                  (n) =>
                    `${n.name}: ${n.start}${n.end === n.start ? "" : ` to ${n.end}`}`,
                ),
              }
            : "Not published yet",
      };
    }),
    archivedTerms: terms
      .filter((t) => t.status === "archived")
      .map((t) => t.name),
    history: {
      from: recorded.at(-1) ? termLabel(recorded.at(-1) ?? "") : null,
      to: recorded[0] ? termLabel(recorded[0]) : null,
      termsOnRecord: recorded.length,
    },
    grades: {
      source: "PlanetTerp",
      through: planetTerp?.gradesThrough
        ? termLabel(planetTerp.gradesThrough)
        : null,
      status: planetTerp?.source?.status ?? "unknown",
    },
    note: "Sections, seats and instructors exist only for the terms listed here (Testudo's own list). Seats refresh every 5 minutes, the catalog every 6 hours.",
  };
}

export async function listDepartments(
  data: McpData,
  input: { term?: string | undefined },
) {
  const { term } = await catalogTerm(data, input.term);
  const manifest = await data.manifest(term.id);
  if (!manifest)
    throw new Error(`${term.name}'s catalog didn't load. Try again shortly.`);
  return {
    term: termRef(term.id),
    departments: manifest.departments.map(
      (d) => `${d.code} ${d.name} (${d.courseCount} courses)`,
    ),
  };
}

type SearchDocRow = CourseSearchRow;

/**
 * Every course an agent can find: the course index's rows (terms Testudo
 * has listed) and the offered file's older courses, which have no gen-eds
 * on record. Kept per isolate with the files it's built from.
 */
async function searchIndex(data: McpData) {
  const [rows, offered] = await Promise.all([
    data.courseSearchRows(),
    data.offered(),
  ]);
  if (!rows)
    throw new Error("The course index didn't load. Try again shortly.");
  const key = `courses/search.${rows.hash}.json+${offered?.hash ?? "none"}`;
  return data.derive(key, async () => {
    const byCode = new Map<CourseCode, SearchDocRow>();
    for (const row of rows.rows) byCode.set(row[0], row);
    const ran = offered ? readHistoryOffered(offered.file) : new Map();
    for (const [code, course] of ran) {
      if (byCode.has(code) || !course.title) continue;
      byCode.set(code, [
        code,
        course.title,
        course.credits?.min ?? 0,
        course.credits?.max ?? 0,
        [],
      ]);
    }
    return {
      byCode,
      search: createRowSearch(byCode.values()),
      offered: ran,
      offeredTerms: offered?.file.terms ?? [],
    };
  });
}

export type SearchInput = {
  query?: string | undefined;
  term?: string | undefined;
  dept?: string | undefined;
  gen_eds?: string[] | undefined;
  level?: number | undefined;
  credits?: number | undefined;
  open_seats_only?: boolean | undefined;
  include_not_offered?: boolean | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
};

/** Most departments one search reads the term's sections of. */
const MAX_SEARCH_DEPTS = 40;

export async function searchCoursesAnswer(data: McpData, input: SearchInput) {
  const { term, terms } = await catalogTerm(data, input.term);
  const query = input.query?.trim() ?? "";
  const dept = input.dept?.trim().toUpperCase() || null;
  if (dept && !/^[A-Z]{4}$/.test(dept))
    throw new ToolInputError(
      `"${input.dept}" isn't a department code. Codes are 4 letters (CMSC, MATH); umd_list_departments lists them.`,
    );
  const genEds = (input.gen_eds ?? []).map((g) => g.trim().toUpperCase());
  for (const g of genEds)
    if (!GEN_ED_LABELS[g])
      throw new ToolInputError(
        `"${g}" isn't a gen-ed code. Codes: ${Object.entries(GEN_ED_LABELS)
          .map(([c, l]) => `${c} (${l})`)
          .join(", ")}.`,
      );
  if (!query && !dept && genEds.length === 0 && input.level === undefined)
    throw new ToolInputError(
      "Give a query, a department, gen-eds or a level: a search with nothing to go on would list every course.",
    );
  const limit = input.limit ?? 15;
  const offset = input.offset ?? 0;
  const idx = await searchIndex(data);

  const codes = query ? searchCourses(idx.search, query) : idx.search.codes;
  const candidates = codes.filter((code) => {
    const row = idx.byCode.get(code);
    if (!row) return false;
    if (dept && !code.startsWith(dept)) return false;
    if (input.level !== undefined && courseLevel(code) !== input.level)
      return false;
    if (
      input.credits !== undefined &&
      !(row[2] <= input.credits && input.credits <= row[3])
    )
      return false;
    // Checked again against the term's catalog below, whose wording wins.
    return genEds.every((g) => row[4].includes(g));
  });

  const seats = await data.seats(term.id);
  const ptCache = new Map<string, ReturnType<McpData["planetTerpDept"]>>();
  const planetTerp = (d: string) => {
    let p = ptCache.get(d);
    if (!p) {
      p = data.planetTerpDept(d);
      ptCache.set(d, p);
    }
    return p;
  };

  const found: Course[] = [];
  const notInTerm: CourseCode[] = [];
  const loaded = new Map<string, Map<CourseCode, Course>>();
  let scanned = 0;
  let stoppedEarly = false;
  const want = offset + limit;
  // Read departments in the order their courses rank, a few at a time,
  // until the page is full.
  for (let i = 0; i < candidates.length && found.length < want; ) {
    const batch: CourseCode[] = [];
    const newDepts = new Set<string>();
    while (i < candidates.length && batch.length < 60) {
      const code = candidates[i++] ?? "";
      batch.push(code);
      if (!loaded.has(deptOf(code))) newDepts.add(deptOf(code));
    }
    if (loaded.size + newDepts.size > MAX_SEARCH_DEPTS) {
      stoppedEarly = true;
      break;
    }
    await inBatches([...newDepts], 10, async (d) => {
      const courses = await data.deptCourses(term.id, d);
      loaded.set(d, new Map((courses ?? []).map((c) => [c.code, c])));
    });
    for (const code of batch) {
      scanned += 1;
      const course = loaded.get(deptOf(code))?.get(code);
      if (!course) {
        notInTerm.push(code);
        continue;
      }
      if (
        genEds.length > 0 &&
        !genEds.every((g) =>
          course.genEds.some((group) => group.some((o) => o.code === g)),
        )
      )
        continue;
      if (
        input.open_seats_only &&
        !course.sections.some(
          (s) => (seats?.[`${course.code}-${s.code}`]?.[0] ?? 0) > 0,
        )
      )
        continue;
      found.push(course);
    }
  }

  const page = found.slice(offset, want);
  const results = await Promise.all(
    page.map(async (course) => {
      const summary = termSummary(
        course,
        seats,
        await planetTerp(deptOf(course.code)),
      );
      return {
        code: course.code,
        title: course.title,
        credits: creditsWords(course.credits),
        genEds: genEdWords(course.genEds),
        sections: summary.sections,
        sectionsWithOpenSeats: summary.sectionsWithOpenSeats,
        instructors: summary.instructors.slice(0, 6).map(instructorWords),
      };
    }),
  );

  // Courses that matched but aren't in this term, with when they run.
  const listed = new Set(
    terms.filter((t) => t.status === "active").map((t) => t.id),
  );
  const now = newestTerm(terms) ?? term.id;
  const recorded = new Set([...idx.offeredTerms, ...listed]);
  const showNotOffered =
    (input.include_not_offered ?? true) &&
    offset === 0 &&
    !input.open_seats_only;
  const exact = query.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const notOffered = showNotOffered
    ? notInTerm
        .flatMap((code) => {
          const row = idx.byCode.get(code);
          const ran = new Set<TermId>(idx.offered.get(code)?.ran ?? []);
          if (!row) return [];
          const summary = offeringSummary({ offered: ran, recorded, now });
          if (summary.pattern.kind === "discontinued" && code !== exact)
            return [];
          const next = nextOffering(summary, term.id, listed, ran);
          return [
            {
              code,
              title: row[1],
              credits: creditsWords({ min: row[2], max: row[3] }),
              usually: offeringPhrase(summary),
              next: next
                ? `${next.likely ? "likely " : ""}${termLabel(next.termId)}`
                : null,
            },
          ];
        })
        .slice(0, 5)
    : [];

  const more =
    found.length > want ||
    (found.length >= want && (stoppedEarly || scanned < candidates.length));
  return {
    term: termRef(term.id),
    results,
    nextOffset: more ? want : null,
    notOfferedThisTerm: notOffered,
    note: stoppedEarly
      ? `Matches span more than ${MAX_SEARCH_DEPTS} departments; narrow with dept, a query or gen_eds to see the rest.`
      : results.length === 0
        ? `No ${term.name} course matches. Try fewer filters or other words.`
        : null,
  };
}

export async function getCourse(
  data: McpData,
  input: {
    course_code: string;
    term?: string | undefined;
    detail?: "concise" | "full" | undefined;
  },
) {
  const code = readCourseCode(input.course_code);
  const { term, terms } = await catalogTerm(data, input.term);
  const [course, entry, planetTerp, ptManifest, history] = await Promise.all([
    data.course(term.id, code),
    indexEntry(data, code),
    data.planetTerpDept(deptOf(code)),
    data.planetTerpManifest(),
    data.historyDept(deptOf(code)),
  ]);
  const crossListings = course?.crossListings ?? entry?.crossListings ?? [];
  const offering = await offeringFor(data, terms, code, crossListings, term.id);
  if (!course && !entry && !offering) throw await unknownCourse(data, code);

  // PlanetTerp files a cross-listed course's grades under one of its codes.
  let grades = planetTerp?.courses[code];
  let gradesDept = planetTerp;
  let gradesCode = code;
  if (!grades?.all) {
    for (const other of crossListings) {
      const d = await data.planetTerpDept(deptOf(other));
      if (d?.courses[other]?.all) {
        grades = d.courses[other];
        gradesDept = d;
        gradesCode = other;
        break;
      }
    }
  }
  const full = input.detail === "full";
  const seats = course ? await data.seats(term.id) : null;
  const text = course ?? entry;
  const prereqs = entry?.prereqs ?? null;
  return {
    code,
    // A course no listed term has: its newest title on record.
    title:
      text?.title ??
      history?.courses.find((c) => c.code === code)?.title ??
      null,
    credits: text ? creditsWords(text.credits) : null,
    description: course?.description ?? null,
    genEds: text ? genEdWords(text.genEds) : [],
    prerequisite: text?.prerequisite ?? null,
    prerequisiteCourses: prereqs
      ? {
          allOf: prereqs.groups.map((g) =>
            g.length === 1 ? (g[0] ?? "") : `one of ${g.join(", ")}`,
          ),
          complete: prereqs.complete,
        }
      : null,
    corequisite: text?.corequisite ?? null,
    restriction: text?.restriction ?? null,
    crossListedWith: crossListings,
    ...(course
      ? {
          permission: course.permission,
          gradingMethods: course.gradingMethods,
          otherNotes: course.otherNotes.map((n) => `${n.label}: ${n.text}`),
        }
      : {}),
    thisTerm: course
      ? (() => {
          const s = termSummary(course, seats, planetTerp);
          return {
            term: term.name,
            offered: true,
            sections: s.sections,
            sectionsWithOpenSeats: s.sectionsWithOpenSeats,
            openSeats: s.openSeats,
            instructors: s.instructors,
          };
        })()
      : { term: term.name, offered: false },
    offering: offering
      ? full
        ? offering
        : {
            usually: offering.usually,
            confidence: offering.confidence,
            record: offering.record,
            lastOffered: offering.lastOffered?.name ?? null,
            next: offering.next
              ? `${offering.next.certainty === "likely" ? "likely " : ""}${offering.next.name}`
              : null,
          }
      : null,
    grades: grades?.all
      ? {
          source: `PlanetTerp, through ${ptManifest?.gradesThrough ? termLabel(ptManifest.gradesThrough) : "its latest term"}${gradesCode === code ? "" : `, filed under ${gradesCode}`}`,
          overall: gradesView(grades.all),
          byInstructor: gradesByInstructor(grades, gradesDept, full ? 20 : 6),
        }
      : null,
    links: courseLinks(code, term.id),
  };
}

export async function getSections(
  data: McpData,
  input: {
    course_code: string;
    term?: string | undefined;
    open_only?: boolean | undefined;
    instructor?: string | undefined;
    detail?: "concise" | "full" | undefined;
    limit?: number | undefined;
    offset?: number | undefined;
  },
) {
  const code = readCourseCode(input.course_code);
  const { term } = await catalogTerm(data, input.term);
  const course = await data.course(term.id, code);
  if (!course) {
    const entry = await indexEntry(data, code);
    if (!entry) throw await unknownCourse(data, code);
    throw new ToolInputError(
      `${code} isn't offered in ${term.name}. umd_get_course says when it usually runs; umd_list_terms lists the terms with sections.`,
    );
  }
  const [seats, asOf, planetTerp] = await Promise.all([
    data.seats(term.id),
    data.seatsAsOf(term.id),
    data.planetTerpDept(deptOf(code)),
  ]);
  const who = input.instructor?.trim().toLowerCase();
  const matching = course.sections.filter(
    (s) =>
      (!input.open_only || (seats?.[`${code}-${s.code}`]?.[0] ?? 0) > 0) &&
      (!who || s.instructors.some((n) => n.toLowerCase().includes(who))),
  );
  const limit = input.limit ?? 40;
  const offset = input.offset ?? 0;
  const full = input.detail === "full";
  const sections = matching.slice(offset, offset + limit).map((s) => {
    const view = sectionView(course, s, seats, planetTerp);
    return full ? view : { ...view, notes: undefined };
  });
  return {
    course: code,
    title: course.title,
    term: termRef(term.id),
    seatsAsOf: asOf,
    totalSections: course.sections.length,
    matching: matching.length,
    sections,
    nextOffset: matching.length > offset + limit ? offset + limit : null,
    note:
      matching.length === 0
        ? "No section matches; drop open_only or instructor."
        : full
          ? null
          : 'Section notes are left out; pass detail: "full" for them.',
  };
}
