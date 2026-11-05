import { buildCatalogIndex } from "~/core/catalog/catalog-index";
import { generatePlans, sectionQuality } from "~/core/generate";
import { checkSchedule, messageText, scheduleWeek } from "~/core/mcp/schedule";
import { termRef } from "~/core/mcp/terms";
import { round } from "~/core/mcp/views";
import {
  type Course,
  type CourseCode,
  type Day,
  DEFAULT_TRAVEL_SETTINGS,
  type GenerateRequest,
  type GenItem,
  type Minutes,
  type PlanetTerpDept,
  parseSectionKey,
  type RankFactor,
  type SectionKey,
} from "~/core/schema";
import { formatTime, parseTime } from "~/core/time/format";
import type { McpData } from "../data";
import {
  catalogTerm,
  deptOf,
  inBatches,
  readCourseCode,
  ToolInputError,
} from "../lookup";

// Schedules: check one (the scheduler's Problems) or build some (its
// generator, the same search Generate runs in the browser's worker).

/** "cmsc351 0101", "CMSC 351-0101", "CMSC351-0101" → "CMSC351-0101". */
export function readSectionKey(input: string): SectionKey {
  const text = input.trim().toUpperCase();
  // The section is the last group of letters and digits; the course is the rest.
  const match = /^(.*?)[\s-]*([A-Z0-9]{3,4})$/.exec(text);
  const course = (match?.[1] ?? "").replace(/[^A-Z0-9]/g, "");
  const section = match?.[2] ?? "";
  if (!match || course.length < 7)
    throw new ToolInputError(
      `"${input}" isn't a section. Write the course and its section, like CMSC351-0101; umd_get_sections lists a course's sections.`,
    );
  const key = `${course}-${section.padStart(4, "0")}`;
  if (!parseSectionKey(key))
    throw new ToolInputError(
      `"${input}" isn't a section. Write the course and its section, like CMSC351-0101; umd_get_sections lists a course's sections.`,
    );
  return key;
}

/** A section code for `course`: "0101", "101" or a key of that same course. */
function readSectionOf(course: CourseCode, input: string): string {
  const text = input.trim().toUpperCase();
  if (/^[A-Z0-9]{3,4}$/.test(text)) return text.padStart(4, "0");
  const key = readSectionKey(text);
  if (!key.startsWith(`${course}-`))
    throw new ToolInputError(
      `"${input}" is a section of another course; list it under that course's code.`,
    );
  return key.slice(course.length + 1);
}

async function termCourses(
  data: McpData,
  termId: string,
  codes: readonly CourseCode[],
): Promise<Map<CourseCode, Course>> {
  const found = await inBatches(codes, 8, (code) => data.course(termId, code));
  const out = new Map<CourseCode, Course>();
  for (const course of found) if (course) out.set(course.code, course);
  return out;
}

export async function checkScheduleAnswer(
  data: McpData,
  input: {
    sections: string[];
    term?: string | undefined;
    accessible?: boolean | undefined;
  },
  now: Date,
) {
  const { term } = await catalogTerm(data, input.term);
  const keys = [...new Set(input.sections.map(readSectionKey))];
  const codes = [...new Set(keys.map((k) => k.split("-")[0] ?? k))];
  if (codes.length !== keys.length)
    throw new ToolInputError(
      "Give one section per course: a schedule holds each course once.",
    );
  const courses = await termCourses(data, term.id, codes);
  const missing = keys.filter((k) => {
    const parsed = parseSectionKey(k);
    const course = parsed ? courses.get(parsed.courseCode) : undefined;
    return !course?.sections.some((s) => s.code === parsed?.sectionCode);
  });
  if (missing.length > 0)
    throw new ToolInputError(
      `${term.name} has no section ${missing.join(", ")}. umd_get_sections lists a course's sections.`,
    );
  const [seats, campus] = await Promise.all([
    data.seats(term.id),
    data.campus(),
  ]);
  const check = checkSchedule({
    termId: term.id,
    courses: [...courses.values()],
    sections: keys,
    seats,
    campus,
    travel: {
      ...DEFAULT_TRAVEL_SETTINGS,
      accessible: input.accessible ?? false,
    },
    now: now.toISOString(),
  });
  return {
    term: termRef(term.id),
    ...check,
    verdict: check.problems.some((p) => p.severity === "error")
      ? "Has errors: this schedule doesn't work as is."
      : check.problems.some((p) => p.severity === "warning")
        ? "Works, with warnings to weigh."
        : "Works: no conflicts.",
  };
}

const RANK_WORDS: Record<RankFactor, string> = {
  compact: "fewest gaps between classes",
  "fewer-days": "fewest days on campus",
  "later-starts": "latest first class",
  "best-rated": "best-rated instructors (PlanetTerp)",
  "higher-gpa": "highest average GPA (PlanetTerp)",
  "safest-seats": "most open seats",
};

function readClock(input: string | undefined, what: string): Minutes | null {
  if (input === undefined || input.trim() === "") return null;
  const minutes = parseTime(input);
  if (minutes === null)
    throw new ToolInputError(
      `${what} "${input}" isn't a time. Write it like 9am, 9:30am or 13:15.`,
    );
  return minutes;
}

/** Search budget: about a second of the Worker's time on a big request. */
const MAX_STEPS = 150_000;

