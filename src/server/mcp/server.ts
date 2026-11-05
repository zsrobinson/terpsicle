// The MCP server's tools (docs/MCP.md): Terpsicle's public data for
// agents. Every tool only reads what /data already serves, so each is
// read-only, idempotent and closed-world. Answers are compact JSON as
// text: no outputSchema, since a schema per tool would cost more in every
// tools/list than it saves, and the JSON is self-describing.
import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { DAYS, GEN_ED_LABELS, RankFactorSchema } from "~/core/schema";
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
export const MCP_SERVER_VERSION = "1.0.0";

export const MCP_INSTRUCTIONS = `Terpsicle's public data on University of Maryland (College Park) courses, from Testudo's Schedule of Classes, Terpsicle's history of past terms and PlanetTerp's ratings and grades. No sign-in; read-only.

How the tools fit:
- Start with umd_search_courses (by words, department, gen-ed, level) or umd_get_course when you know the code.
- umd_get_sections gives meeting times, rooms, instructors and live seats for one course in one term.
- umd_check_offerings says whether courses are likely to run in future terms (from past offering patterns): use it for multi-semester plans.
- umd_course_history lists who taught a course in each past term; umd_find_instructors and umd_get_instructor cover instructors.
- umd_generate_schedules builds conflict-free weekly schedules from a list of courses; umd_check_schedule checks a set of sections you picked.

Formats:
- Terms: a name like "Fall 2027", or an id YYYYMM: the year, then 01 spring, 05 summer, 08 fall or 12 winter. A winter id has the year it starts in, so Winter 2027 is 2026 then 12. Every answer names terms both ways. Omit the term to use the one students are registering for now (umd_list_terms says which).
- Courses: CMSC351, ENGL101, CMSC250H. Sections: CMSC351-0101.
- Gen-eds: ${Object.entries(GEN_ED_LABELS)
  .map(([c, l]) => `${c} ${l}`)
  .join(", ")}.

Good to know: only terms Testudo lists have sections and seats. Seats refresh every 5 minutes. Offering patterns are a guide from the last eight school years, not a promise. PlanetTerp's grades stop at its latest term; ratings are student reviews.`;

const ANNOTATIONS = {
  readOnlyHint: true,
  idempotentHint: true,
  openWorldHint: false,
} as const;

const term = z
  .string()
  .max(20)
  .optional()
  .describe(
    'Term name ("Fall 2027") or id (YYYYMM). Omit for the term students are registering for now.',
  );
const courseCode = z
  .string()
  .min(1)
  .max(12)
  .describe("Course code, like CMSC351 or ENGL101.");
const detail = z
  .enum(["concise", "full"])
  .optional()
  .describe('"concise" (default) or "full" for every field.');

type Answer = { content: { type: "text"; text: string }[]; isError?: boolean };

/** A tool's answer: compact JSON, or the input error in words the agent can act on. */
async function answer(run: () => Promise<unknown>): Promise<Answer> {
  try {
    const value = await run();
    return { content: [{ type: "text", text: JSON.stringify(value) }] };
  } catch (error) {
    const text =
      error instanceof ToolInputError
        ? error.message
        : `Something went wrong reading Terpsicle's data: ${error instanceof Error ? error.message : String(error)}. Try again in a moment.`;
    return { content: [{ type: "text", text }], isError: true };
  }
}

