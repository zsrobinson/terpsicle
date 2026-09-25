import type {
  CourseCode,
  Message,
  MessagePart,
  Problem,
  Subject,
} from "~/core/schema";
import { parseSectionKey } from "~/core/schema";

// A problem in a few words, from one course's point of view, for its row in
// the Courses tab: "Tight connection to ECON200", "Overlaps Lunch". The row
// says what's wrong instead of a bare ⚠ that sends people to Problems to find
// out (UX-REVIEW §4.4; recognition over recall). Full and few-seat problems
// get no words: the row's seat words already say "Full" or "3 left" in color.

const courseOf = (s: Subject | undefined): CourseCode | null => {
  if (!s) return null;
  if (s.kind === "course") return s.courseCode;
  if (s.kind === "section")
    return parseSectionKey(s.sectionKey)?.courseCode ?? null;
  return null;
};

const text = (t: string): MessagePart => ({ kind: "text", text: t });
const course = (courseCode: CourseCode): MessagePart => ({
  kind: "course",
  courseCode,
});

/** The words for `problem` on `courseCode`'s row, or null for none. */
export function problemWords(
  problem: Problem,
  courseCode: CourseCode,
): Message | null {
  const [first, second, third] = problem.subjects;
  switch (problem.kind) {
    case "not-enough-time":
    case "tight-connection": {
      // Subjects: the connection, then the section it goes to, then from.
      const to = courseOf(second);
      const from = courseOf(third);
      const tight = problem.kind === "tight-connection";
      if (from === courseCode && to && to !== courseCode)
        return tight
          ? [text("Tight connection to "), course(to)]
          : [text("Not enough time to get to "), course(to)];
      if (to === courseCode && from && from !== courseCode)
        return tight
          ? [text("Tight connection from "), course(from)]
          : [text("Not enough time after "), course(from)];
      return [text(tight ? "Tight connection" : "Not enough time")];
    }
    case "overlap": {
      const other = [first, second].find(
        (s) => s !== undefined && courseOf(s) !== courseCode,
      );
      if (other?.kind === "block") {
        const block = problem.title.find(
          (p) => p.kind === "block" && p.blockId === other.blockId,
        );
        return [text("Overlaps "), block ?? text("a block")];
      }
      const otherCourse = courseOf(other);
      return otherCourse
        ? [text("Overlaps "), course(otherCourse)]
        : [text("Overlaps another class")];
    }
    case "restricted":
      return [text("Restricted")];
    case "cancelled":
      return [text("Cancelled")];
    case "changed":
      return [text("Times changed")];
    case "full":
    case "few-seats":
    case "no-set-times":
    case "instructor-tba":
      return null;
  }
}
