import { Link } from "@tanstack/react-router";
import { cn } from "cn";
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
  type RatingSource,
  terpsicleRating,
} from "~/core/reviews";
import {
  type CourseCode,
  CourseCodeSchema,
  type DeptCode,
  type InstructorId,
  InstructorIdSchema,
} from "~/core/schema";
import { NotFoundPage } from "~/features/site/not-found-page";
import { Skeleton } from "~/ui/skeleton";
import { WithTooltip } from "~/ui/tooltip";
import { loadPlanetTerp, useLoaded } from "./data";
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
// it to one course. PlanetTerp's department file says who they are, so the
// page needs a department: the course's, else one learned this visit, else
// the one their reviews are in.

/** Instructor → a department PlanetTerp lists them in, learned this visit. */
const knownDept = new Map<InstructorId, DeptCode>();

/** The route's params, checked: a bad id or course is "Page not found". */
export function InstructorRoute({
  id,
  course,
}: {
  id: string;
  course: string | undefined;
}) {
  const parsedId = InstructorIdSchema.safeParse(id);
  const parsedCourse = CourseCodeSchema.safeParse(course?.toUpperCase());
  if (!parsedId.success) return <NotFoundPage />;
  return (
    <InstructorPage
      key={parsedId.data}
      id={parsedId.data}
      course={parsedCourse.success ? parsedCourse.data : null}
    />
  );
}

export function InstructorPage({
  id,
  course,
}: {
  id: InstructorId;
  course: CourseCode | null;
}) {
  const level = useReviewsLevel();
  const list = useInstructorReviews(id);
  const mine = useMine();
  const fromReviews =
    list?.status === "ready" ? list.reviews[0]?.course.slice(0, 4) : undefined;
  const fromMine = mine.find((r) => r.instructorId === id)?.course.slice(0, 4);
  const dept =
    course?.slice(0, 4) ?? knownDept.get(id) ?? fromReviews ?? fromMine ?? null;
  if (dept && !knownDept.has(id)) knownDept.set(id, dept);
  const planetTerp = useLoaded(dept ? `pt:${dept}` : null, () =>
    loadPlanetTerp(dept ?? ""),
  );

  const ptDept = planetTerp.status === "ready" ? planetTerp.data.dept : null;
  const pt = ptDept?.instructors[id] ?? null;
  const name =
    pt?.name ?? mine.find((r) => r.instructorId === id)?.instructorName ?? null;

  // Their courses: PlanetTerp's grade data in this department, and ours.
  const courses = new Set<CourseCode>();
  for (const [code, grades] of Object.entries(ptDept?.courses ?? {}))
    if (grades.byInstructor[id]) courses.add(code);
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
      rating: pt?.rating ?? null,
      reviewCount: pt?.reviewCount ?? 0,
    },
    ...(ours ? [ours] : []),
  ];
  const combined = combineRatings(sources);
  const record = course ? ptDept?.courses[course]?.byInstructor[id] : undefined;
  const gradesThrough =
    planetTerp.status === "ready" ? planetTerp.data.gradesThrough : null;
  const freshness =
    planetTerp.status === "ready"
      ? planetTerpFreshnessWords(planetTerp.data.source)
      : null;
  const loading =
    level === "loading" ||
    (dept !== null && planetTerp.status === "loading") ||
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
        sub={pt?.type === "ta" ? "Teaching assistant" : undefined}
      />

      <RatingSummary combined={combined} loading={loading} />
      {freshness ? (
        <p className="mt-1 text-faint text-xs">{freshness}</p>
      ) : null}

      {courseList.length > 0 ? (
        <CourseFilter id={id} courses={courseList} current={course} />
      ) : null}

      {pt && pt.reviewCount > 0 && (course ?? courseList[0]) ? (
        <SummaryBlock slug={pt.slug} course={course ?? courseList[0] ?? ""} />
      ) : null}

      {course ? (
        <Section title={`Grades in ${course}`}>
          <div className="pt-3">
            {planetTerp.status === "loading" ? (
              <Skeleton className="h-28 w-full" />
            ) : record ? (
              <GradesBlock record={record} gradesThrough={gradesThrough} />
            ) : (
              <p className="text-muted">
                PlanetTerp has no grades for {name ?? "them"} in {course}.
              </p>
            )}
          </div>
        </Section>
      ) : ptDept &&
        courseList.some((c) => ptDept.courses[c]?.byInstructor[id]) ? (
        <Section title="Grades">
          <ul className="pt-1">
            {courseList.map((c) => {
              const r = ptDept.courses[c]?.byInstructor[id];
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
        planetTerpSlug={pt?.slug ?? null}
        planetTerpCount={pt?.reviewCount ?? 0}
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
