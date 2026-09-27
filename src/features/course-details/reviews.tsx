import { cn } from "cn";
import { ArrowRight, Star } from "lucide-react";
import { crossLinkClicked, viewWords } from "~/app/cross-link";
import { MetaSep } from "~/app/panel";
import {
  formatGpa,
  formatRating,
  formatShare,
  gradeSummary,
  planetTerpFreshnessWords,
} from "~/core/grades";
import { combinedRatingWords, combineRatings } from "~/core/reviews";
import {
  type Course,
  type CourseCode,
  type Instructor,
  type PlanetTerpDept,
  planetTerpUrl,
  type ReviewSummary,
} from "~/core/schema";
import { AiMenu } from "~/features/ai/ai-menu";
import { AiSparkles } from "~/features/ai/ai-sparkles";
import { useAiFeatures } from "~/features/ai/use-ai-features";
import { useAccount } from "~/features/auth/account-store";
import { deptOf, useCatalog } from "~/state/catalog-store";
import { usePlanetTerpStatus, useTerpsicleReviews } from "~/state/data-hooks";
import { terpsicleInstructor } from "~/state/reviews-store";
import { InlineError } from "~/ui/inline-error";
import { Skeleton } from "~/ui/skeleton";
import { WithTooltip } from "~/ui/tooltip";
import { instructorFor } from "./planetterp";
import { useReviewSummary } from "./use-review-summary";

// Instructors, where the choice is made (UX review §3.4): name, rating and
// GPA in the group header, and "Reviews" opening the LLM summary under it:
// the one place in the app with the sparkles icon, because it's the one
// place an LLM wrote words.

/** This instructor's grades in this course, when PlanetTerp has them. */
function courseGrades(
  planetTerp: PlanetTerpDept | null,
  course: Course,
  pt: Instructor | null,
) {
  if (!pt) return null;
  const record = planetTerp?.courses[course.code]?.byInstructor[pt.slug];
  return record ? gradeSummary(record.counts) : null;
}

/**
 * One rating over PlanetTerp's reviews and Terpsicle's (V2 §7.6), once
 * Reviews is at least readable; PlanetTerp's alone before that.
 */
function useCombinedRating(
  name: string,
  course: Course,
  planetTerp: PlanetTerpDept | null,
) {
  const reviewsOn = useAccount((s) => s.flags.reviews !== "off");
  const ours = useTerpsicleReviews(deptOf(course.code), reviewsOn);
  if (!name) return null;
  const terpsicle = terpsicleInstructor(ours, planetTerp, name);
  // The owner's fix can point a name at another PlanetTerp slug.
  const pt = terpsicle
    ? (planetTerp?.instructors[terpsicle.id] ?? null)
    : instructorFor(planetTerp, name);
  return combineRatings([
    {
      source: "planetterp",
      rating: pt?.rating ?? null,
      reviewCount: pt?.reviewCount ?? 0,
    },
    {
      source: "terpsicle",
      rating: terpsicle?.numbers?.rating ?? null,
      reviewCount: terpsicle?.numbers?.reviewCount ?? 0,
    },
  ]);
}

/**
 * "★ 4.2 (61) · GPA 3.10": said once per instructor, beside their name in
 * the group header (UX review §3.4). Null when there's neither.
 */
