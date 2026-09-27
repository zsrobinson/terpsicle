import { gradeBars, gradeSentence, gradeSummary } from "~/core/grades/grades";
import { gradesSourceWords } from "~/core/grades/source";
import type {
  CourseCode,
  GradeRecord,
  InstructorSlug,
  TermId,
} from "~/core/schema";
import { AiMenu } from "~/features/ai/ai-menu";
import { AiSparkles } from "~/features/ai/ai-sparkles";
import { useAiFeatures } from "~/features/ai/use-ai-features";
import { Bars } from "~/features/course-details/grades";
import { useReviewSummary } from "~/features/course-details/use-review-summary";
import { Card } from "~/ui/card";
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

/**
 * The AI summary of an instructor's reviews, when there is one and AI
 * features are on. Off, nothing is asked for and nothing is left in its
 * place: whoever turned it off doesn't want a reminder (Settings brings it
 * back).
 */
export function SummaryBlock({
  slug,
  course,
}: {
  slug: InstructorSlug;
  course: CourseCode;
}) {
  const ai = useAiFeatures();
  const review = useReviewSummary(slug, course, { enabled: ai.on === true });
  if (ai.on !== true || review.status === "hidden") return null;
  // A Card: the instructor's review summary is one standalone object, and
  // the one place on Reviews the sparkles appear (docs/COHESION.md, kit).
  if (review.status === "loading")
    return (
      <Card className="flex-row items-start gap-2">
        <div
          role="status"
          aria-label="Summarizing reviews"
          className="flex min-w-0 flex-1 flex-col gap-2"
        >
          <Skeleton className="h-2.5 w-full" />
          <Skeleton className="h-2.5 w-4/5" />
          <div className="flex items-center gap-1 text-faint text-xs">
            <AiSparkles size={11} aria-hidden="true" />
            Summarizing reviews…
          </div>
        </div>
        <AiMenu />
      </Card>
    );
  const { summary } = review;
  return (
    <Card>
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 leading-5">
          <AiSparkles
            size={12}
            role="img"
            aria-label="AI summary"
            className="-mt-0.5 mr-1 inline"
          />
          {summary.summary}
        </p>
        <AiMenu />
      </div>
      {summary.themes.length > 0 ? (
        <div className="flex flex-wrap gap-1">
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
      <p className="text-faint text-xs">
        An AI summary of {summary.basedOnReviewCount} PlanetTerp review
        {summary.basedOnReviewCount === 1 ? "" : "s"}. It can get things wrong.
      </p>
    </Card>
  );
}
