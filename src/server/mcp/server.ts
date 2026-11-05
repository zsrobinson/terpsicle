// The MCP server's tools (docs/MCP.md): Terpsicle's public data for
// agents. Every tool only reads what /data already serves, so each is
// read-only, idempotent and closed-world. Answers are compact JSON as
// text: no outputSchema, since a schema per tool would cost more in every
// tools/list than it saves, and the JSON is self-describing.
import { McpServer } from "@modelcontextprotocol/server";
import { GEN_ED_LABELS } from "~/core/schema";
import {
  CheckOfferingsInputSchema,
  CheckScheduleInputSchema,
  CourseHistoryInputSchema,
  FindInstructorsInputSchema,
  GenerateSchedulesInputSchema,
  GetCourseInputSchema,
  GetInstructorInputSchema,
  GetSectionsInputSchema,
  ListDepartmentsInputSchema,
  ListTermsInputSchema,
  SearchCoursesInputSchema,
} from "~/core/schema/mcp";
import {
  getCourse,
  getSections,
  listDepartments,
  listTerms,
  searchCoursesAnswer,
} from "./answers/catalog";
import { findInstructors, getInstructor } from "./answers/instructors";
import { checkOfferings, courseHistory } from "./answers/offerings";
import { checkScheduleAnswer, generateSchedules } from "./answers/schedule";
import type { McpData } from "./data";
import { ToolInputError } from "./lookup";

export const MCP_SERVER_NAME = "terpsicle";
export const MCP_SERVER_VERSION = "1.1.0";

export const MCP_INSTRUCTIONS = `Terpsicle's public data on University of Maryland (College Park) courses, from Testudo's Schedule of Classes, Terpsicle's history of past terms and PlanetTerp's ratings and grades. No sign-in; read-only.

How the tools fit:
- Start with umd_search_courses (by words, department, gen-ed, level) or umd_get_course when you know the code.
- umd_get_sections gives meeting times, rooms, instructors and live seats for one course in one term.
- umd_check_offerings says whether courses are likely to run in future terms (from past offering patterns): use it for multi-semester plans.
- umd_course_history lists who taught a course in each past term; umd_find_instructors and umd_get_instructor cover instructors.
- umd_generate_schedules builds conflict-free weekly schedules from a list of courses; umd_check_schedule checks a set of sections you picked. Both give a shareUrl that opens the schedule in Terpsicle.
- To find what fits around classes someone already has, pass their sections as fits_with to umd_search_courses (with dept or level) or umd_get_sections; days_off limits the days.

Formats:
- Terms: a name like "Fall 2027", or an id YYYYMM: the year, then 01 spring, 05 summer, 08 fall or 12 winter. A winter id has the year it starts in, so Winter 2027 is 2026 then 12. Every answer names terms both ways. Omit the term to use the one students are registering for now (umd_list_terms says which).
- Courses: CMSC351, ENGL101, CMSC250H. Sections: CMSC351-0101.
- Gen-eds: ${Object.entries(GEN_ED_LABELS)
  .map(([c, l]) => `${c} ${l}`)
  .join(", ")}.

Good to know: only terms Testudo lists have sections and seats. Seat counts are Testudo's own, as of the time in seatCounts.asOf (Eastern): quote them with that time. Offering patterns are a guide from the last eight school years, not a promise. PlanetTerp's grades stop at its latest term; ratings are student reviews.`;

const ANNOTATIONS = {
  readOnlyHint: true,
  idempotentHint: true,
  openWorldHint: false,
} as const;

type Answer = { content: { type: "text"; text: string }[]; isError?: boolean };

/** A tool's answer: compact JSON, or the input error in words the agent can act on. */
async function answer(run: () => Promise<unknown>): Promise<Answer> {
  try {
    const value = await run();
    return { content: [{ type: "text", text: JSON.stringify(value) }] };
  } catch (error) {
    // An input mistake says what to change; anything else (R2, the SDK) is
    // ours, and its details stay in the logs.
    if (!(error instanceof ToolInputError))
      console.error("mcp tool failed", error);
    const text =
      error instanceof ToolInputError
        ? error.message
        : "Terpsicle's data didn't load just now. Try again in a minute.";
    return { content: [{ type: "text", text }], isError: true };
  }
}

