import { z } from "zod";
import { BlockSchema } from "./local";
import {
  CourseCodeSchema,
  DaySchema,
  DaysSchema,
  MinutesSchema,
  SectionCodeSchema,
  SectionKeySchema,
  TermIdSchema,
} from "./primitives";
import { MessageSchema } from "./problems";
import { TravelSettingsSchema } from "./travel";

// Generator input and output (SPEC §3.9, recipe in RESEARCH §2). Runs in the Web Worker.

// ---------- request ----------

const GenCourseFields = {
  courseCode: CourseCodeSchema,
  /** Restrict to these sections; omitted means every section. */
  sections: z.array(SectionCodeSchema).min(1).optional(),
};

export const GenCourseSchema = z.object(GenCourseFields);
export type GenCourse = z.infer<typeof GenCourseSchema>;

/** A requested course, or a "pick N of these" group. */
export const GenItemSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("course"),
    required: z.boolean(),
    ...GenCourseFields,
  }),
  z
    .object({
      kind: z.literal("pick"),
      /** Local id so the form can key it. */
      id: z.string().min(1),
      /** Exactly this many of `courses` go in every result. */
      count: z.number().int().min(1),
      courses: z.array(GenCourseSchema).min(2),
    })
    .refine((g) => g.count <= g.courses.length, {
      message: "count exceeds the courses listed",
      path: ["count"],
    }),
]);
export type GenItem = z.infer<typeof GenItemSchema>;

export const MustHavesSchema = z.object({
  /** No meeting starts before this. null: no limit. */
  earliestStart: MinutesSchema.nullable(),
  /** No meeting ends after this. null: no limit. */
  latestEnd: MinutesSchema.nullable(),
  daysOff: DaysSchema,
  /** Reject "not enough time" connections (tight is allowed). On by default. */
  enoughTravelTime: z.boolean(),
  openSeatsOnly: z.boolean(),
  /** Treat the term's blocks as busy. On by default. */
  respectBlocks: z.boolean(),
  credits: z.object({
    min: z.number().min(0).nullable(),
    max: z.number().min(0).nullable(),
  }),
});
export type MustHaves = z.infer<typeof MustHavesSchema>;

export const DEFAULT_MUST_HAVES: MustHaves = {
  earliestStart: null,
  latestEnd: null,
  daysOff: [],
  enoughTravelTime: true,
  openSeatsOnly: false,
  respectBlocks: true,
  credits: { min: null, max: null },
};

/** Each preset ranks by one factor; "custom" mixes them with weights. */
export const RankFactorSchema = z.enum([
  "compact",
  "fewer-days",
  "later-starts",
  "best-rated",
  "higher-gpa",
  "safest-seats",
]);
export type RankFactor = z.infer<typeof RankFactorSchema>;

/** Every factor, 0–1. */
export const RankWeightsSchema = z.record(
  RankFactorSchema,
  z.number().min(0).max(1),
);
export type RankWeights = z.infer<typeof RankWeightsSchema>;

export const RankBySchema = z.discriminatedUnion("preset", [
  z.object({ preset: RankFactorSchema }),
  z.object({ preset: z.literal("custom"), weights: RankWeightsSchema }),
]);
export type RankBy = z.infer<typeof RankBySchema>;

export const GenerateLimitsSchema = z.object({
  /** "Showing the best 200". */
  maxResults: z.number().int().min(1).max(1000),
  /** DFS step budget. */
  maxSteps: z.number().int().min(1),
});
export type GenerateLimits = z.infer<typeof GenerateLimitsSchema>;

export const DEFAULT_GENERATE_LIMITS: GenerateLimits = {
  maxResults: 200,
  maxSteps: 500_000,
};

/** The worker already holds the catalog and seats; this is only what the person chose. */
export const GenerateRequestSchema = z.object({
  termId: TermIdSchema,
  items: z.array(GenItemSchema).min(1),
  mustHaves: MustHavesSchema,
  rankBy: RankBySchema,
  /** The term's blocks; used when `mustHaves.respectBlocks`. */
  blocks: z.array(BlockSchema),
  travel: TravelSettingsSchema,
  limits: GenerateLimitsSchema,
});
export type GenerateRequest = z.infer<typeof GenerateRequestSchema>;

// ---------- result ----------

/** Per factor, normalized 0–1 (higher is better); `score` is their weighted sum. */
export const ScoreBreakdownSchema = z.record(
  RankFactorSchema,
  z.number().min(0).max(1),
);
export type ScoreBreakdown = z.infer<typeof ScoreBreakdownSchema>;

