import { queryOptions, useQuery } from "@tanstack/react-query";
import { cn } from "cn";
import { Star } from "lucide-react";
import { useState } from "react";
import { Mark } from "~/components/brand/mark";
import { formatGpa, formatShare, gradeSummary } from "~/core/grades";
import { planetTerpFreshnessWords } from "~/core/grades/source";
import { combinedRatingWords, formatStars, mergeReviews } from "~/core/reviews";
import type {
  Course,
  CourseCode,
  InstructorSlug,
  PlanetTerpDept,
} from "~/core/schema";
import { formatMonthYear } from "~/core/time/format";
import { useIsMobile } from "~/hooks/use-media-query";
import { clientConfig } from "~/lib/config";
import { lazyComponent } from "~/lib/lazy-component";
import { api } from "~/server/fns/api";
import { deptOf, useCatalog } from "~/state/catalog-store";
import { useInstructors, usePlanetTerpStatus } from "~/state/data-hooks";
import { InlineError } from "~/ui/inline-error";
import { Popover, PopoverContent, PopoverTrigger } from "~/ui/popover";
import { Skeleton } from "~/ui/skeleton";
import { WithTooltip } from "~/ui/tooltip";
import { instructorFor } from "./planetterp";
import { ReadThem, useCombinedRating } from "./reviews";

// A small Reviews, where you pick a section (owner, 2026-09-29: "a little
// popover that's like a mini version/preview of the [reviews] tab, with the
// option to open the full one up too"): their rating, their grades in the
// course, the newest few reviews, and View reviews for the rest. A popover
// on a desktop, a sheet on a phone. It carries Reviews' mark, as every
// product's part inside another does (docs/decisions.md). Nothing of
// Reviews' pages loads with the scheduler: this asks `reviews/page` itself.

/** Reviews the preview shows. */
const SHOWN = 3;
/** How long a preview's reviews count as current: they change nightly. */
const PREVIEW_STALE_MS = 10 * 60_000;

/** One instructor's newest reviews in a course, ours and PlanetTerp's. */
export function instructorReviewsQuery(
  slug: InstructorSlug,
  course: CourseCode,
  planetTerpName: string,
) {
  return queryOptions({
    queryKey: ["reviews", "preview", slug, course],
    // Their name lets the server fetch reviews the nightly job hasn't
    // stored; fixtures' names aren't PlanetTerp's, and e2e stays offline.
    queryFn: () =>
      api.reviews.page({
        instructorId: slug,
        course,
        ...(clientConfig.dataSource === "live" ? { planetTerpName } : {}),
      }),
    staleTime: PREVIEW_STALE_MS,
    retry: 1,
  });
}

/**
 * "Reviews", with Reviews' mark, in an instructor's header: opens the
 * preview over the page (a sheet on a phone). `open` is the details'
 * state, so a link to their instructors can open the first one.
 */
const PreviewSheet = lazyComponent(
  () => import("./reviews-preview-sheet").then((m) => m.ReviewsPreviewSheet),
  () => null,
  { Loading: null },
);

export function ReviewsPreviewButton({
  name,
  course,
  planetTerp,
  loading,
  open,
  onOpenChange,
}: {
  name: string;
  course: Course;
  planetTerp: PlanetTerpDept | null;
  loading: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const phone = useIsMobile();
  // Once opened, the sheet stays mounted so it can animate closed.
  const [opened, setOpened] = useState(false);
  if (open && !opened) setOpened(true);
  const trigger = (
    <button
      type="button"
      aria-expanded={open}
      aria-haspopup="dialog"
      onPointerDown={phone ? () => void PreviewSheet.preload() : undefined}
      onClick={phone ? () => onOpenChange(!open) : undefined}
      className={cn(
        "flex h-6 shrink-0 items-center gap-1 rounded-md px-1.5 text-xs transition-colors max-md:h-11",
        open ? "bg-hover text-fg" : "text-muted hover:bg-hover hover:text-fg",
      )}
    >
      <Mark id="reviews" size={14} />
      Reviews
    </button>
  );
  const tooltip = `What students say about ${name}, and their grades in ${course.code}`;
  const body = (
    <ReviewsPreview
      name={name}
      course={course}
      planetTerp={planetTerp}
      loading={loading}
    />
  );
  if (phone)
    return (
      <>
        <WithTooltip label={tooltip}>{trigger}</WithTooltip>
        {/* Mounted from the first open, so its code comes with it. */}
        {open || opened ? (
          <PreviewSheet open={open} onOpenChange={onOpenChange} name={name}>
            {body}
          </PreviewSheet>
        ) : null}
      </>
    );
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <WithTooltip label={tooltip}>
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      </WithTooltip>
      <PopoverContent
        side="bottom"
        align="end"
        aria-label={`${name}'s reviews`}
        className="max-h-(--available-height) w-[22rem] overflow-y-auto p-4"
      >
        <h3 className="emph-heading mb-2 text-base">{name}</h3>
        {body}
      </PopoverContent>
    </Popover>
  );
}