export async function generateSchedules(
  data: McpData,
  input: {
    courses: {
      code: string;
      required?: boolean | undefined;
      sections?: string[] | undefined;
    }[];
    term?: string | undefined;
    earliest_start?: string | undefined;
    latest_end?: string | undefined;
    days_off?: Day[] | undefined;
    open_seats_only?: boolean | undefined;
    min_credits?: number | undefined;
    max_credits?: number | undefined;
    rank_by?: RankFactor | undefined;
    accessible?: boolean | undefined;
    limit?: number | undefined;
  },
) {
  const { term } = await catalogTerm(data, input.term);
  const items: GenItem[] = [];
  const codes: CourseCode[] = [];
  for (const c of input.courses) {
    const code = readCourseCode(c.code);
    if (codes.includes(code))
      throw new ToolInputError(`${code} is listed twice.`);
    codes.push(code);
    const sections = c.sections?.map((x) => readSectionOf(code, x));

    items.push({
      kind: "course",
      required: c.required ?? true,
      courseCode: code,
      ...(sections && sections.length > 0 ? { sections } : {}),
    });
  }
  const courses = await termCourses(data, term.id, codes);
  const absent = codes.filter((c) => !courses.has(c));
  if (absent.length > 0)
    throw new ToolInputError(
      `${absent.join(", ")} ${absent.length === 1 ? "isn't" : "aren't"} offered in ${term.name}. Leave ${absent.length === 1 ? "it" : "them"} out, or use umd_check_offerings for when ${absent.length === 1 ? "it runs" : "they run"}.`,
    );
  for (const item of items) {
    if (item.kind !== "course" || !item.sections) continue;
    const course = courses.get(item.courseCode);
    const bad = item.sections.filter(
      (s) => !course?.sections.some((x) => x.code === s),
    );
    if (bad.length > 0)
      throw new ToolInputError(
        `${item.courseCode} has no section ${bad.join(", ")} in ${term.name}.`,
      );
  }

  if (
    input.min_credits !== undefined &&
    input.max_credits !== undefined &&
    input.min_credits > input.max_credits
  )
    throw new ToolInputError(
      `min_credits (${input.min_credits}) is more than max_credits (${input.max_credits}); swap them or drop one.`,
    );
  const rankBy = input.rank_by ?? "compact";
  const request: GenerateRequest = {
    termId: term.id,
    items,
    mustHaves: {
      earliestStart: readClock(input.earliest_start, "earliest_start"),
      latestEnd: readClock(input.latest_end, "latest_end"),
      daysOff: input.days_off ?? [],
      enoughTravelTime: true,
      openSeatsOnly: input.open_seats_only ?? false,
      respectBlocks: false,
      credits: {
        min: input.min_credits ?? null,
        max: input.max_credits ?? null,
      },
    },
    rankBy: { preset: rankBy },
    blocks: [],
    travel: {
      ...DEFAULT_TRAVEL_SETTINGS,
      accessible: input.accessible ?? false,
    },
    limits: { maxResults: 50, maxSteps: MAX_STEPS },
  };
  const depts = [...new Set(codes.map(deptOf))];
  const [seats, campus, ratings] = await Promise.all([
    data.seats(term.id),
    data.campus(),
    inBatches(depts, 8, (d) => data.planetTerpDept(d)),
  ]);
  const list = [...courses.values()];
  const index = buildCatalogIndex(term.id, list);
  const result = generatePlans(request, {
    index,
    seats,
    campus,
    quality: sectionQuality(
      list,
      ratings.filter((r): r is PlanetTerpDept => r !== null),
    ),
  });

  const limit = input.limit ?? 5;
  const schedules = result.results.slice(0, limit).map((plan, i) => {
    const refs = plan.sections.flatMap((k) => {
      const ref = index.sections.get(k);
      return ref ? [ref] : [];
    });
    const week = scheduleWeek(refs);
    const s = plan.stats;
    return {
      rank: i + 1,
      sections: plan.sections,
      leftOut: plan.skipped,
      credits: s.credits,
      daysOnCampus: s.daysOnCampus,
      firstClass: s.firstClass === null ? null : formatTime(s.firstClass),
      lastClassEnds: s.lastClass === null ? null : formatTime(s.lastClass),
      averageRating: s.avgRating === null ? null : round(s.avgRating, 2),
      averageGpa: s.avgGpa === null ? null : round(s.avgGpa, 2),
      fewestOpenSeats: s.fewestOpenSeats,
      sameTimesAlso: plan.equivalents.byCourse.map(
        (e) => `${e.courseCode}: ${e.sectionCodes.join(", ")}`,
      ),
      week: week.week,
      untimed: week.untimed,
    };
  });
  return {
    term: termRef(term.id),
    rankedBy: RANK_WORDS[rankBy],
    found: result.totalFound,
    searchCutShort: result.truncated,
    schedules,
    ...(schedules.length === 0
      ? {
          wouldHelp: result.relaxations
            .slice(0, 5)
            .map(
              (r) =>
                `${r.label}: ${r.unlockCount}${r.atLeast ? "+" : ""} schedules`,
            ),
          closest: result.nearMisses.map((m) => ({
            sections: m.sections,
            leftOut: m.skipped,
            conflicts: m.conflicts.map((c) => messageText(c.message)),
          })),
        }
      : {}),
    note: "Every schedule leaves enough time to walk between buildings. Sections in sameTimesAlso meet at the same times and could swap in. Check a pick with umd_check_schedule before registering.",
  };
}
