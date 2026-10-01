import { gradeBars, gradeSentence, gradeSummary } from "~/core/grades/grades";
import { gradesSourceWords } from "~/core/grades/source";
import type { GradeRecord, TermId } from "~/core/schema";
import { Bars } from "~/features/course-details/grades";

// PlanetTerp's grades on an instructor's or a course's page: the sentence,
// then the bars, the scheduler's own, shared.

/** PlanetTerp's grades for a course: the sentence, then the bars, credited. */
export function GradesBlock({
  record,
  gradesThrough,
  courses,
}: {
  record: Pick<GradeRecord, "counts" | "semesters">;
  gradesThrough: TermId | null;
  /** Summed over an instructor's courses: how many, for the credit line. */
  courses?: number;
}) {
  const summary = gradeSummary(record.counts);
  const sentence = gradeSentence(summary);
  return (
    <div>
      {sentence ? (
        <p className="tnum">
          <span className="font-semibold">{sentence.split(" · ")[0]}</span>
          <span className="text-muted"> · {sentence.split(" · ")[1]}</span>
        </p>
      ) : null}
      <Bars bars={gradeBars(record.counts)} />
      <p className="mt-2 text-faint text-xs">
        {summary.students.toLocaleString("en-US")} students{" "}
        {courses !== undefined && courses > 1
          ? `in ${courses} courses`
          : `over ${record.semesters} semester${record.semesters === 1 ? "" : "s"}`}
        , {gradesSourceWords(gradesThrough)}.
      </p>
    </div>
  );
}
