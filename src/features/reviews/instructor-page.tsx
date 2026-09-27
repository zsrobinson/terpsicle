import { Link } from "@tanstack/react-router";
import { cn } from "cn";
import { crossLinkClicked } from "~/app/cross-link";
import { formatGpa, gradeSummary } from "~/core/grades/grades";
import {
  gradesSourceWords,
  planetTerpFreshnessWords,
} from "~/core/grades/source";
import {
  type CombinedRating,
  combinedRatingWords,
  combineRatings,
  formatStars,
  type InstructorPageData,
  type RatingSource,
  terpsicleRating,
} from "~/core/reviews";
import type { CourseCode, InstructorId } from "~/core/schema";
import { Skeleton } from "~/ui/skeleton";
import { WithTooltip } from "~/ui/tooltip";
import { Breadcrumbs, PageTitle, ReviewsFrame, Section } from "./frame";
import { useReviewsLevel } from "./level";
import { GradesBlock, SummaryBlock } from "./planetterp-blocks";
import { Stars } from "./rating";
import {
  ReviewsSection,
  useInstructorReviews,
  useMine,
} from "./reviews-section";

// /reviews/instructors/$id (V2 §1.1): an instructor's combined rating, the
// AI summary, PlanetTerp's grades and our reviews; `?course=CMSC351` narrows
// it to one course. The route's loader read who they are and their grades
// (page-data.ts); our reviews load here, once /api/me says Reviews is on.

/** The route's page: what the loader read. */
export function InstructorPage({ data }: { data: InstructorPageData }) {
  const { id, course } = data;
  const level = useReviewsLevel();
  const list = useInstructorReviews(id);
  const mine = useMine();
  const name =
    data.name ??
    mine.find((r) => r.instructorId === id)?.instructorName ??
    null;
  const grades = new Map(data.courses.map((c) => [c.code, c.grades]));

  // Their courses: PlanetTerp's grade data, and ours.
  const courses = new Set<CourseCode>(data.courses.map((c) => c.code));
  if (list?.status === "ready")
    for (const r of list.reviews) courses.add(r.course);
  if (course) courses.add(course);
  const courseList = [...courses].sort();

  const ours =
    list?.status === "ready" && (level === "read" || level === "on")
      ? terpsicleRating(list.reviews)
      : null;
  const sources: RatingSource[] = [
    {
      source: "planetterp",
      rating: data.planetTerp?.rating ?? null,
      reviewCount: data.planetTerp?.reviewCount ?? 0,
    },
    ...(ours ? [ours] : []),
  ];
  const combined = combineRatings(sources);
  const record = course ? grades.get(course) : undefined;
  const { gradesThrough } = data;
  const freshness = planetTerpFreshnessWords(data.source);
  const loading =
    level === "loading" ||
    ((level === "read" || level === "on") && list?.status === "loading");
  const title = name ?? (loading ? null : "Instructor");

  return (
    <ReviewsFrame page="instructor">
      <Breadcrumbs
        crumbs={[
          { label: "Reviews", to: "/reviews" },
          ...(course
            ? [
                {
                  label: course,
                  to: "/reviews/courses/$code" as const,
                  params: { code: course },
                  mono: true,
                },
              ]
            : []),
        ]}
      />
      <PageTitle
        title={title ?? <Skeleton className="h-6 w-48" />}
        sub={data.ta ? "Teaching assistant" : undefined}
      />

      <RatingSummary combined={combined} loading={loading} />
      {freshness ? (
        <p className="mt-1 text-faint text-xs">{freshness}</p>
      ) : null}

      {courseList.length > 0 ? (
        <CourseFilter id={id} courses={courseList} current={course} />
      ) : null}

      {data.slug &&
      (data.planetTerp?.reviewCount ?? 0) > 0 &&
      (course ?? courseList[0]) ? (
        <SummaryBlock slug={data.slug} course={course ?? courseList[0] ?? ""} />
      ) : null}

      {course ? (
        <Section
          title={`Grades in ${course}`}
          right={<CourseLinks course={course} />}
        >
          <div className="pt-3">
            {record ? (
              <GradesBlock record={record} gradesThrough={gradesThrough} />
            ) : (
              <p className="text-muted">
                PlanetTerp has no grades for {name ?? "them"} in {course}.
              </p>
            )}
          </div>
        </Section>
      ) : data.courses.length > 0 ? (
        <Section title="Grades">
          <ul className="pt-1">
            {courseList.map((c) => {
              const r = grades.get(c);
              const gpa = r ? gradeSummary(r.counts).averageGpa : null;
              return r ? (
                <li
                  key={c}
                  className="flex items-center gap-2 border-hairline border-b py-2"
                >
                  <WithTooltip
                    label={`${name ?? "Their"} grades and reviews in ${c}`}
                  >
                    <Link
                      to="/reviews/instructors/$id"
                      params={{ id }}
                      search={{ course: c }}
                      className="ident font-medium hover:underline"
                    >
                      {c}
                    </Link>
                  </WithTooltip>
                  <span className="tnum ml-auto text-muted">
                    {gpa !== null ? `GPA ${formatGpa(gpa)}` : "No GPA"} ·{" "}
                    {r.semesters} semester{r.semesters === 1 ? "" : "s"}
                  </span>
                  <WithTooltip label={`Everyone who's taught ${c}`}>
                    <Link
                      to="/reviews/courses/$code"
                      params={{ code: c }}
                      className="text-muted text-sm hover:text-fg"
                    >
                      All instructors
                    </Link>
                  </WithTooltip>
                </li>
              ) : null;
            })}
          </ul>
          <p className="mt-2 text-faint text-xs">
            Grades {gradesSourceWords(gradesThrough)}.
          </p>
        </Section>
      ) : null}

      <ReviewsSection
        instructorId={id}
        course={course}
        target={
          course && name
            ? {
                instructorId: id,
                reviewedName: name,
                dept: course.slice(0, 4),
                course,
              }
            : null
        }
        planetTerpSlug={data.slug}
        planetTerpCount={data.planetTerp?.reviewCount ?? 0}
      />
    </ReviewsFrame>
  );
}

