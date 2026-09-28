import { Link, useNavigate } from "@tanstack/react-router";
import { cn } from "cn";
import { useState } from "react";
import { crossLinkClicked, viewWords } from "~/app/cross-link";
import { PanelNote } from "~/app/panel";
import { formatGpa, gradeSummary } from "~/core/grades/grades";
import {
  gradesSourceWords,
  planetTerpFreshnessWords,
} from "~/core/grades/source";
import {
  type CombinedRating,
  combinedRatingWords,
  combineRatings,
  courseSlug,
  formatStars,
  type InstructorPageData,
  instructorSlug,
  type RatingSource,
  terpsicleRating,
} from "~/core/reviews";
import type { CourseCode, InstructorId, PageReviews } from "~/core/schema";
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
import { WithTooltip } from "~/ui/tooltip";
import { type View, ViewSwitch } from "~/ui/view-switch";
import type { ComposerTarget } from "./composer";
import { PAGE_NOTE, PAGE_ROW, ReviewsFrame } from "./frame";
import { useReviewsLevel, useSignedIn } from "./level";
import { GradesBlock, SummaryBlock } from "./planetterp-blocks";
import { Stars } from "./rating";
import {
  type Composing,
  existingReview,
  ReviewsSection,
  useMine,
  useOwnHere,
  WriteButton,
} from "./reviews-section";

// /reviews/<instructor> (V2 §1.1): who they are, their combined rating, the
// AI summary, then the reviews, ours and PlanetTerp's, and last their grades
// (owner, 2026-09-28: "reviews are more important to display than grades").
// `?course=CMSC351` narrows it to one course. The route's loader read it
// all, so the server's HTML has it.

/**
 * Courses the header's view switch holds, besides "All courses": the kit's
 * switch is two to seven views. Past that, the choice is a list.
 */
const SWITCH_COURSES = 6;
/** Courses the status line names. */
const STATUS_COURSES = 3;

