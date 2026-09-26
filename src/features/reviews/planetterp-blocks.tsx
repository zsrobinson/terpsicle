import { Sparkles } from "lucide-react";
import { gradeBars, gradeSentence, gradeSummary } from "~/core/grades/grades";
import { gradesSourceWords } from "~/core/grades/source";
import type {
  CourseCode,
  GradeRecord,
  InstructorSlug,
  TermId,
} from "~/core/schema";
import { Bars } from "~/features/course-details/grades";
import { useReviewSummary } from "~/features/course-details/use-review-summary";
import { Skeleton } from "~/ui/skeleton";

// PlanetTerp's side of an instructor or course page: the grade bars, and the
// AI summary of its reviews (the only place on Reviews with the sparkles
// icon). The bars and the summary are the scheduler's own, shared.

/** PlanetTerp's grades for a course: the sentence, then the bars, credited. */
export function GradesBlock({
  record,
  gradesThrough,
}: {
  record: GradeRecord;
  gradesThrough: TermId | null;
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
        {summary.students.toLocaleString("en-US")} students over{" "}
        {record.semesters} semester{record.semesters === 1 ? "" : "s"},{" "}
        {gradesSourceWords(gradesThrough)}.
      </p>
    </div>
  );
}

/** The AI summary of an instructor's reviews, when there is one. */
export function SummaryBlock({
  slug,
  course,
}: {
  slug: InstructorSlug;
  course: CourseCode;
}) {
  const review = useReviewSummary(slug, course);
  if (review.status === "hidden") return null;
  if (review.status === "loading")
    return (
      <div className="mt-4 space-y-1.5" aria-busy="true">
        <Skeleton className="h-2.5 w-full animate-pulse" />
        <Skeleton className="h-2.5 w-4/5 animate-pulse" />
        <div className="flex items-center gap-1 text-faint text-xs">
          <Sparkles size={11} aria-hidden="true" />
          Summarizing reviews…
        </div>
      </div>
    );
  const { summary } = review;
  return (
    <div className="mt-4">
      <p className="leading-5">
        <Sparkles
          size={12}
          role="img"
          aria-label="AI summary"
          className="-mt-0.5 mr-1 inline"
        />
        {summary.summary}
      </p>
      {summary.themes.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {summary.themes.map((t) => (
            <span
              key={t.label}
              className={
                t.sentiment === "positive"
                  ? "bg-ok-soft px-1.5 py-0.5 text-ok text-xs"
                  : t.sentiment === "negative"
                    ? "bg-warn-soft px-1.5 py-0.5 text-warn text-xs"
                    : "bg-hover px-1.5 py-0.5 text-muted text-xs"
              }
            >
              {t.label}
            </span>
          ))}
        </div>
      ) : null}
      <p className="mt-1.5 text-faint text-xs">
        An AI summary of {summary.basedOnReviewCount} PlanetTerp review
        {summary.basedOnReviewCount === 1 ? "" : "s"}. It can get things wrong.
      </p>
    </div>
  );
}