/** From one instructor's view of a course: the course's page and its sections. */
function CourseLinks({ course }: { course: CourseCode }) {
  return (
    <span className="flex items-center gap-3 text-sm">
      <WithTooltip label={`Everyone who's taught ${course}`}>
        <Link
          to="/reviews/courses/$code"
          params={{ code: course }}
          className="text-muted hover:text-fg"
        >
          All instructors
        </Link>
      </WithTooltip>
      <WithTooltip label={`${course}'s sections this term`}>
        <Link
          to="/schedule/course/$code"
          params={{ code: course }}
          onClick={() => crossLinkClicked("reviews", "schedule")}
          className="text-muted hover:text-fg"
        >
          View schedule
        </Link>
      </WithTooltip>
    </span>
  );
}

/** The big number, with its math written out under it. */
function RatingSummary({
  combined,
  loading,
}: {
  combined: CombinedRating;
  loading: boolean;
}) {
  if (loading && combined.rating === null)
    return <Skeleton className="h-8 w-40" />;
  if (combined.rating === null)
    return <p className="text-muted">No reviews yet.</p>;
  const words = combinedRatingWords(combined);
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <WithTooltip label={words}>
        <span className="tnum inline-flex items-center gap-2">
          <span className="font-semibold text-xl">
            {formatStars(combined.rating)}
          </span>
          <Stars rating={Math.round(combined.rating)} />
        </span>
      </WithTooltip>
      <span className="tnum text-muted" data-testid="rating-math">
        {words.replace(/^\d\.\d /, "")}
      </span>
    </div>
  );
}

function CourseFilter({
  id,
  courses,
  current,
}: {
  id: InstructorId;
  courses: readonly CourseCode[];
  current: CourseCode | null;
}) {
  const chip = (on: boolean) =>
    cn(
      "flex h-7 shrink-0 items-center rounded-md px-2.5 text-sm transition-colors",
      on
        ? "bg-accent-soft font-medium text-fg"
        : "text-muted hover:bg-hover hover:text-fg",
    );
  return (
    <nav aria-label="Courses" className="mt-4 flex flex-wrap gap-1">
      <WithTooltip label="Reviews from every course they've taught">
        <Link
          to="/reviews/instructors/$id"
          params={{ id }}
          search={{}}
          aria-current={current === null ? "page" : undefined}
          className={chip(current === null)}
        >
          All courses
        </Link>
      </WithTooltip>
      {courses.map((c) => (
        <WithTooltip key={c} label={`Only ${c}`}>
          <Link
            to="/reviews/instructors/$id"
            params={{ id }}
            search={{ course: c }}
            aria-current={current === c ? "page" : undefined}
            className={cn(chip(current === c), "ident")}
          >
            {c}
          </Link>
        </WithTooltip>
      ))}
    </nav>
  );
}
