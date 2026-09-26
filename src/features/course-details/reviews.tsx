import { cn } from "cn";
import { Sparkles, Star } from "lucide-react";
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
  type Instructor,
  type PlanetTerpDept,
  planetTerpUrl,
  type ReviewSummary,
} from "~/core/schema";
import { useAccount } from "~/features/auth/account-store";
import { deptOf } from "~/state/catalog-store";
import { usePlanetTerpStatus, useTerpsicleReviews } from "~/state/data-hooks";
import { terpsicleInstructor } from "~/state/reviews-store";
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
  return (
    <span className="tnum inline-flex shrink-0 items-center gap-1 text-muted">
      {rating?.rating && parts ? (
        <WithTooltip label={parts}>
          <span className="inline-flex items-center gap-0.5">
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
      {rating?.rating && gpa !== null ? <MetaSep /> : null}
      {gpa !== null ? <span>GPA {formatGpa(gpa)}</span> : null}
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
  // Mounted only while open, so the summary is asked for on open (SPEC §4).
  const review = useReviewSummary(
    pt && pt.reviewCount > 0 ? pt.slug : null,
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
        <p className="text-muted">
          Couldn't load reviews from PlanetTerp. Check your connection and
          reopen this course.
        </p>
      ) : !pt ? (
        <p className="text-muted">
          PlanetTerp has nothing on this instructor yet.
        </p>
      ) : review.status === "loading" ? (
        <div className="mt-1 space-y-1.5" aria-busy="true">
          <Skeleton className="h-2.5 w-full animate-pulse" />
          <Skeleton className="h-2.5 w-4/5 animate-pulse" />
          <div className="flex items-center gap-1 text-xs text-faint">
            <Sparkles size={11} aria-hidden="true" />
            Summarizing {pt.reviewCount} reviews…
          </div>
        </div>
      ) : review.status === "shown" ? (
        <div className="fade-in-0 animate-in duration-200">
          <p className="mt-1 text-muted leading-5">
            <Sparkles
              size={11}
              role="img"
              aria-label="AI summary"
              className="-mt-0.5 mr-1 inline text-fg"
            />
            {review.summary.summary}
          </p>
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
          <div className="mt-2 text-xs text-faint">
            {summarySourceWords(review.summary)} · <ReadThem slug={pt.slug} />
          </div>
        </div>
      ) : pt.reviewCount > 0 ? (
        <div className="mt-1 text-xs text-faint">
          {pt.reviewCount} review{pt.reviewCount === 1 ? "" : "s"} on PlanetTerp
          · <ReadThem slug={pt.slug} />
        </div>
      ) : null}
      {freshness && !loading ? (
        <p className="mt-1 text-xs text-faint" data-testid="pt-freshness">
          {freshness}
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

function ReadThem({ slug }: { slug: string }) {
  return (
    <WithTooltip label="Open on PlanetTerp">
      <a
        href={planetTerpUrl(slug)}
        target="_blank"
        rel="noreferrer"
        className="underline underline-offset-2 hover:text-fg"
      >
        read them
      </a>
    </WithTooltip>
  );
}
