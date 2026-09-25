import { z } from "zod";
import {
  BuildingCodeSchema,
  ContentHashSchema,
  CourseCodeSchema,
  DaysSchema,
  DeptCodeSchema,
  ENDS_AFTER_START,
  endsAfterStart,
  GenEdCodeSchema,
  InstructorNameSchema,
  IsoDateTimeSchema,
  MinutesSchema,
  SeasonSchema,
  SectionCodeSchema,
  SectionKeySchema,
  TermIdSchema,
} from "./primitives";
import { SCHEMA_VERSIONS } from "./versions";

// The published catalog: what src/ingest produces and the client reads.
// Layout and caching are in docs/DATA.md §2–3.

const catalogVersion = z.literal(SCHEMA_VERSIONS.catalog);

// ---------- terms.json ----------

export const TermStatusSchema = z.enum(["active", "archived"]);
export type TermStatus = z.infer<typeof TermStatusSchema>;

export const TermSchema = z.object({
  id: TermIdSchema,
  /** Testudo's label, verbatim: "Spring 2027". */
  name: z.string().min(1).max(40),
  season: SeasonSchema,
  /** The year in `name` (for winter, the year the session is held in). */
  year: z.number().int().min(2000).max(2200),
  /** active: in Testudo's dropdown on the last run. archived: dropped off; still viewable, seats frozen. */
  status: TermStatusSchema,
  firstSeen: IsoDateTimeSchema,
  lastSeen: IsoDateTimeSchema,
});
export type Term = z.infer<typeof TermSchema>;

/** `catalog/terms.json`, newest term first. */
export const TermsFileSchema = z.object({
  schemaVersion: catalogVersion,
  generatedAt: IsoDateTimeSchema,
  terms: z.array(TermSchema),
});
export type TermsFile = z.infer<typeof TermsFileSchema>;

// ---------- meetings, sections, courses ----------

export const MeetingKindSchema = z.enum(["lecture", "discussion", "lab", "other"]);
export type MeetingKind = z.infer<typeof MeetingKindSchema>;

export const DeliverySchema = z.enum(["f2f", "blended", "online-sync", "online-async"]);
export type Delivery = z.infer<typeof DeliverySchema>;

const meetingPlace = {
  kind: MeetingKindSchema,
  /** null when online or when Testudo lists no building. */
  building: BuildingCodeSchema.nullable(),
  room: z.string().min(1).max(16).nullable(),
  /** Room was ONLINE (or the row was the ELMS row). Online meetings never take part in travel. */
  online: z.boolean(),
};

/** A meeting with set days and times. */
export const TimedMeetingSchema = z
  .object({
    timed: z.literal(true),
    days: DaysSchema.min(1),
    start: MinutesSchema,
    end: MinutesSchema,
    ...meetingPlace,
  })
  .refine(endsAfterStart, ENDS_AFTER_START);
export type TimedMeeting = z.infer<typeof TimedMeetingSchema>;

/** A meeting with no set time: async online ("Class time/details on ELMS") or TBA. */
export const UntimedMeetingSchema = z.object({
  timed: z.literal(false),
  ...meetingPlace,
});
export type UntimedMeeting = z.infer<typeof UntimedMeetingSchema>;

export const MeetingSchema = z.discriminatedUnion("timed", [TimedMeetingSchema, UntimedMeetingSchema]);
export type Meeting = z.infer<typeof MeetingSchema>;

export const SectionSchema = z.object({
  code: SectionCodeSchema,
  /** In Testudo's order. Empty means "Instructor: TBA". */
  instructors: z.array(InstructorNameSchema),
  delivery: DeliverySchema,
  /** In Testudo's row order. Empty only when Testudo lists no rows at all. */
  meetings: z.array(MeetingSchema),
  /** Testudo's free-text section notes, whitespace-normalized; null when none. */
  notes: z.string().min(1).nullable(),
  /** The restriction sentence(s) from `notes` ("Restricted to …", "Reserved for …"); null when unrestricted. */
  restriction: z.string().min(1).nullable(),
  /** Present and true only when Testudo marks the section cancelled but still lists it. */
  cancelled: z.literal(true).optional(),
});
export type Section = z.infer<typeof SectionSchema>;