/** The route's page: what the loader read. */
export function InstructorPage({
  data,
  reviews,
  write,
}: {
  data: InstructorPageData;
  reviews: PageReviews;
  /** `?write`: open the form (from "Review your instructors"). */
  write: boolean;
}) {
  const { id, course } = data;
  const level = useReviewsLevel();
  const signedIn = useSignedIn();
  const mine = useMine();
  const [composing, setComposing] = useState<Composing>(write ? "new" : null);
  const name =
    data.name ??
    mine.find((r) => r.instructorId === id)?.instructorName ??
    "Instructor";
  const grades = new Map(data.courses.map((c) => [c.code, c.grades]));

  // Their courses: PlanetTerp's grade data, and what reviews are about.
  const courses = new Set<CourseCode>(data.courses.map((c) => c.code));
  for (const r of reviews.terpsicle ?? []) courses.add(r.course);
  if (course) courses.add(course);
  const courseList = [...courses].sort();

  // Ours: every course's (the loader's, live), or the published numbers
  // when the page shows one course's reviews.
  const ours: RatingSource | null =
    !course && reviews.terpsicle
      ? terpsicleRating(reviews.terpsicle)
      : data.terpsicle
        ? { source: "terpsicle", ...data.terpsicle }
        : null;
  const combined = combineRatings([
    {
      source: "planetterp",
      rating: data.planetTerp?.rating ?? null,
      reviewCount: data.planetTerp?.reviewCount ?? 0,
    },
    ...(ours ? [ours] : []),
  ]);
  const record = course ? grades.get(course) : undefined;
  const { gradesThrough } = data;
  const freshness = planetTerpFreshnessWords(data.source);
  const taught = data.courses.slice(0, STATUS_COURSES).map((c) => c.code);

  const target: ComposerTarget | null =
    course && data.name
      ? {
          instructorId: id,
          reviewedName: data.name,
          dept: course.slice(0, 4),
          course,
        }
      : null;
  const ownHere = useOwnHere(id, course);
  const existing = existingReview(ownHere, target);

  return (
    <ReviewsFrame page="instructor">
      <PageHeader
        size="display"
        back={
          course
            ? {
                label: course,
                to: "/reviews/$slug",
                params: { slug: courseSlug(course) },
              }
            : { label: "Reviews", to: "/reviews" }
        }
        eyebrow={data.ta ? "Teaching assistant" : "Instructor"}
        title={name}
        status={
          taught.length > 0 ? (
            <span>
              Taught{" "}
              {taught.map((c, i) => (
                <span key={c}>
                  {i > 0 ? (i === taught.length - 1 ? " and " : ", ") : ""}
                  <span className="ident">{c}</span>
                </span>
              ))}
              {data.courses.length > STATUS_COURSES ? " and more" : ""}
            </span>
          ) : undefined
        }
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

      <RatingSummary combined={combined} freshness={freshness} />

      {data.slug &&
      (data.planetTerp?.reviewCount ?? 0) > 0 &&
      (course ?? courseList[0]) ? (
        <SummaryBlock slug={data.slug} course={course ?? courseList[0] ?? ""} />
      ) : null}

      <ReviewsSection
        instructorId={id}
        course={course}
        reviews={reviews}
        count={course ? null : combined.reviewCount}
        target={target}
        composing={composing}
        onCompose={setComposing}
      />

      {course ? (
        <PageSection
          size="display"
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
            <PanelNote className={PAGE_NOTE}>
              PlanetTerp has no grades for {name} in {course}.
            </PanelNote>
          )}
        </PageSection>
      ) : data.courses.length > 0 ? (
        <PageSection size="display" title="Grades">
          <ul>
            {courseList.map((c) => {
              const r = grades.get(c);
              const gpa = r ? gradeSummary(r.counts).averageGpa : null;
              return r ? (
                <ListRow
                  key={c}
                  as="li"
                  className={cn(PAGE_ROW, "text-lg")}
                  trail={
                    <span className="flex items-center gap-4 text-base">
                      <span className="tnum text-muted">
                        {gpa !== null ? `GPA ${formatGpa(gpa)}` : "No GPA"} ·{" "}
                        {r.semesters} semester{r.semesters === 1 ? "" : "s"}
                      </span>
                      <WithTooltip label={`Everyone who's taught ${c}`}>
                        <Link
                          to="/reviews/$slug"
                          params={{ slug: courseSlug(c) }}
                          className="text-muted hover:text-fg hover:underline"
                        >
                          All instructors
                        </Link>
                      </WithTooltip>
                    </span>
                  }
                >
                  <WithTooltip label={`${name}'s grades and reviews in ${c}`}>
                    <Link
                      to="/reviews/$slug"
                      params={{ slug: instructorSlug(id) }}
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
          <p className="text-faint text-sm">
            Grades {gradesSourceWords(gradesThrough)}.
          </p>
        </PageSection>
      ) : null}
    </ReviewsFrame>
  );
}

/**
 * The big number, with its math written out beside it, on the product's
 * soft purple: the one thing on the page that should stand out.
 */
export function RatingSummary({
  combined,
  freshness,
}: {
  combined: CombinedRating;
  /** "No new PlanetTerp reviews since …", when PlanetTerp has stopped. */
  freshness: string | null;
}) {
  const words = combinedRatingWords(combined);
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 bg-product-reviews-soft px-4 py-4">
      {combined.rating === null ? (
        <p className="text-lg">No reviews yet.</p>
      ) : (
        <>
          <WithTooltip label={words}>
            <span className="tnum font-semibold text-3xl text-product-reviews-text">
              {formatStars(combined.rating)}
            </span>
          </WithTooltip>
          <div className="flex min-w-0 flex-col gap-1">
            <Stars rating={Math.round(combined.rating)} size={18} />
            <span
              className="tnum text-base text-muted"
              data-testid="rating-math"
            >
              {words.replace(/^\d\.\d /, "")}
            </span>
          </div>
        </>
      )}
      {freshness ? (
        <p className="w-full text-muted text-sm">{freshness}</p>
      ) : null}
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
  const slug = instructorSlug(id);
  if (courses.length <= SWITCH_COURSES) {
    const views: View[] = [
      {
        id: "all",
        label: "All courses",
        hint: "Reviews from every course they've taught",
        to: "/reviews/$slug",
        params: { slug },
        search: {},
      },
      ...courses.map((c) => ({
        id: c,
        label: c,
        hint: `Only ${c}`,
        to: "/reviews/$slug" as const,
        params: { slug },
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
          to: "/reviews/$slug",
          params: { slug },
          search: value === "all" ? {} : { course: value },
        })
      }
    >
      <WithTooltip label="Show one course's grades and reviews">
        <SelectTrigger aria-label="Courses" className="w-48">
          <SelectValue />
        </SelectTrigger>
      </WithTooltip>
      <SelectContent align="start" className="max-h-72">
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
