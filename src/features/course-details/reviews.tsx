import { ArrowRight, PenLine } from "lucide-react";
import { IntegrationLabel } from "~/components/brand/integration-label";
import { MetaSep } from "~/components/panel";
import { formatGpa, formatRating, gradeSummary } from "~/core/grades";
import {
  type CombinedRating,
  combinedRatingWords,
  combineRatings,
} from "~/core/reviews";
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
import { OutsideLink } from "~/ui/outside-link";
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
 * The instructor's rating, PlanetTerp's alone (V2 §7.6): the header and the
 * preview say the same number, credited to PlanetTerp, and never mix in
 * ours, which only our Reviews pages show (docs/decisions.md, "Reviews link
 * out to PlanetTerp"; QA found 4.5 (97) here against 4.6 (88) there).
 */
export function instructorRating(
  name: string,
  planetTerp: PlanetTerpDept | null,
): CombinedRating | null {
  if (!name) return null;
  const pt = instructorFor(planetTerp, name);
  return combineRatings([
    {
      source: "planetterp",
      rating: pt?.rating ?? null,
      reviewCount: pt?.reviewCount ?? 0,
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
  const combined = instructorRating(name, planetTerp);
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
 * source note's (QA S3): Terpsicle Reviews while our pages are open here
 * (V2 §7.1), as a View link; otherwise PlanetTerp, as ways out (all their
 * reviews, and the professor's page, one button from PlanetTerp's form,
 * which has no address of its own). A plain link, like the product menu's:
 * none of Reviews' code loads with the scheduler.
 */
export function ReadThem({
  slug,
  course,
  name,
  reviewCount,
}: {
  slug: string;
  course: CourseCode;
  name: string;
  /** PlanetTerp's count of their reviews. */
  reviewCount: number;
}) {
  const ours = useAccount(
    (s) => s.flags.reviewsPages && s.flags.reviews !== "off",
  );
  const link =
    "inline-flex min-h-11 items-center gap-1 font-medium text-fg underline underline-offset-2 hover:no-underline md:min-h-0";
  if (ours)
    return (
      <p>
        <WithTooltip
          label={`All of ${name}'s reviews and grades in ${course}, in Terpsicle Reviews`}
        >
          <a
            href={`${instructorPagePath(slug)}?course=${course}`}
            onClick={() => crossLinkClicked("schedule", "reviews")}
            className={link}
          >
            <IntegrationLabel product="reviews" />
            <ArrowRight size={12} aria-hidden="true" />
          </a>
        </WithTooltip>
      </p>
    );
  return (
    <p className="flex flex-wrap gap-x-4">
      {reviewCount > 0 ? (
        <WithTooltip label={`${name}'s reviews on PlanetTerp, in a new tab`}>
          <OutsideLink href={planetTerpUrl(slug)} className={link}>
            {reviewCount === 1
              ? "Read it on PlanetTerp"
              : `Read all ${reviewCount.toLocaleString("en-US")} on PlanetTerp`}
          </OutsideLink>
        </WithTooltip>
      ) : null}
      <WithTooltip
        label={`Review ${name} on PlanetTerp: their page has "Review this professor"`}
      >
        <OutsideLink href={planetTerpUrl(slug)} className={link}>
          <PenLine size={12} aria-hidden="true" />
          Review on PlanetTerp
        </OutsideLink>
      </WithTooltip>
    </p>
  );
}