export const CreditsSchema = z
  .object({
    min: z.number().min(0).max(30),
    max: z.number().min(0).max(30),
  })
  .refine((c) => c.max >= c.min, { message: "max credits below min", path: ["max"] });
export type Credits = z.infer<typeof CreditsSchema>;

/**
 * One requirement group: the course counts for exactly one of these codes
 * (the student chooses). A course's `genEds` is a list of groups that all apply.
 * Testudo "DSHS or DSSP, DVUP" → [["DSHS","DSSP"],["DVUP"]].
 */
export const GenEdGroupSchema = z.array(GenEdCodeSchema).min(1);
export type GenEdGroup = z.infer<typeof GenEdGroupSchema>;

/** A labeled block of course text we don't model further ("Credit only granted for", "Formerly", …). */
export const CourseNoteSchema = z.object({
  label: z.string().min(1).max(60),
  text: z.string().min(1),
});
export type CourseNote = z.infer<typeof CourseNoteSchema>;

const nullableText = z.string().min(1).nullable();

function uniqueSortedCodes(sections: readonly { code: string }[]): boolean {
  for (let i = 1; i < sections.length; i++) {
    const prev = sections[i - 1];
    const cur = sections[i];
    if (prev === undefined || cur === undefined || prev.code >= cur.code) return false;
  }
  return true;
}

export const CourseSchema = z.object({
  /** The department is always `code.slice(0, 4)`. */
  code: CourseCodeSchema,
  title: z.string().min(1).max(200),
  credits: CreditsSchema,
  genEds: z.array(GenEdGroupSchema),
  /** Testudo grading-method tokens, verbatim ("Reg", "P-F", "Aud"). */
  gradingMethods: z.array(z.string().min(1).max(20)),
  /** Testudo's perm-req message ("Permission required from department"); null when none. */
  permission: nullableText,
  description: nullableText,
  prerequisite: nullableText,
  corequisite: nullableText,
  restriction: nullableText,
  otherNotes: z.array(CourseNoteSchema),
  /** Other codes for the same course ("Cross-listed with", "Also offered as"). */
  crossListings: z.array(CourseCodeSchema),
  /** Section-number order (ascending `code`), unique. */
  sections: z.array(SectionSchema).refine(uniqueSortedCodes, { message: "Sections must be unique and sorted by code" }),
});
export type Course = z.infer<typeof CourseSchema>;

/**
 * `catalog/<term>/dept/<DEPT>.<hash>.json`. No timestamps or seats inside, so
 * the hash only changes when the department's catalog does.
 */
export const DeptChunkSchema = z.object({
  schemaVersion: catalogVersion,
  termId: TermIdSchema,
  dept: DeptCodeSchema,
  /** Sorted by code. Every code starts with `dept`. */
  courses: z.array(CourseSchema),
});
export type DeptChunk = z.infer<typeof DeptChunkSchema>;

// ---------- seats ----------

const count = z.number().int().min(0);

/** `[open, total, waitlist, holdfile]`. holdfile is 0 when Testudo shows none. */
export const SeatTupleSchema = z.tuple([count, count, count, count]);
export type SeatTuple = z.infer<typeof SeatTupleSchema>;

export const SeatCountsSchema = z.object({
  open: count,
  total: count,
  waitlist: count,
  holdfile: count,
});
export type SeatCounts = z.infer<typeof SeatCountsSchema>;

export function seatCountsFromTuple([open, total, waitlist, holdfile]: SeatTuple): SeatCounts {
  return { open, total, waitlist, holdfile };
}