export function InstructorMeta({
  name,
  course,
  planetTerp,
}: {
  /** A Testudo name, or "" for TBA. */
  name: string;
  course: Course;
  planetTerp: PlanetTerpDept | null;
}) {
  const pt = name ? instructorFor(planetTerp, name) : null;
  const combined = useCombinedRating(name, course, planetTerp);
  const rating = combined
    ? formatRating(combined.rating, combined.reviewCount)
    : null;
  const gpa = courseGrades(planetTerp, course, pt)?.averageGpa ?? null;
  if (!rating?.rating && gpa === null) return null;
  const parts = combined ? combinedRatingWords(combined) : null;
  // A row of one line: what doesn't fit (the GPA first) wraps out of sight,
  // so a narrow header keeps the professor's name whole (QA S8). The GPA is
  // under Grades too.
  return (
    <span className="tnum flex h-5 min-w-0 flex-wrap items-center gap-x-1 overflow-hidden text-muted">
      {rating?.rating && parts ? (
        <WithTooltip label={parts}>
          <span className="inline-flex h-5 shrink-0 items-center gap-0.5">
            <Star
              size={11}
              aria-hidden="true"
              className="fill-current text-warn"
            />
            {/* "★ 4.2 (61)" on screen; "rated 4.2 of 5, 61 reviews" read out. */}
            <span className="sr-only">
              {` rated ${rating.rating} of 5, ${combined?.reviewCount} reviews`}
            </span>
            <span aria-hidden="true">
              <span className="text-fg">{rating.rating}</span>(
              {combined?.reviewCount})
            </span>
          </span>
        </WithTooltip>
      ) : null}
      {gpa !== null ? (
        // Not inline-flex: that would drop the spaces around the dot.
        <span className="shrink-0 whitespace-nowrap leading-5">
          {rating?.rating ? <MetaSep /> : null}GPA {formatGpa(gpa)}
        </span>
      ) : null}
    </span>
  );
}

/** The name, then its meta: for lines outside a group header. */
export function InstructorLine({
  name,
  course,
  planetTerp,
}: {
  name: string;
  course: Course;
  planetTerp: PlanetTerpDept | null;
}) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <span className="truncate font-medium">{name || "Instructor TBA"}</span>
      <InstructorMeta name={name} course={course} planetTerp={planetTerp} />
    </span>
  );
}

/** Whether an instructor has anything for "Reviews" to open. */
export function hasReviews(
  planetTerp: PlanetTerpDept | null,
  name: string,
): boolean {
  const pt = name ? instructorFor(planetTerp, name) : null;
  return pt !== null && pt.reviewCount > 0;
}

/** What "Reviews" opens: the summary (loaded on open), themes, and the way to PlanetTerp. */
export function InstructorReviews({
  name,
  course,
  planetTerp,
  loading,
}: {
  name: string;
  course: Course;
  planetTerp: PlanetTerpDept | null;
  loading: boolean;
}) {
  const pt = instructorFor(planetTerp, name);
  const grades = courseGrades(planetTerp, course, pt);
  // Mounted only while open, so the summary is asked for on open (SPEC §4),
  // and never while AI features are off: then the review count shows, as
  // when there's no summary.
  const ai = useAiFeatures();
  const review = useReviewSummary(
    pt && pt.reviewCount > 0 && ai.on === true ? pt.slug : null,
    course.code,
  );
  const { source, failed } = usePlanetTerpStatus(deptOf(course.code));
  const freshness = pt ? planetTerpFreshnessWords(source) : null;
  return (
    <div
      className="border-hairline border-b px-4 py-3 text-sm"
      data-instructor={name}
    >
      {grades?.aOrBShare != null ? (
        <p className="tnum text-muted">
          In {course.code}, {formatShare(grades.aOrBShare)} got an A or B.
        </p>
      ) : null}
      {loading ? (
        <Skeleton className="mt-2 h-2.5 w-2/3" />
      ) : failed && !planetTerp ? (
        <InlineError
          className="py-0"
          message="Couldn't load reviews from PlanetTerp. Check your connection and try again."
          onRetry={() =>
            void useCatalog.getState().ensureInstructors(deptOf(course.code))
          }
          retryTooltip="Load PlanetTerp's reviews again"
        />
      ) : !pt ? (
        <p className="text-muted">
          PlanetTerp has nothing on this instructor yet.
        </p>
      ) : review.status === "loading" ? (
        <div className="mt-1 flex items-start gap-2">
          <div className="min-w-0 flex-1 space-y-1.5" aria-busy="true">
            <Skeleton className="h-2.5 w-full" />
            <Skeleton className="h-2.5 w-4/5" />
            <div className="flex items-center gap-1 text-xs text-faint">
              <AiSparkles size={11} aria-hidden="true" />
              Summarizing {pt.reviewCount} reviews…
            </div>
          </div>
          <AiMenu />
        </div>
      ) : review.status === "shown" ? (
        <div className="fade-in-0 animate-in duration-200">
          <div className="mt-1 flex items-start gap-2">
            <p className="min-w-0 flex-1 text-muted leading-5">
              <AiSparkles
                size={11}
                role="img"
                aria-label="AI summary"
                className="-mt-0.5 mr-1 inline text-fg"
              />
              {review.summary.summary}
            </p>
            <AiMenu />
          </div>
          {review.summary.themes.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1">
              {review.summary.themes.map((t) => (
                <span
                  key={t.label}
                  className={cn(
                    "rounded px-1.5 py-0.5 text-xs",
                    t.sentiment === "positive"
                      ? "bg-ok-soft text-ok"
                      : t.sentiment === "negative"
                        ? "bg-warn-soft text-warn"
                        : "bg-hover text-muted",
                  )}
                >
                  {t.label}
                </span>
              ))}
            </div>
          ) : null}
          <p className="mt-2 text-xs text-faint">
            {summarySourceWords(review.summary)}.
          </p>
        </div>
      ) : pt.reviewCount > 0 ? (
        <p className="mt-1 text-xs text-faint">
          {pt.reviewCount} review{pt.reviewCount === 1 ? "" : "s"} on
          PlanetTerp.
        </p>
      ) : null}
      {freshness && !loading ? (
        <p className="mt-1 text-xs text-faint" data-testid="pt-freshness">
          {freshness}
        </p>
      ) : null}
      {pt && pt.reviewCount > 0 && !loading ? (
        <p className="mt-2">
          <ReadThem slug={pt.slug} course={course.code} name={name} />
        </p>
      ) : null}
    </div>
  );
}

