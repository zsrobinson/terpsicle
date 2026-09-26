import { z } from "zod";
import {
  SubscriptionIdSchema,
  SubscriptionStatusSchema,
  TokenSchema,
} from "./api";
import { SectionSnapshotSchema } from "./catalog";
import {
  CourseCodeSchema,
  DaysSchema,
  EmailSchema,
  ENDS_AFTER_START,
  endsAfterStart,
  IsoDateTimeSchema,
  LocalIdSchema,
  MinutesSchema,
  RailTabSchema,
  SectionCodeSchema,
  SectionKeySchema,
  TermIdSchema,
} from "./primitives";
import { SchemaFamilySchema } from "./versions";

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
});
export type Plan = z.infer<typeof PlanSchema>;

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

export const CourseDetailsTabSchema = z.enum([
  "instructors",
  "grades",
  "about",
]);
export type CourseDetailsTab = z.infer<typeof CourseDetailsTabSchema>;

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
  tab: RailTabSchema,
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

// The `settings` table's rows live in settings.ts: one of them (Generate's
// drafts) needs generate.ts, which imports this file.

// ---------- seat alerts (local mirror) ----------

/** This browser's view of its seat alerts, listed under Export → Seat alerts. */
export const LocalSeatAlertSchema = z.object({
  termId: TermIdSchema,
  sectionKey: SectionKeySchema,
  /**
   * The person's own address, kept to show "Watching as …" and prefill the
   * next bell. Null when the watch was confirmed in this browser but asked for
   * in another: the confirm page learns the section and token, not the address.
   */
  email: EmailSchema.nullable(),
  status: SubscriptionStatusSchema,
  /** From confirming in this browser (the alerts inbox); null while pending or when confirmed elsewhere. */
  subscriptionId: SubscriptionIdSchema.nullable(),
  /** Lets this browser check status and unsubscribe; null when not issued to this browser. */
  manageToken: TokenSchema.nullable(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type LocalSeatAlert = z.infer<typeof LocalSeatAlertSchema>;

// ---------- data cache ----------

/**
 * `manifests` table: the last manifest whose referenced files are all in
 * `files`. Keyed by its R2 key (`catalog/<term>/manifest.json`,
 * `planetterp/manifest.json`, `geo/manifest.json`). `data` is the parsed JSON.
 */
export const CachedManifestSchema = z.object({
  key: z.string().min(1),
  data: z.unknown(),
  /** Last time we confirmed it with the server (200 or 304). */
  checkedAt: IsoDateTimeSchema,
  etag: z.string().nullable(),
});
export type CachedManifest = z.infer<typeof CachedManifestSchema>;

/**
 * `files` table: immutable content-hashed files, keyed by R2 key. `data` is
 * parsed, already-validated JSON, or an ArrayBuffer for the routes binary.
 */
export const CachedFileSchema = z.object({
  key: z.string().min(1),
  family: SchemaFamilySchema,
  /** Set for per-term files so a term's cache can be dropped together. */
  termId: TermIdSchema.nullable(),
  data: z.unknown(),
  storedAt: IsoDateTimeSchema,
});
export type CachedFile = z.infer<typeof CachedFileSchema>;