/** The preview itself: the numbers, the newest reviews, and the way on. */
export function ReviewsPreview({
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
  const combined = useCombinedRating(name, course, planetTerp);
  const record = pt
    ? planetTerp?.courses[course.code]?.byInstructor[pt.slug]
    : undefined;
  const grades = record ? gradeSummary(record.counts) : null;
  const { source, failed } = usePlanetTerpStatus(deptOf(course.code));
  // The same query course details loaded it with: Try again asks it again.
  const { retry } = useInstructors(deptOf(course.code));
  // A newer format than this tab reads: only Reload helps.
  const stale = useCatalog((s) => s.appStale);
  const freshness = pt ? planetTerpFreshnessWords(source) : null;
  const reviews = useQuery({
    ...instructorReviewsQuery(pt?.slug ?? "", course.code, pt?.name ?? name),
    enabled: pt !== null && !loading,
  });
  const shown = reviews.data
    ? mergeReviews(
        reviews.data.terpsicle ?? [],
        reviews.data.planetTerp,
        true,
      ).slice(0, SHOWN)
    : [];

  return (
    <div className="flex flex-col gap-3 text-sm" data-instructor={name}>
      {combined?.rating != null ? (
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="tnum inline-flex items-center gap-1 font-semibold text-2xl text-product-reviews-text">
            {formatStars(combined.rating)}
          </span>
          <span className="tnum text-muted">
            {combinedRatingWords(combined).replace(/^\d\.\d /, "")}
          </span>
        </p>
      ) : null}
      {grades?.aOrBShare != null ? (
        <p className="tnum text-muted">
          In {course.code}, {formatShare(grades.aOrBShare)} got an A or B
          {grades.averageGpa !== null
            ? ` · GPA ${formatGpa(grades.averageGpa)}`
            : ""}
          .
        </p>
      ) : null}

      {loading ? (
        <Skeleton className="h-2.5 w-2/3" />
      ) : failed && !planetTerp ? (
        <InlineError
          className="py-0"
          message={
            stale
              ? "Terpsicle has been updated since this page opened. Reload to see PlanetTerp's reviews."
              : "Couldn't load reviews from PlanetTerp. Check your connection and try again."
          }
          onRetry={retry}
          reload={stale}
          retryTooltip={stale ? undefined : "Load PlanetTerp's reviews again"}
        />
      ) : !pt ? (
        <p className="text-muted">
          PlanetTerp has nothing on this instructor yet.
        </p>
      ) : reviews.isError ? (
        <InlineError
          className="py-0"
          message="Couldn't load their reviews. Check your connection and try again."
          onRetry={() => void reviews.refetch()}
          retryTooltip="Load their reviews again"
        />
      ) : reviews.isPending ? (
        <div className="flex flex-col gap-2" aria-busy="true">
          <Skeleton className="h-2.5 w-full" />
          <Skeleton className="h-2.5 w-4/5" />
          <Skeleton className="h-2.5 w-full" />
        </div>
      ) : shown.length === 0 ? (
        <p className="text-muted">
          {pt.reviewCount > 0
            ? `${pt.reviewCount} review${pt.reviewCount === 1 ? "" : "s"} on PlanetTerp, none about ${course.code}.`
            : `No reviews of them yet.`}
        </p>
      ) : (
        <ul className="flex flex-col" aria-label="Newest reviews">
          {shown.map((r) => (
            <li
              key={r.review.id}
              className="flex flex-col gap-1 border-hairline border-t py-2 first:border-t-0 first:pt-0"
            >
              <span className="flex items-center gap-2 text-muted text-xs">
                <SmallStars rating={r.review.rating} />
                <span className="tnum">
                  {formatMonthYear(r.review.createdMonth)}
                </span>
                {r.source === "planetterp" ? <span>PlanetTerp</span> : null}
              </span>
              <p className="line-clamp-4 whitespace-pre-line break-words">
                {r.review.body}
              </p>
            </li>
          ))}
        </ul>
      )}
      {pt && pt.reviewCount > 0 && !loading ? (
        <p className="text-muted text-xs">
          {pt.reviewCount} review{pt.reviewCount === 1 ? "" : "s"} on
          PlanetTerp.
        </p>
      ) : null}
      {freshness && !loading ? (
        <p className="text-faint text-xs" data-testid="pt-freshness">
          {freshness}
        </p>
      ) : null}
      {pt && !loading ? (
        <p>
          <ReadThem slug={pt.slug} course={course.code} name={name} />
        </p>
      ) : null}
    </div>
  );
}

/** A review's stars, read out as "4 of 5 stars". */
function SmallStars({ rating }: { rating: number }) {
  return (
    <span
      role="img"
      aria-label={`${rating} of 5 stars`}
      className="inline-flex items-center gap-0.5"
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={11}
          aria-hidden="true"
          className={
            n <= rating ? "fill-current text-warn" : "text-hairline-strong"
          }
        />
      ))}
    </span>
  );
}
