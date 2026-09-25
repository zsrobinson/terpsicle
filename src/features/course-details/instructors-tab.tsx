import { cn } from "cn";
import { Sparkles, Star } from "lucide-react";
import {
  formatGpa,
  formatRating,
  formatShare,
  gradeSummary,
} from "~/core/grades";
import { type Course, type PlanetTerpDept, planetTerpUrl } from "~/core/schema";
import { Skeleton } from "~/ui/skeleton";
import { WithTooltip } from "~/ui/tooltip";
import { instructorFor } from "./planetterp";
import { useReviewSummary } from "./use-review-summary";

// Instructors (SPEC §3.4): a card for each, with rating, reviews, average GPA
// and % A or B in this course, and the review summary: the one place in the
// app with the sparkles icon, because it's the one place an LLM wrote words.

/** Everyone who teaches a section, in section order, TBA left out. */
export function courseInstructors(course: Course): string[] {
  const names: string[] = [];
  for (const s of course.sections)
    for (const n of s.instructors) if (!names.includes(n)) names.push(n);
  return names;
}

export function InstructorsTab({
  course,
  planetTerp,
  loading,
  active,
}: {
  course: Course;
  planetTerp: PlanetTerpDept | null;
  loading: boolean;
  /** Only the tab on screen asks for summaries. */
  active: boolean;
}) {
  const names = courseInstructors(course);
  if (names.length === 0)
    return (
      <p className="text-[12.5px] text-muted">
        Instructors aren't announced yet.
      </p>
    );
  return (
    <div className="flex flex-col gap-2">
      {names.map((name) => (
        <InstructorCard
          key={name}
          name={name}
          course={course}
          planetTerp={planetTerp}
          loading={loading}
          active={active}
        />
      ))}
      <p className="text-[11px] text-faint">
        Ratings and grades from PlanetTerp.
      </p>
    </div>
  );
}

function InstructorCard({
  name,
  course,
  planetTerp,
  loading,
  active,
}: {
  name: string;
  course: Course;
  planetTerp: PlanetTerpDept | null;
  loading: boolean;
  active: boolean;
}) {
  const pt = instructorFor(planetTerp, name);
  const rating = pt ? formatRating(pt.rating, pt.reviewCount) : null;
  const grades = pt
    ? planetTerp?.courses[course.code]?.byInstructor[pt.slug]
    : undefined;
  const summary = grades ? gradeSummary(grades.counts) : null;
  const review = useReviewSummary(
    pt && pt.reviewCount > 0 ? pt.slug : null,
    course.code,
    { enabled: active },
  );
  return (
    <div
      className="rounded-lg border border-hairline p-3"
      data-instructor={name}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-medium text-[12.5px]">{name}</span>
        {rating?.rating ? (
          <span className="tnum inline-flex shrink-0 items-center gap-0.5 text-[12px]">
            <Star size={11} aria-hidden className="fill-current text-warn" />
            {rating.rating}
            <span className="text-muted">({pt?.reviewCount})</span>
          </span>
        ) : pt ? (
          <span className="text-[11.5px] text-muted">{rating?.reviews}</span>
        ) : null}
      </div>
      {summary?.averageGpa != null && summary.aOrBShare != null ? (
        <div className="tnum mt-0.5 text-[11.5px] text-muted">
          In {course.code}: average GPA {formatGpa(summary.averageGpa)},{" "}
          {formatShare(summary.aOrBShare)} A or B
        </div>
      ) : null}
      {loading ? (
        <Skeleton className="mt-2 h-2.5 w-2/3" />
      ) : !pt ? (
        <p className="mt-1 text-[11.5px] text-muted">
          PlanetTerp has nothing on this instructor yet.
        </p>
      ) : review.status === "loading" ? (
        <div className="mt-2 space-y-1.5" aria-busy="true">
          <Skeleton className="h-2.5 w-full animate-pulse" />
          <Skeleton className="h-2.5 w-4/5 animate-pulse" />
          <div className="flex items-center gap-1 text-[11px] text-faint">
            <Sparkles size={11} aria-hidden="true" />
            Summarizing {pt.reviewCount} reviews…
          </div>
        </div>
      ) : review.status === "shown" ? (
        <div className="fade-in-0 animate-in duration-200">
          <p className="mt-1.5 text-[12px] text-muted leading-relaxed">
            <Sparkles
              size={11}
              aria-label="Written by AI from reviews"
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
                    "rounded px-1.5 py-0.5 text-[11px]",
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
          <div className="mt-2 text-[11px] text-faint">
            Summary of {review.summary.basedOnReviewCount} PlanetTerp review
            {review.summary.basedOnReviewCount === 1 ? "" : "s"} ·{" "}
            <ReadThem slug={pt.slug} />
          </div>
        </div>
      ) : pt.reviewCount > 0 ? (
        <div className="mt-1.5 text-[11px] text-faint">
          {pt.reviewCount} review{pt.reviewCount === 1 ? "" : "s"} on PlanetTerp
          · <ReadThem slug={pt.slug} />
        </div>
      ) : null}
    </div>
  );
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
