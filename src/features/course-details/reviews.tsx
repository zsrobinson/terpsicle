import { ArrowRight } from "lucide-react";
import { ViewWords } from "~/components/brand/view-words";
import { MetaSep } from "~/components/panel";
import { formatGpa, formatRating, gradeSummary } from "~/core/grades";
import { combinedRatingWords, combineRatings } from "~/core/reviews";
import { instructorPagePath } from "~/core/reviews/slugs";
import {
  type Course,
  type CourseCode,
  type Instructor,
  type PlanetTerpDept,
  planetTerpUrl,
} from "~/core/schema";
import { useAccount } from "~/features/auth/account-store";
import { crossLinkClicked } from "~/lib/cross-link";
import { deptOf } from "~/state/catalog-store";
import { useTerpsicleReviews } from "~/state/data-hooks";
import { terpsicleInstructor } from "~/state/query/review-numbers";
import { StarMark } from "~/ui/stars";
import { WithTooltip } from "~/ui/tooltip";
import { instructorFor } from "./planetterp";

// Instructors, where the choice is made (UX review §3.4): name, rating and
// GPA in the group header, and "Reviews" opening a preview of what students
// say (./reviews-preview.tsx).

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
export function useCombinedRating(
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
            <StarMark />
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

/**
 * Where full reviews live, on a line of its own so it can't read as the
 * source note's (QA S3): Terpsicle Reviews once it's open here (V2 §7.1),
 * as a View link, else PlanetTerp, named. A plain link, like the product
 * menu's: none of Reviews' code loads with the scheduler.
 */
export function ReadThem({
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
          href={`${instructorPagePath(slug)}?course=${course}`}
          onClick={() => crossLinkClicked("schedule", "reviews")}
          className={link}
        >
          <ViewWords to="reviews" size={12} />
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
