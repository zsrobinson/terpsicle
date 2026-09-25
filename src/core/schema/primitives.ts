import { z } from "zod";

// Building blocks shared by every other schema. Formats are documented in docs/DATA.md §1.

/**
 * Testudo term id: four-digit year then a two-digit month code
 * (01 spring, 05 summer, 08 fall, 12 winter). Winter's id carries the previous
 * calendar year. Never write a real id in source; terms are data (SPEC §3.0).
 */
export const TermIdSchema = z
  .string()
  .regex(/^\d{4}(01|05|08|12)$/, "Expected a term id like YYYYMM");
export type TermId = z.infer<typeof TermIdSchema>;

export const SeasonSchema = z.enum(["spring", "summer", "fall", "winter"]);
export type Season = z.infer<typeof SeasonSchema>;

/** Month code of a term id → season. */
export const SEASON_BY_MONTH_CODE = {
  "01": "spring",
  "05": "summer",
  "08": "fall",
  "12": "winter",
} as const satisfies Record<string, Season>;

/** Testudo's day tokens, in week order. Index into this for bitmasks. */
export const DAYS = ["M", "Tu", "W", "Th", "F", "Sa", "Su"] as const;
export const DaySchema = z.enum(DAYS);
export type Day = z.infer<typeof DaySchema>;

function inWeekOrder(days: readonly Day[]): boolean {
  let prev = -1;
  for (const d of days) {
    const i = DAYS.indexOf(d);
    if (i <= prev) return false;
    prev = i;
  }
  return true;
}

/** A set of days: unique, in week order (so equal sets compare equal as arrays). */
export const DaysSchema = z
  .array(DaySchema)
  .refine(inWeekOrder, { message: "Days must be unique and in week order" });

/** Minutes since local (America/New_York) midnight. 9:30am = 570. */
export const MinutesSchema = z
  .number()
  .int()
  .min(0)
  .max(24 * 60);
export type Minutes = z.infer<typeof MinutesSchema>;

/** A UTC instant, `Date.prototype.toISOString()` format. */
export const IsoDateTimeSchema = z.iso.datetime();
export type IsoDateTime = z.infer<typeof IsoDateTimeSchema>;

/** A calendar date in America/New_York, YYYY-MM-DD. */
export const IsoDateSchema = z.iso.date();
export type IsoDate = z.infer<typeof IsoDateSchema>;

/** Department prefix: "CMSC". */
export const DeptCodeSchema = z
  .string()
  .regex(/^[A-Z]{4}$/, "Expected a department like CMSC");
export type DeptCode = z.infer<typeof DeptCodeSchema>;

/** Course code: dept + three digits + optional suffix letters: "CMSC351", "CMSC389N". */
export const CourseCodeSchema = z
  .string()
  .regex(/^[A-Z]{4}\d{3}[A-Z]{0,2}$/, "Expected a course code like CMSC351");
export type CourseCode = z.infer<typeof CourseCodeSchema>;

/** Section code within a course: usually four digits ("0101"), sometimes alphanumeric ("FC01"). */
export const SectionCodeSchema = z
  .string()
  .regex(/^[A-Z0-9]{3,6}$/, "Expected a section code like 0101");
export type SectionCode = z.infer<typeof SectionCodeSchema>;

/**
 * The one identifier for a section within a term: "CMSC351-0101".
 * Course codes never contain "-", so the first "-" splits it.
 */
export const SectionKeySchema = z
  .string()
  .regex(
    /^[A-Z]{4}\d{3}[A-Z]{0,2}-[A-Z0-9]{3,6}$/,
    "Expected a section key like CMSC351-0101",
  );
export type SectionKey = z.infer<typeof SectionKeySchema>;

export function sectionKey(
  courseCode: CourseCode,
  sectionCode: SectionCode,
): SectionKey {
  return `${courseCode}-${sectionCode}`;
}

/** Splits a section key; null when it isn't one. */
export function parseSectionKey(
  key: string,
): { courseCode: CourseCode; sectionCode: SectionCode } | null {
  if (!SectionKeySchema.safeParse(key).success) return null;
  const dash = key.indexOf("-");
  return { courseCode: key.slice(0, dash), sectionCode: key.slice(dash + 1) };
}

/** Testudo building code: "IRB", "ESJ", "STAMP". */
export const BuildingCodeSchema = z
  .string()
  .regex(/^[A-Z0-9]{2,6}$/, "Expected a building code like IRB");
export type BuildingCode = z.infer<typeof BuildingCodeSchema>;

/**
 * A gen-ed code. Validated by shape rather than a closed list so a new UMD
 * category never breaks ingest; `GEN_ED_LABELS` names the ones we know.
 */
export const GenEdCodeSchema = z
  .string()
  .regex(/^[A-Z]{4}$/, "Expected a gen-ed code like DSHU");
export type GenEdCode = z.infer<typeof GenEdCodeSchema>;

export const GEN_ED_LABELS: Readonly<Record<string, string>> = {
  FSAW: "Academic Writing",
  FSPW: "Professional Writing",
  FSOC: "Oral Communication",
  FSMA: "Math",
  FSAR: "Analytic Reasoning",
  DSNL: "Natural Sciences Lab",
  DSNS: "Natural Sciences",
  DSHS: "History and Social Sciences",
  DSHU: "Humanities",
  DSSP: "Scholarship in Practice",
  SCIS: "I-Series",
  DVUP: "Understanding Plural Societies",
  DVCC: "Cultural Competence",
};

/** First 16 hex chars of the SHA-256 of a file's exact bytes. */
export const ContentHashSchema = z
  .string()
  .regex(/^[0-9a-f]{16}$/, "Expected a 16-hex-char content hash");
export type ContentHash = z.infer<typeof ContentHashSchema>;

/** PlanetTerp professor slug ("kruskal"); also safe inside R2 keys. */
export const InstructorSlugSchema = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/, "Expected a PlanetTerp slug");
export type InstructorSlug = z.infer<typeof InstructorSlugSchema>;

/** Display name exactly as Testudo prints it: "Clyde Kruskal". */
export const InstructorNameSchema = z.string().trim().min(1).max(120);
export type InstructorName = z.infer<typeof InstructorNameSchema>;

export const EmailSchema = z.email().max(254);
export type Email = z.infer<typeof EmailSchema>;

/** A local id we mint (plans, blocks): 8–64 URL-safe chars. */
export const LocalIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{8,64}$/, "Expected a URL-safe id");
export type LocalId = z.infer<typeof LocalIdSchema>;

/** Checks `end > start` on anything with a time range; attach with `.refine`. */
export const endsAfterStart = (v: { start: number; end: number }): boolean =>
  v.end > v.start;
export const ENDS_AFTER_START = {
  message: "end must be after start",
  path: ["end"],
};