export function buildMcpServer(
  data: McpData,
  now: () => Date,
  origin: string,
): McpServer {
  const server = new McpServer(
    { name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION, title: "Terpsicle" },
    {
      instructions: MCP_INSTRUCTIONS,
      maxToolInputElements: 400,
      cacheHints: {
        "tools/list": { ttlMs: 3_600_000, cacheScope: "public" },
      },
    },
  );

  server.registerTool(
    "umd_list_terms",
    {
      title: "List terms",
      description:
        "The terms Testudo lists now (the only ones with sections and seats), which one is the default, each term's academic calendar (first and last day of classes, breaks), how far back the course history goes, and how current PlanetTerp's grades are. Call this first when the term matters.",
      inputSchema: ListTermsInputSchema,
      annotations: ANNOTATIONS,
    },
    () => answer(() => listTerms(data)),
  );

  server.registerTool(
    "umd_list_departments",
    {
      title: "List departments",
      description:
        'Every department in a term: its 4-letter code, name and course count ("CMSC Computer Science (152 courses)"). Use it to find a department\'s code.',
      inputSchema: ListDepartmentsInputSchema,
      annotations: ANNOTATIONS,
    },
    (args) => answer(() => listDepartments(data, args)),
  );

  server.registerTool(
    "umd_search_courses",
    {
      title: "Search courses",
      description:
        'Find courses in a term by words (title or code: "machine learning", "CMSC4"), department, gen-ed, level or credits. Each result has its credits, gen-eds, section count, sections with open seats and instructors with PlanetTerp ratings. Matching courses the term doesn\'t have come back separately in notOfferedThisTerm, with when they usually run. With fits_with (section keys someone already has), keeps only courses with a section that fits around them, listed in fittingSections; days_off keeps only sections that meet on none of those days. Results are best match first; page with offset.',
      inputSchema: SearchCoursesInputSchema,
      annotations: ANNOTATIONS,
    },
    (args) => answer(() => searchCoursesAnswer(data, args, now())),
  );

  server.registerTool(
    "umd_get_course",
    {
      title: "Get a course",
      description:
        "Everything about one course: description, credits, gen-eds, prerequisites (Testudo's words and the courses they name), restrictions, cross-listings, the term's sections and instructors in short, when it's usually offered (\"Fall only\", \"Every other spring\", with the last and next likely term), and PlanetTerp's grades (average GPA, % A or B) overall and by instructor. Works for courses not offered in the term too.",
      inputSchema: GetCourseInputSchema,
      annotations: ANNOTATIONS,
    },
    (args) => answer(() => getCourse(data, args)),
  );

  server.registerTool(
    "umd_get_sections",
    {
      title: "Get sections",
      description:
        'A course\'s sections in a term: key (CMSC351-0101), instructors with ratings, delivery, each meeting ("MWF 10am–10:50am · IRB 0324"), live seats (status words like "Full · 9 waitlisted", with open, total, and waitlist and holdfile, which are null when Testudo doesn\'t show that count; seats is null when Testudo shows none), non-standard dates and restrictions. With fits_with, each section says whether it fits around those sections ("Fits", "Overlaps CMSC330", "Not enough time after ARTT210"). Filter to open sections, an instructor, days_off or fits_only.',
      inputSchema: GetSectionsInputSchema,
      annotations: ANNOTATIONS,
    },
    (args) => answer(() => getSections(data, args, now())),
  );

  server.registerTool(
    "umd_check_offerings",
    {
      title: "Check when courses are offered",
      description:
        'For each course, whether it runs in each term: "yes"/"no" for terms Testudo lists, and "likely"/"unlikely"/"unknown" for later terms, read from its offering pattern over the last eight school years (every semester, fall only, every other spring, …). Use it to plan which semester to take a course in. Without terms, asks about the listed falls and springs and the next four.',
      inputSchema: CheckOfferingsInputSchema,
      annotations: ANNOTATIONS,
    },
    (args) => answer(() => checkOfferings(data, args)),
  );

  server.registerTool(
    "umd_course_history",
    {
      title: "Course history",
      description:
        "Who taught a course in each past term on record, newest first (back to 2012 for many courses), with how many sections ran. Use it to see who usually teaches a course and how often it runs.",
      inputSchema: CourseHistoryInputSchema,
      annotations: ANNOTATIONS,
    },
    (args) => answer(() => courseHistory(data, args)),
  );

  server.registerTool(
    "umd_find_instructors",
    {
      title: "Find instructors",
      description:
        "Instructors whose name has every word given, most reviewed first, with their PlanetTerp slug and departments. Pass a slug to umd_get_instructor.",
      inputSchema: FindInstructorsInputSchema,
      annotations: ANNOTATIONS,
    },
    (args) => answer(() => findInstructors(data, args)),
  );

  server.registerTool(
    "umd_get_instructor",
    {
      title: "Get an instructor",
      description:
        "One instructor: PlanetTerp rating and review count, what they teach in the terms Testudo lists, every course they've taught on record, and their grades by course (average GPA, % A or B).",
      inputSchema: GetInstructorInputSchema,
      annotations: ANNOTATIONS,
    },
    (args) => answer(() => getInstructor(data, args)),
  );

  server.registerTool(
    "umd_check_schedule",
    {
      title: "Check a schedule",
      description:
        'Check a set of sections as one weekly schedule, the way Terpsicle\'s scheduler does: overlapping classes, too little time to walk between buildings, full or restricted sections, sections without set times. Gives the week day by day, total credits, each problem and a suggested fix ("Switch to CMSC351 0201"), and a shareUrl that opens the schedule in Terpsicle (read-only, with Save a copy). Walking times are at a typical 3.0 mph unless pace says otherwise.',
      inputSchema: CheckScheduleInputSchema,
      annotations: ANNOTATIONS,
    },
    (args) => answer(() => checkScheduleAnswer(data, args, now(), origin)),
  );

  server.registerTool(
    "umd_generate_schedules",
    {
      title: "Generate schedules",
      description:
        "Build the best conflict-free weekly schedules from a list of courses, with Terpsicle's generator: no overlaps, enough time to walk between buildings, and your limits (earliest start, latest end, days off, open seats only, credits). Ranked by one preference. Optional courses go in when they fit. When nothing fits, says which limit to loosen and the closest schedules. Each schedule has a shareUrl that opens it in Terpsicle.",
      inputSchema: GenerateSchedulesInputSchema,
      annotations: ANNOTATIONS,
    },
    (args) => answer(() => generateSchedules(data, args, now(), origin)),
  );

  return server;
}
