import { Link, useNavigate } from "@tanstack/react-router";
import { cn } from "cn";
import { useState } from "react";
import { PanelNote } from "~/app/panel";
import { crossLinkClicked, viewWords } from "~/app/cross-link";
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
import { ListRow } from "~/ui/list-row";
import { PageHeader } from "~/ui/page-header";
import { PageSection } from "~/ui/page-section";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/ui/select";
import { Skeleton } from "~/ui/skeleton";
import { WithTooltip } from "~/ui/tooltip";
import { type View, ViewSwitch } from "~/ui/view-switch";
import type { ComposerTarget } from "./composer";
import { PAGE_ROW, ReviewsFrame } from "./frame";
import { useReviewsLevel, useSignedIn } from "./level";
import { GradesBlock, SummaryBlock } from "./planetterp-blocks";
import { Stars } from "./rating";
import {
  type Composing,
  existingReview,
  ReviewsSection,
  useInstructorReviews,
  useMine,
  useOwnHere,
  WriteButton,
} from "./reviews-section";

// /reviews/instructors/$id (V2 §1.1): an instructor's combined rating, the
// AI summary, PlanetTerp's grades and our reviews; `?course=CMSC351` narrows
// it to one course. The route's loader read who they are and their grades
// (page-data.ts); our reviews load here, once /api/me says Reviews is on.

/**
 * Courses the header's view switch holds, besides "All courses": the kit's
 * switch is two to seven views. Past that, the choice is a list.
 */
const SWITCH_COURSES = 6;

/** The route's page: what the loader read. */
export function InstructorPage({ data }: { data: InstructorPageData }) {
  const { id, course } = data;
  const level = useReviewsLevel();
  const signedIn = useSignedIn();
  const list = useInstructorReviews(id);
  const mine = useMine();
  const [composing, setComposing] = useState<Composing>(null);
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

  const target: ComposerTarget | null =
    course && name
      ? {
          instructorId: id,
          reviewedName: name,
          dept: course.slice(0, 4),
          course,
        }
      : null;
  const ownHere = useOwnHere(id, course);
  const existing = existingReview(ownHere, target);

  return (
    <ReviewsFrame page="instructor">
      <PageHeader
        back={
          course
            ? {
                label: course,
                to: "/reviews/courses/$code",
                params: { code: course },
              }
            : { label: "Reviews", to: "/reviews" }
        }
        title={title ?? <Skeleton className="h-6 w-48" />}
        status={data.ta ? "Teaching assistant" : undefined}
        views={
          courseList.length > 0 ? (
            <CourseFilter id={id} courses={courseList} current={course} />
          ) : undefined
        }
        actions={
          composing === null || signedIn !== true ? (
            <WriteButton
              level={level}
              target={target}
              existing={existing}
              onWrite={() => setComposing((c) => (c === "new" ? null : "new"))}
            />
          ) : undefined
        }
      />

      <div className="flex flex-col gap-1">
        <RatingSummary combined={combined} loading={loading} />
        {freshness ? <p className="text-faint text-xs">{freshness}</p> : null}
      </div>

      {data.slug &&
      (data.planetTerp?.reviewCount ?? 0) > 0 &&
      (course ?? courseList[0]) ? (
        <SummaryBlock slug={data.slug} course={course ?? courseList[0] ?? ""} />
      ) : null}

      {course ? (
        <PageSection
          title={`Grades in ${course}`}
          aside={
            <WithTooltip label={`${course}'s sections this term`}>
              <Link
                to="/schedule/course/$code"
                params={{ code: course }}
                onClick={() => crossLinkClicked("reviews", "schedule")}
                className="text-muted underline decoration-hairline-strong underline-offset-2 hover:text-fg hover:decoration-fg"
              >
                {viewWords("schedule")}
              </Link>
            </WithTooltip>
          }
        >
          {record ? (
            <GradesBlock record={record} gradesThrough={gradesThrough} />
          ) : (
            <PanelNote className={PAGE_ROW}>
              PlanetTerp has no grades for {name ?? "them"} in {course}.
            </PanelNote>
          )}
        </PageSection>
      ) : data.courses.length > 0 ? (
        <PageSection title="Grades">
          <ul>
            {courseList.map((c) => {
              const r = grades.get(c);
              const gpa = r ? gradeSummary(r.counts).averageGpa : null;
              return r ? (
                <ListRow
                  key={c}
                  as="li"
                  className={PAGE_ROW}
                  trail={
                    <span className="flex items-center gap-3">
                      <span className="text-muted">
                        {gpa !== null ? `GPA ${formatGpa(gpa)}` : "No GPA"} ·{" "}
                        {r.semesters} semester{r.semesters === 1 ? "" : "s"}
                      </span>
                      <WithTooltip label={`Everyone who's taught ${c}`}>
                        <Link
                          to="/reviews/courses/$code"
                          params={{ code: c }}
                          className="text-muted hover:text-fg hover:underline"
                        >
                          All instructors
                        </Link>
                      </WithTooltip>
                    </span>
                  }
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
                </ListRow>
              ) : null;
            })}
          </ul>
          <p className="text-faint text-xs">
            Grades {gradesSourceWords(gradesThrough)}.
          </p>
        </PageSection>
      ) : null}

      <ReviewsSection
        instructorId={id}
        course={course}
        target={target}
        composing={composing}
        onCompose={setComposing}
        planetTerpSlug={data.slug}
        planetTerpCount={data.planetTerp?.reviewCount ?? 0}
      />
    </ReviewsFrame>
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
    return (
      <div role="status" aria-label="Loading the rating">
        <Skeleton className="h-7 w-40" />
      </div>
    );
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

/** "All courses" or one of theirs: each a URL (`?course=`), so a view. */
function CourseFilter({
  id,
  courses,
  current,
}: {
  id: InstructorId;
  courses: readonly CourseCode[];
  current: CourseCode | null;
}) {
  const navigate = useNavigate();
  if (courses.length <= SWITCH_COURSES) {
    const views: View[] = [
      {
        id: "all",
        label: "All courses",
        hint: "Reviews from every course they've taught",
        to: "/reviews/instructors/$id",
        params: { id },
        search: {},
      },
      ...courses.map((c) => ({
        id: c,
        label: c,
        hint: `Only ${c}`,
        to: "/reviews/instructors/$id" as const,
        params: { id },
        search: { course: c },
      })),
    ];
    return (
      <ViewSwitch
        views={views}
        current={current ?? "all"}
        label="Courses"
        className={cn(
          // Codes read as codes; the scroll keeps a long row on a phone.
          "overflow-x-auto [&>a:not(:first-child)]:ident",
        )}
      />
    );
  }
  // Too many for a switch: the same URLs, from a list.
  return (
    <Select
      value={current ?? "all"}
      onValueChange={(value) =>
        void navigate({
          to: "/reviews/instructors/$id",
          params: { id },
          search: value === "all" ? {} : { course: value },
        })
      }
    >
      <WithTooltip label="Show one course's grades and reviews">
        <SelectTrigger aria-label="Courses" className="max-md:h-11 md:h-7">
          <SelectValue />
        </SelectTrigger>
      </WithTooltip>
      <SelectContent align="end" className="max-h-72">
        <SelectItem value="all">All courses</SelectItem>
        {courses.map((c) => (
          <SelectItem key={c} value={c} className="ident">
            {c}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