export function seatTupleFromCounts(s: SeatCounts): SeatTuple {
  return [s.open, s.total, s.waitlist, s.holdfile];
}

/**
 * `catalog/<term>/seats.<hash>.json`. Sections Testudo shows no counts for are
 * absent (render "Seats unknown"). `fetchedAt` lives in the manifest so the
 * hash only changes when counts do.
 */
export const SeatsFileSchema = z.object({
  schemaVersion: catalogVersion,
  termId: TermIdSchema,
  /** Testudo's "Open Seats as of …" (Eastern time converted to UTC); null if the page didn't say. */
  asOf: IsoDateTimeSchema.nullable(),
  seats: z.record(SectionKeySchema, SeatTupleSchema),
});
export type SeatsFile = z.infer<typeof SeatsFileSchema>;

// ---------- changes ----------

/** The parts of a section whose change is a "changed" problem. Plans keep one per placed section. */
export const SectionSnapshotSchema = z.object({
  instructors: z.array(InstructorNameSchema),
  delivery: DeliverySchema,
  meetings: z.array(MeetingSchema),
});
export type SectionSnapshot = z.infer<typeof SectionSnapshotSchema>;

const changeBase = { sectionKey: SectionKeySchema, at: IsoDateTimeSchema };

export const CatalogChangeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("added"), ...changeBase, after: SectionSnapshotSchema }),
  z.object({ kind: z.literal("changed"), ...changeBase, before: SectionSnapshotSchema, after: SectionSnapshotSchema }),
  /** Testudo marks it cancelled (it may still be listed). */
  z.object({ kind: z.literal("cancelled"), ...changeBase, before: SectionSnapshotSchema }),
  /** It vanished from Testudo without a cancelled marker. Treated as cancelled in Problems. */
  z.object({ kind: z.literal("removed"), ...changeBase, before: SectionSnapshotSchema }),
]);
export type CatalogChange = z.infer<typeof CatalogChangeSchema>;
export type CatalogChangeKind = CatalogChange["kind"];

/** `catalog/<term>/changes.<hash>.json`: a rolling window, newest first. */
export const ChangesFileSchema = z.object({
  schemaVersion: catalogVersion,
  termId: TermIdSchema,
  /** Start of the window (changes older than this were dropped). */
  since: IsoDateTimeSchema,
  changes: z.array(CatalogChangeSchema),
});
export type ChangesFile = z.infer<typeof ChangesFileSchema>;

// ---------- manifest ----------

export const ManifestDepartmentSchema = z.object({
  code: DeptCodeSchema,
  /** Testudo's name: "Computer Science". */
  name: z.string().min(1).max(120),
  hash: ContentHashSchema,
  courseCount: count,
  sectionCount: count,
});
export type ManifestDepartment = z.infer<typeof ManifestDepartmentSchema>;

/** `catalog/<term>/manifest.json`: the one small file clients poll. */
export const ManifestSchema = z.object({
  schemaVersion: catalogVersion,
  termId: TermIdSchema,
  /** Last write by any job. */
  generatedAt: IsoDateTimeSchema,
  /** Last completed catalog crawl (departments and courses). */
  catalogCrawledAt: IsoDateTimeSchema,
  /** Sorted by code. */
  departments: z.array(ManifestDepartmentSchema),
  /** null until the first seats run for this term. */
  seats: z
    .object({
      hash: ContentHashSchema,
      asOf: IsoDateTimeSchema.nullable(),
      /** When our job fetched the counts. */
      fetchedAt: IsoDateTimeSchema,
    })
    .nullable(),
  /** null until the first seats run for this term. */
  changes: z
    .object({
      hash: ContentHashSchema,
      count,
      /** `at` of the newest change; null when the window is empty. */
      latestAt: IsoDateTimeSchema.nullable(),
    })
    .nullable(),
});
export type Manifest = z.infer<typeof ManifestSchema>;
