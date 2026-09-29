// What Chat reads from the published catalog (R2 `DATA`, through
// ../published): the term, the course (whose rooms `roomsForCourse`
// derives), the academic calendar (for retention) and Chat's term. Rooms are
// never listed from storage (V2.md §8.3).
import { chatTerm, termTagCandidates } from "~/core/catalog/term-tag";
import { type RoomTree, roomsForCourse } from "~/core/chat";
import {
  type AcademicCalendar,
  type Course,
  type CourseCode,
  type IsoDate,
  TERMS_KEY,
  type Term,
  type TermId,
  TermsFileSchema,
} from "~/core/schema";
import {
  findCourse,
  findTerm,
  memoJson,
  readCalendar,
  readPublished,
} from "../published";

export interface ChatCourse {
  term: Term;
  course: Course;
  tree: RoomTree;
  /** Null when there's no calendar file for the term yet. */
  calendar: AcademicCalendar | null;
}

/** What retention reads: the term and its academic calendar. */
export async function loadTermDates(
  bucket: R2Bucket,
  termId: TermId,
): Promise<{ term: Term | null; calendar: AcademicCalendar | null }> {
  const [term, calendar] = await Promise.all([
    findTerm(bucket, termId),
    readCalendar(bucket, termId),
  ]);
  return { term, calendar };
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

/**
 * Chat's term on `today` (a date in College Park), as the chat list works
 * it out: the listed term in session, or between terms the next to start.
 * Joining another term's chat is refused (owner, 2026-09-29).
 */
export async function loadChatTerm(
  bucket: R2Bucket,
  today: IsoDate,
): Promise<TermId | null> {
  const read = memoJson(bucket);
  const terms = await readPublished(read, TERMS_KEY, TermsFileSchema);
  const listed = terms?.terms.map((t) => t.id) ?? [];
  const calendars = await Promise.all(
    termTagCandidates(today)
      .filter((id) => listed.includes(id))
      .map((id) => readCalendar(read, id)),
  );
  return chatTerm(
    today,
    listed,
    calendars.filter((c) => c !== null),
  );
}
