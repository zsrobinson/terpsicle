// What Chat reads from the published catalog (R2 `DATA`, through
// ../published): the term, the course (whose rooms `roomsForCourse`
// derives) and the academic calendar (for retention). Rooms are never listed
// from storage (V2.md §8.3).
import { type RoomTree, roomsForCourse } from "~/core/chat";
import type {
  AcademicCalendar,
  Course,
  CourseCode,
  Term,
  TermId,
} from "~/core/schema";
import { findCourse, findTerm, readCalendar } from "../published";

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