export function buildMcpServer(data: McpData, now: () => Date): McpServer {
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
      inputSchema: z.object({}),
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
      inputSchema: z.object({ term }),
      annotations: ANNOTATIONS,
    },
    (args) => answer(() => listDepartments(data, args)),
  );

  server.registerTool(
    "umd_search_courses",
    {
      title: "Search courses",
      description:
        'Find courses in a term by words (title or code: "machine learning", "CMSC4"), department, gen-ed, level or credits. Each result has its credits, gen-eds, section count, sections with open seats and instructors with PlanetTerp ratings. Matching courses the term doesn\'t have come back separately in notOfferedThisTerm, with when they usually run. Results are best match first; page with offset.',
      inputSchema: z.object({
        query: z
          .string()
          .max(100)
          .optional()
          .describe("Words in the title, or a code or code prefix."),
        term,
        dept: z
          .string()
          .max(4)
          .optional()
          .describe("Department code, like CMSC."),
        gen_eds: z
          .array(z.string().max(4))
          .max(4)
          .optional()
          .describe(
            "Gen-ed codes the course must count for, all of them (DSHU, SCIS).",
          ),
        level: z
          .number()
          .int()
          .multipleOf(100)
          .min(100)
          .max(800)
          .optional()
          .describe("Course level: 100 for 100-level, 400 for 400-level."),
        credits: z
          .number()
          .min(0)
          .max(20)
          .optional()
          .describe("Courses that can be taken for this many credits."),
        open_seats_only: z
          .boolean()
          .optional()
          .describe("Only courses with a section that has an open seat now."),
        include_not_offered: z
          .boolean()
          .optional()
          .describe(
            "Also list up to 5 matching courses this term doesn't have (default true).",
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .describe("Default 15."),
        offset: z.number().int().min(0).max(500).optional(),
      }),
      annotations: ANNOTATIONS,
    },
    (args) => answer(() => searchCoursesAnswer(data, args)),
  );

  server.registerTool(
    "umd_get_course",
    {
      title: "Get a course",
      description:
        "Everything about one course: description, credits, gen-eds, prerequisites (Testudo's words and the courses they name), restrictions, cross-listings, the term's sections and instructors in short, when it's usually offered (\"Fall only\", \"Every other spring\", with the last and next likely term), and PlanetTerp's grades (average GPA, % A or B) overall and by instructor. Works for courses not offered in the term too.",
      inputSchema: z.object({ course_code: courseCode, term, detail }),
      annotations: ANNOTATIONS,
    },
    (args) => answer(() => getCourse(data, args)),
  );

  server.registerTool(
    "umd_get_sections",
    {
      title: "Get sections",
      description:
        'A course\'s sections in a term: key (CMSC351-0101), instructors with ratings, delivery, each meeting ("MWF 10am–10:50am · IRB 0324"), live seats (open, total, waitlist), non-standard dates and restrictions. Filter to open sections or an instructor.',
      inputSchema: z.object({
        course_code: courseCode,
        term,
        open_only: z
          .boolean()
          .optional()
          .describe("Only sections with an open seat now."),
        instructor: z
          .string()
          .max(60)
          .optional()
          .describe("Part of an instructor's name."),
        detail,
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe("Default 40."),
        offset: z.number().int().min(0).optional(),
      }),
      annotations: ANNOTATIONS,
    },
    (args) => answer(() => getSections(data, args)),
  );

  server.registerTool(
    "umd_check_offerings",
    {
      title: "Check when courses are offered",
      description:
        'For each course, whether it runs in each term: "yes"/"no" for terms Testudo lists, and "likely"/"unlikely"/"unknown" for later terms, read from its offering pattern over the last eight school years (every semester, fall only, every other spring, …). Use it to plan which semester to take a course in. Without terms, asks about the listed falls and springs and the next four.',
      inputSchema: z.object({
        courses: z.array(courseCode).min(1).max(25).describe("Course codes."),
        terms: z
          .array(z.string().max(20))
          .max(10)
          .optional()
          .describe('Term ids or names, any year ("Fall 2028").'),
      }),
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
      inputSchema: z.object({
        course_code: courseCode,
        limit: z
          .number()
          .int()
          .min(1)
          .max(80)
          .optional()
          .describe("Terms to list, newest first. Default 24."),
      }),
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
      inputSchema: z.object({
        name: z
          .string()
          .min(2)
          .max(60)
          .describe('Part of a name: "kruskal", "justin w".'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(25)
          .optional()
          .describe("Default 10."),
      }),
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
      inputSchema: z.object({
        instructor: z
          .string()
          .min(2)
          .max(80)
          .describe(
            "A PlanetTerp slug from umd_find_instructors, or a full name.",
          ),
      }),
      annotations: ANNOTATIONS,
    },
    (args) => answer(() => getInstructor(data, args)),
  );

  server.registerTool(
    "umd_check_schedule",
    {
      title: "Check a schedule",
      description:
        'Check a set of sections as one weekly schedule, the way Terpsicle\'s scheduler does: overlapping classes, too little time to walk between buildings, full or restricted sections, sections without set times. Gives the week day by day, total credits, each problem and a suggested fix ("Switch to CMSC351 0201").',
      inputSchema: z.object({
        sections: z
          .array(z.string().max(20))
          .min(1)
          .max(12)
          .describe(
            'Section keys, one per course: ["CMSC351-0101", "MATH240-0212"].',
          ),
        term,
        accessible: z
          .boolean()
          .optional()
          .describe("Use Accessible routes for walking times."),
      }),
      annotations: ANNOTATIONS,
    },
    (args) => answer(() => checkScheduleAnswer(data, args, now())),
  );

  server.registerTool(
    "umd_generate_schedules",
    {
      title: "Generate schedules",
      description:
        "Build the best conflict-free weekly schedules from a list of courses, with Terpsicle's generator: no overlaps, enough time to walk between buildings, and your limits (earliest start, latest end, days off, open seats only, credits). Ranked by one preference. Optional courses go in when they fit. When nothing fits, says which limit to loosen and the closest schedules.",
      inputSchema: z.object({
        courses: z
          .array(
            z.object({
              code: courseCode,
              required: z
                .boolean()
                .optional()
                .describe(
                  "Default true. Optional courses are added when they fit.",
                ),
              sections: z
                .array(z.string().max(12))
                .max(40)
                .optional()
                .describe('Only these section codes ("0101").'),
            }),
          )
          .min(1)
          .max(10),
        term,
        earliest_start: z
          .string()
          .max(10)
          .optional()
          .describe('No class before this: "10am".'),
        latest_end: z
          .string()
          .max(10)
          .optional()
          .describe('No class after this: "5pm".'),
        days_off: z
          .array(z.enum(DAYS))
          .max(5)
          .optional()
          .describe("Days with no classes: M, Tu, W, Th, F."),
        open_seats_only: z.boolean().optional(),
        min_credits: z.number().min(0).max(30).optional(),
        max_credits: z.number().min(0).max(30).optional(),
        rank_by: RankFactorSchema.optional().describe(
          "compact (default, fewest gaps), fewer-days, later-starts, best-rated, higher-gpa or safest-seats.",
        ),
        accessible: z
          .boolean()
          .optional()
          .describe("Use Accessible routes for walking times."),
        limit: z
          .number()
          .int()
          .min(1)
          .max(10)
          .optional()
          .describe("Schedules to return. Default 5."),
      }),
      annotations: ANNOTATIONS,
    },
    (args) => answer(() => generateSchedules(data, args)),
  );

  return server;
}
