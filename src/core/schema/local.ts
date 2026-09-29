import { z } from "zod";
import { SectionSnapshotSchema } from "./catalog";
import {
  CourseCodeSchema,
  CourseDetailsTabSchema,
  DaysSchema,
  ENDS_AFTER_START,
  endsAfterStart,
  IsoDateTimeSchema,
  LocalIdSchema,
  MinutesSchema,
  SavedRailTabSchema,
  SectionCodeSchema,
  SectionKeySchema,
  TermIdSchema,
} from "./primitives";

// Everything the browser keeps in IndexedDB (Dexie). Tables and versions: docs/DATA.md §5.

// ---------- plans ----------

/**
 * One course in a plan. `sectionCode: null` means saved for later (not placed).
 * A placed course keeps a snapshot of its section as it was when placed, so a
 * later catalog change becomes a "changed" or "cancelled" problem.
 */
export const PlanCourseSchema = z
  .object({
    courseCode: CourseCodeSchema,
    sectionCode: SectionCodeSchema.nullable(),
    snapshot: SectionSnapshotSchema.nullable(),
  })
  .refine((c) => (c.sectionCode === null) === (c.snapshot === null), {
    message:
      "A placed course needs a snapshot and a saved one must not have one",
    path: ["snapshot"],
  });
export type PlanCourse = z.infer<typeof PlanCourseSchema>;

function uniqueCourses(courses: readonly { courseCode: string }[]): boolean {
  return new Set(courses.map((c) => c.courseCode)).size === courses.length;
}

export const PlanNameSchema = z.string().trim().min(1).max(60);

export const PlanSchema = z.object({
  id: LocalIdSchema,
  termId: TermIdSchema,
  name: PlanNameSchema,
  /** Tab position within the term; ascending. */
  order: z.number(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
  /** Display order in the Courses tab. At most one entry per course. */
  courses: z
    .array(PlanCourseSchema)
    .refine(uniqueCourses, { message: "A course appears twice in the plan" }),
  /**
   * The placed sections you've marked Registered in the Register tab, by
   * section key. A registered section isn't a problem for being full,
   * waitlisted or restricted. Absent in plans saved before it existed (and
   * when nothing is registered); keys of sections no longer placed are
   * dropped on the next change.
   */
  registered: z
    .array(SectionKeySchema)
    .max(40)
    .refine((keys) => new Set(keys).size === keys.length, {
      message: "A section is registered twice",
    })
    .optional(),
});
export type Plan = z.infer<typeof PlanSchema>;

/**
 * The Register tab's ticks as localStorage kept them before version 5 of
 * the database moved them into `Plan.registered`: plan id → section keys.
 */
export const LegacyChecklistSchema = z.record(
  z.string(),
  z.array(SectionKeySchema),
);

// ---------- blocks ----------

export const BlockLabelSchema = z.string().trim().min(1).max(40);

/**
 * Labeled busy time. Per term, not per plan: blocks describe your week
 * (work, practice), so every plan and the generator see the same ones.
 * No place, ever (SPEC §3.7).
 */
export const BlockSchema = z
  .object({
    id: LocalIdSchema,
    termId: TermIdSchema,
    label: BlockLabelSchema,
    days: DaysSchema.min(1),
    start: MinutesSchema,
    end: MinutesSchema,
  })
  .refine(endsAfterStart, ENDS_AFTER_START);
export type Block = z.infer<typeof BlockSchema>;

// ---------- course colors ----------

/** Preset palette ids; the UI maps each to light and dark tints. Append only. */
export const COURSE_COLORS = [
  "blue",
  "green",
  "amber",
  "violet",
  "cyan",
  "pink",
  "lime",
  "indigo",
  "orange",
  "teal",
] as const;
export const CourseColorSchema = z.enum(COURSE_COLORS);
export type CourseColor = z.infer<typeof CourseColorSchema>;

/** Global: the same course has the same color in every plan and term. */
export const CourseColorPrefSchema = z.object({
  courseCode: CourseCodeSchema,
  color: CourseColorSchema,
});
export type CourseColorPref = z.infer<typeof CourseColorPrefSchema>;

// ---------- UI prefs and settings ----------

/** What the sidebar is drilled into. Generated results aren't persisted, so they aren't restorable. */
export const DrillTargetSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("course"),
    courseCode: CourseCodeSchema,
    tab: CourseDetailsTabSchema.optional(),
  }),
  z.object({ kind: z.literal("connection"), connectionId: z.string().min(1) }),
]);
export type DrillTarget = z.infer<typeof DrillTargetSchema>;

/** Where a workbench's phone drawer rests (src/components/workbench/drawer.tsx). */
export type DrawerSnap = "peek" | "half" | "full";

export const ThemeSchema = z.enum(["system", "light", "dark"]);
export type Theme = z.infer<typeof ThemeSchema>;

/** Collapsed instructor group in course details: `${courseCode}|${instructorName}` ("" name = TBA). */
export const CollapsedGroupKeySchema = z
  .string()
  .regex(/^[A-Z]{4}\d{3}[A-Z]?\|/);

/**
 * The desktop sidebar's width, in px (docs/UX-REVIEW.md §1.2, decision 3):
 * dragged between `min` and `max`, and back to `default` on double-click.
 */
export const SIDEBAR_WIDTH = { min: 320, max: 480, default: 360 } as const;

/** A width the sidebar can take: whole pixels, within the limits. */
export function clampSidebarWidth(px: number): number {
  if (!Number.isFinite(px)) return SIDEBAR_WIDTH.default;
  return Math.min(
    SIDEBAR_WIDTH.max,
    Math.max(SIDEBAR_WIDTH.min, Math.round(px)),
  );
}

export const UiPrefsSchema = z.object({
  tab: SavedRailTabSchema,
  /** Clicking the active rail tab collapses the sidebar. */
  sidebarOpen: z.boolean(),
  drill: DrillTargetSchema.nullable(),
  theme: ThemeSchema,
  /** null until the person picks a term; then the default rule is skipped. */
  lastTermId: TermIdSchema.nullable(),
  /** Which plan tab was open in each term. */
  activePlanByTerm: z.record(TermIdSchema, LocalIdSchema),
  collapsedGroups: z.array(CollapsedGroupKeySchema),
  /**
   * Missing in prefs saved before the sidebar could be resized, and out of
   * range if the limits ever change: either way the default, rather than an
   * invalid row that would throw away the rest of the prefs.
   */
  sidebarWidth: z
    .number()
    .int()
    .min(SIDEBAR_WIDTH.min)
    .max(SIDEBAR_WIDTH.max)
    .catch(SIDEBAR_WIDTH.default),
});
export type UiPrefs = z.infer<typeof UiPrefsSchema>;

export const DEFAULT_UI_PREFS: UiPrefs = {
  tab: "courses",
  sidebarOpen: true,
  drill: null,
  theme: "system",
  lastTermId: null,
  activePlanByTerm: {},
  collapsedGroups: [],
  sidebarWidth: SIDEBAR_WIDTH.default,
};

/**
 * Terpsicle Plan's own prefs (docs/V3.md §2.3): which four-year plan is
 * open. Local, never synced. Its own settings row rather than a field of
 * `UiPrefs`, which the scheduler saves whole from its own store: a Plan tab
 * writing that row would race an open scheduler tab.
 */
export const FourYearPrefsSchema = z.object({
  activeId: LocalIdSchema.nullable(),
});
export type FourYearPrefs = z.infer<typeof FourYearPrefsSchema>;

// The `settings` table's rows live in settings.ts: one of them (Generate's
// drafts) needs generate.ts, which imports this file.
