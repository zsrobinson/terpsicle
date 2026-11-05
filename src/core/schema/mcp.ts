import { z } from "zod";
import { DAYS, RankFactorSchema } from "./primitives";

// The MCP server's tool inputs (docs/MCP.md): what an agent may send each
// tool, with the words its client shows it. Codes and terms stay strings
// here so a mistake gets the tool's own error, which says what to write
// instead, rather than the SDK's validation message.

export const McpTermSchema = z
  .string()
  .max(20)
  .optional()
  .describe(
    'Term name ("Fall 2027") or id (YYYYMM). Omit for the term students are registering for now.',
  );
export const McpCourseCodeSchema = z
  .string()
  .min(1)
  .max(12)
  .describe("Course code, like CMSC351 or ENGL101.");
export const McpDetailSchema = z
  .enum(["concise", "full"])
  .optional()
  .describe('"concise" (default) or "full" for every field.');

/** Sections to fit around: one per course, in the term. */
export const McpFitsWithSchema = z
  .array(z.string().max(20))
  .max(12)
  .optional()
  .describe(
    'Section keys to fit around, one per course: ["CMSC351-0101", "ARTT210-0101"]. Keeps only sections that don\'t overlap them and leave enough time to walk between buildings (a tight walk still fits; umd_check_schedule flags it).',
  );
export const McpDaysOffSchema = z
  .array(z.enum(DAYS))
  .max(6)
  .optional()
  .describe(
    "Days with no classes: M, Tu, W, Th, F. Sections with no set times pass.",
  );
export const McpPaceSchema = z
  .enum(["slower", "typical", "faster"])
  .optional()
  .describe(
    "Walking pace for travel time: slower 2.5 mph, typical 3.0 (default), faster 3.5. Use faster when the person says they walk fast.",
  );
export const McpAccessibleSchema = z
  .boolean()
  .optional()
  .describe("Use Accessible routes for walking times.");

export const ListTermsInputSchema = z.object({});
export type ListTermsInput = z.infer<typeof ListTermsInputSchema>;

export const ListDepartmentsInputSchema = z.object({ term: McpTermSchema });
export type ListDepartmentsInput = z.infer<typeof ListDepartmentsInputSchema>;

export const SearchCoursesInputSchema = z.object({
  query: z
    .string()
    .max(100)
    .optional()
    .describe("Words in the title, or a code or code prefix."),
  term: McpTermSchema,
  dept: z.string().max(4).optional().describe("Department code, like CMSC."),
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
  fits_with: McpFitsWithSchema,
  days_off: McpDaysOffSchema,
  pace: McpPaceSchema,
  accessible: McpAccessibleSchema,
  limit: z.number().int().min(1).max(50).optional().describe("Default 15."),
  offset: z.number().int().min(0).max(500).optional(),
});
export type SearchCoursesInput = z.infer<typeof SearchCoursesInputSchema>;

export const GetCourseInputSchema = z.object({
  course_code: McpCourseCodeSchema,
  term: McpTermSchema,
  detail: McpDetailSchema,
});
export type GetCourseInput = z.infer<typeof GetCourseInputSchema>;

export const GetSectionsInputSchema = z.object({
  course_code: McpCourseCodeSchema,
  term: McpTermSchema,
  open_only: z
    .boolean()
    .optional()
    .describe("Only sections with an open seat now."),
  instructor: z
    .string()
    .max(60)
    .optional()
    .describe("Part of an instructor's name."),
  detail: McpDetailSchema,
  fits_with: McpFitsWithSchema,
  fits_only: z
    .boolean()
    .optional()
    .describe(
      "With fits_with: only sections that fit (default: all, each labeled).",
    ),
  days_off: McpDaysOffSchema,
  pace: McpPaceSchema,
  accessible: McpAccessibleSchema,
  limit: z.number().int().min(1).max(100).optional().describe("Default 40."),
  offset: z.number().int().min(0).optional(),
});
export type GetSectionsInput = z.infer<typeof GetSectionsInputSchema>;

export const CheckOfferingsInputSchema = z.object({
  courses: z
    .array(McpCourseCodeSchema)
    .min(1)
    .max(25)
    .describe("Course codes."),
  terms: z
    .array(z.string().max(20))
    .max(10)
    .optional()
    .describe('Term ids or names, any year ("Fall 2028").'),
});
export type CheckOfferingsInput = z.infer<typeof CheckOfferingsInputSchema>;

export const CourseHistoryInputSchema = z.object({
  course_code: McpCourseCodeSchema,
  limit: z
    .number()
    .int()
    .min(1)
    .max(80)
    .optional()
    .describe("Terms to list, newest first. Default 24."),
});
export type CourseHistoryInput = z.infer<typeof CourseHistoryInputSchema>;

export const FindInstructorsInputSchema = z.object({
  name: z
    .string()
    .min(2)
    .max(60)
    .describe('Part of a name: "kruskal", "justin w".'),
  limit: z.number().int().min(1).max(25).optional().describe("Default 10."),
});
export type FindInstructorsInput = z.infer<typeof FindInstructorsInputSchema>;

export const GetInstructorInputSchema = z.object({
  instructor: z
    .string()
    .min(2)
    .max(80)
    .describe("A PlanetTerp slug from umd_find_instructors, or a full name."),
});
export type GetInstructorInput = z.infer<typeof GetInstructorInputSchema>;

export const CheckScheduleInputSchema = z.object({
  sections: z
    .array(z.string().max(20))
    .min(1)
    .max(12)
    .describe(
      'Section keys, one per course: ["CMSC351-0101", "MATH240-0212"].',
    ),
  term: McpTermSchema,
  name: z
    .string()
    .max(60)
    .optional()
    .describe('The schedule\'s name in its share link (default "Schedule").'),
  pace: McpPaceSchema,
  accessible: McpAccessibleSchema,
});
export type CheckScheduleInput = z.infer<typeof CheckScheduleInputSchema>;

export const GenerateSchedulesInputSchema = z.object({
  courses: z
    .array(
      z.object({
        code: McpCourseCodeSchema,
        required: z
          .boolean()
          .optional()
          .describe("Default true. Optional courses are added when they fit."),
        sections: z
          .array(z.string().max(12))
          .max(40)
          .optional()
          .describe('Only these section codes ("0101").'),
      }),
    )
    .min(1)
    .max(10),
  term: McpTermSchema,
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
  pace: McpPaceSchema,
  accessible: McpAccessibleSchema,
  limit: z
    .number()
    .int()
    .min(1)
    .max(10)
    .optional()
    .describe("Schedules to return. Default 5."),
});
export type GenerateSchedulesInput = z.infer<
  typeof GenerateSchedulesInputSchema
>;
