// What Chat reads from the published catalog (R2 `DATA`): the term, the
// course (whose rooms `roomsForCourse` derives) and the academic calendar
// (for retention). Rooms are never listed from storage (V2.md §8.3).
import { type RoomTree, roomsForCourse } from "~/core/chat";
import {
  type AcademicCalendar,
  AcademicCalendarSchema,
  type Course,
  type CourseCode,
  calendarKey,
  DeptChunkSchema,
  deptChunkKey,
  ManifestSchema,
  manifestKey,
  TERMS_KEY,
  type Term,
  type TermId,
  TermsFileSchema,
} from "~/core/schema";

export interface ChatCourse {
  term: Term;
  course: Course;
  tree: RoomTree;
  /** Null when there's no calendar file for the term yet. */
  calendar: AcademicCalendar | null;
}

async function readJson(bucket: R2Bucket, key: string): Promise<unknown> {
  const object = await bucket.get(key);
  return object ? object.json() : null;
}

/** The term as terms.json lists it, or null when Testudo never had it. */
export async function findTerm(
  bucket: R2Bucket,
  termId: TermId,
): Promise<Term | null> {
  const terms = TermsFileSchema.safeParse(await readJson(bucket, TERMS_KEY));
  return terms.success
    ? (terms.data.terms.find((t) => t.id === termId) ?? null)
    : null;
}

/** A course of a term, or null when the term or course isn't in the catalog. */
export async function findCourse(
  bucket: R2Bucket,
  termId: TermId,
  courseCode: CourseCode,
): Promise<Course | null> {
  const manifest = ManifestSchema.safeParse(
    await readJson(bucket, manifestKey(termId)),
  );
  const dept = courseCode.slice(0, 4);
  const entry = manifest.success
    ? manifest.data.departments.find((d) => d.code === dept)
    : undefined;
  if (!entry) return null;
  const chunk = DeptChunkSchema.safeParse(
    await readJson(bucket, deptChunkKey(termId, dept, entry.hash)),
  );
  return chunk.success
    ? (chunk.data.courses.find((c) => c.code === courseCode) ?? null)
    : null;
}

/** What retention reads: the term and its academic calendar. */
export async function loadTermDates(
  bucket: R2Bucket,
  termId: TermId,
): Promise<{ term: Term | null; calendar: AcademicCalendar | null }> {
  const [term, calendar] = await Promise.all([
    findTerm(bucket, termId),
    readJson(bucket, calendarKey(termId)),
  ]);
  const parsed = AcademicCalendarSchema.safeParse(calendar);
  return { term, calendar: parsed.success ? parsed.data : null };
}

/** Everything a course's chat needs from the catalog, or null when it has no course. */
export async function loadChatCourse(
  bucket: R2Bucket,
  termId: TermId,
  courseCode: CourseCode,
): Promise<ChatCourse | null> {
  const [{ term, calendar }, course] = await Promise.all([
    loadTermDates(bucket, termId),
    findCourse(bucket, termId, courseCode),
  ]);
  if (!term || !course) return null;
  return { term, course, tree: roomsForCourse(termId, course), calendar };
}