/** "Summary of 48 PlanetTerp reviews", or of both sources' reviews. */
export function summarySourceWords(summary: ReviewSummary): string {
  const plural = (n: number) => (n === 1 ? "" : "s");
  const terpsicle = summary.sources?.terpsicle ?? 0;
  if (terpsicle === 0) {
    const n = summary.basedOnReviewCount;
    return `Summary of ${n} PlanetTerp review${plural(n)}`;
  }
  const planetterp = summary.sources?.planetterp ?? 0;
  if (planetterp === 0)
    return `Summary of ${terpsicle} Terpsicle review${plural(terpsicle)}`;
  const n = planetterp + terpsicle;
  return `Summary of ${n} reviews: ${planetterp} on PlanetTerp, ${terpsicle} on Terpsicle`;
}

/**
 * Where full reviews live, on a line of its own so it can't read as the
 * source note's (QA S3): Terpsicle Reviews once it's open here (V2 §7.1),
 * as a View link, else PlanetTerp, named. A plain link, like the product
 * menu's: none of Reviews' code loads with the scheduler.
 */
function ReadThem({
  slug,
  course,
  name,
}: {
  slug: string;
  course: CourseCode;
  name: string;
}) {
  const reviews = useAccount((s) => s.flags.reviews);
  const link =
    "inline-flex min-h-11 items-center gap-1 font-medium text-fg underline underline-offset-2 hover:no-underline md:min-h-0";
  if (reviews !== "off")
    return (
      <WithTooltip
        label={`All of ${name}'s reviews and grades in ${course}, in Terpsicle Reviews`}
      >
        <a
          href={`/reviews/instructors/${encodeURIComponent(slug)}?course=${course}`}
          onClick={() => crossLinkClicked("schedule", "reviews")}
          className={link}
        >
          {viewWords("reviews")}
          <ArrowRight size={12} aria-hidden="true" />
        </a>
      </WithTooltip>
    );
  return (
    <WithTooltip label="Opens PlanetTerp in a new tab">
      <a
        href={planetTerpUrl(slug)}
        target="_blank"
        rel="noreferrer"
        className={link}
      >
        Read them on PlanetTerp
      </a>
    </WithTooltip>
  );
}