export const PlanStatsSchema = z.object({
  credits: z.number().min(0),
  daysOnCampus: z.number().int().min(0).max(7),
  /** Earliest start across the week; null when nothing is timed. */
  firstClass: MinutesSchema.nullable(),
  lastClass: MinutesSchema.nullable(),
  /** Mean PlanetTerp rating of the chosen sections' instructors; null when none rated. */
  avgRating: z.number().min(1).max(5).nullable(),
  avgGpa: z.number().min(0).max(4).nullable(),
  /** Smallest open-seat count among chosen sections; null when no counts are known. */
  fewestOpenSeats: z.number().int().min(0).nullable(),
});
export type PlanStats = z.infer<typeof PlanStatsSchema>;

/** Time-identical alternatives merged into one result ("×3 equivalent"). */
export const EquivalentsSchema = z.object({
  /** Product of alternatives across courses; 1 when nothing merged. */
  count: z.number().int().min(1),
  /** Only courses with more than one interchangeable section, section-number order. */
  byCourse: z.array(
    z.object({
      courseCode: CourseCodeSchema,
      sectionCodes: z.array(SectionCodeSchema).min(2),
    }),
  ),
});
export type Equivalents = z.infer<typeof EquivalentsSchema>;

export const GeneratedPlanSchema = z.object({
  /** Sorted section keys joined with ","; stable across runs. */
  id: z.string().min(1),
  /** One per included course: the lowest-numbered of each equivalent set. */
  sections: z.array(SectionKeySchema).min(1),
  /** Optional courses (or pick-group courses) left out of this result. */
  skipped: z.array(CourseCodeSchema),
  score: z.number(),
  breakdown: ScoreBreakdownSchema,
  stats: PlanStatsSchema,
  equivalents: EquivalentsSchema,
});
export type GeneratedPlan = z.infer<typeof GeneratedPlanSchema>;

/** A constraint the generator can loosen to suggest a relaxation. */
export const RelaxableSchema = z.enum([
  "earliest-start",
  "latest-end",
  "days-off",
  "enough-travel-time",
  "open-seats-only",
  "respect-blocks",
  "credits",
  "required-course",
  "section-restriction",
]);
export type Relaxable = z.infer<typeof RelaxableSchema>;

/** "Allow classes before 10am → 38 plans". Applying it merges `patch` into the request. */
export const RelaxationSchema = z.object({
  constraint: RelaxableSchema,
  label: z.string().min(1),
  unlockCount: z.number().int().min(1),
  /** The what-if search hit its budget: at least `unlockCount` plans ("38+ plans"). */
  atLeast: z.boolean(),
  patch: z.object({
    mustHaves: MustHavesSchema.partial().optional(),
    /** Make this required course optional. */
    makeOptional: CourseCodeSchema.optional(),
    /** Drop this course's section restriction. */
    allowAllSections: CourseCodeSchema.optional(),
  }),
});
export type Relaxation = z.infer<typeof RelaxationSchema>;

export const NearMissConflictSchema = z.object({
  kind: z.enum(["overlap", "not-enough-time", "must-have"]),
  sectionKeys: z.array(SectionKeySchema).min(1),
  /** Which must-have, when kind is "must-have". */
  constraint: RelaxableSchema.optional(),
  day: DaySchema.optional(),
  message: MessageSchema,
});
export type NearMissConflict = z.infer<typeof NearMissConflictSchema>;

/** A closest-to-working plan when nothing fits, with its conflicts marked. */
export const NearMissSchema = z.object({
  sections: z.array(SectionKeySchema).min(1),
  skipped: z.array(CourseCodeSchema),
  conflicts: z.array(NearMissConflictSchema).min(1),
});
export type NearMiss = z.infer<typeof NearMissSchema>;

export const GenerateResultSchema = z.object({
  /** Best first; at most `limits.maxResults`. */
  results: z.array(GeneratedPlanSchema),
  /** Distinct merged results found before stopping. */
  totalFound: z.number().int().min(0),
  /** Stopped at the step or result budget, so better plans may exist. */
  truncated: z.boolean(),
  steps: z.number().int().min(0),
  /** Filled when results are empty (and may be when few), most unlocks first. */
  relaxations: z.array(RelaxationSchema),
  nearMisses: z.array(NearMissSchema),
});
export type GenerateResult = z.infer<typeof GenerateResultSchema>;

/** Posted by the worker while searching. */
export const GenerateProgressSchema = z.object({
  steps: z.number().int().min(0),
  found: z.number().int().min(0),
});
export type GenerateProgress = z.infer<typeof GenerateProgressSchema>;
