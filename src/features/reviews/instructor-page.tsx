import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";
import { useRef, useState } from "react";
import { PanelNote } from "~/components/panel";
import { addGradeCounts, formatGpa, gradeSummary } from "~/core/grades/grades";
import { planetTerpFreshnessWords } from "~/core/grades/source";
import {
  type CombinedRating,
  combinedRatingWords,
  combineRatings,
  courseSlug,
  formatStars,
  type InstructorPageData,
  instructorSlug,
  type RatingSource,
  reviewedHere,
  reviewedKey,
  terpsicleRating,
  tookHere,
} from "~/core/reviews";
import type {
  CourseCode,
  InstructorId,
  MyReview,
  PageReviews,
} from "~/core/schema";
import { crossLinkClicked, viewWords } from "~/lib/cross-link";
import { Button } from "~/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "~/ui/dropdown-menu";
import { PageHeader } from "~/ui/page-header";
import { PageSection } from "~/ui/page-section";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/ui/select";
import { SplitLayout } from "~/ui/split-layout";
import { WithTooltip } from "~/ui/tooltip";
import { type View, ViewSwitch } from "~/ui/view-switch";
import { Composer, type ComposerTarget } from "./composer";
import { FilterRow } from "./filter-list";
import { PAGE_NOTE, ReviewsFrame } from "./frame";
import { useSignedIn } from "./level";
import { GradesBlock } from "./planetterp-blocks";
import { Stars } from "./rating";
import {
  ReviewBox,
  type ReviewBoxState,
  useBringFormIn,
  useClassesTaken,
  WriteReviewButton,
} from "./review-box";
import { type Composing, ReviewsSection, useMine } from "./reviews-section";
import { SignInPrompt } from "./sign-in-prompt";

// /reviews/<instructor> (V2 §1.1), in two columns (owner, 2026-09-29). The
// wide one reads top to bottom: who they are, their combined rating, the
// box to review them yourself, then the reviews, ours and PlanetTerp's. The
// narrow one holds what goes with them: their courses (each a view of the
// page, `?course=`) and their grades. On a phone it's one
// column, the wide one first, with the courses as the header's switch. The
// route's loader read it all, so the server's HTML has it.

/**
 * Courses a phone's switch holds, besides "All courses": the kit's switch
 * is two to seven views. Past that, the choice is a list.
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
  const signedIn = useSignedIn();
  const mine = useMine();
  const taken = useClassesTaken();
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
  const freshness = planetTerpFreshnessWords(data.source);
  const taught = data.courses.slice(0, STATUS_COURSES).map((c) => c.code);

  // What the box knows: your class with them you haven't reviewed, else
  // your review of them (in this course, when the page shows one).
  const reviewedKeys = new Set(
    mine
      .filter((r) => r.status !== "rejected")
      .map((r) => reviewedKey(r.course, r.reviewedName)),
  );
  const took =
    taken && data.name
      ? tookHere(
          taken,
          {
            course,
            instructorName: data.name,
            taught: new Set(data.courses.map((c) => c.code)),
          },
          reviewedKeys,
        )
      : null;
  const reviewed = reviewedHere(mine, { instructorId: id, course });
  const boxState: ReviewBoxState = took
    ? { kind: "took", took }
    : reviewed
      ? { kind: "reviewed", review: reviewed }
      : { kind: "ask" };

  // The form writes about the page's course, or the one you took with them.
  const targetCourse = course ?? took?.course ?? null;
  const target: ComposerTarget | null =
    targetCourse && data.name
      ? {
          instructorId: id,
          reviewedName: took?.instructor ?? data.name,
          dept: targetCourse.slice(0, 4),
          course: targetCourse,
        }
      : null;
  const existing =
    target === null
      ? null
      : (reviewedHere(mine, { instructorId: id, course: target.course }) ??
        null);
  const [composing, setComposing] = useState<Composing>(
    write && target ? "new" : null,
  );
  const boxRef = useRef<HTMLDivElement>(null);
  useBringFormIn(boxRef, composing);

  const composer =
    composing === null ? null : signedIn !== true ? (
      <SignInPrompt>
        Sign in with your UMD account to write a review. Readers won't see who
        wrote it.
      </SignInPrompt>
    ) : composing === "new" ? (
      target ? (
        <Composer
          target={target}
          existing={existing}
          termId={took?.course === target.course ? took.termId : null}
          onClose={() => setComposing(null)}
        />
      ) : null
    ) : (
      <Composer
        target={targetOf(composing)}
        existing={composing}
        onClose={() => setComposing(null)}
      />
    );

  return (
    <ReviewsFrame page="instructor" wide>
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
            // A phone's filter: under the name, over the reviews it filters.
            <div className="lg:hidden">
              <CourseSwitch id={id} courses={courseList} current={course} />
            </div>
          ) : undefined
        }
      />
      <SplitLayout
        size="display"
        main={
          <>
            <RatingSummary combined={combined} freshness={freshness} />
            <div ref={boxRef} className="scroll-mt-20">
              {composer ?? (
                <ReviewBox
                  state={boxState}
                  who={name}
                  question={
                    course ? (
                      <>
                        Took <span className="ident">{course}</span> with {name}
                        ?
                      </>
                    ) : (
                      <>Took a class with {name}?</>
                    )
                  }
                  write={
                    target ? (
                      <WriteReviewButton
                        tooltip={`Review ${target.reviewedName} in ${target.course}`}
                        onClick={() => setComposing("new")}
                      />
                    ) : courseList.length > 0 ? (
                      <CoursePickMenu id={id} courses={courseList} />
                    ) : null
                  }
                  onEdit={setComposing}
                />
              )}
            </div>
            <ReviewsSection
              instructorId={id}
              course={course}
              reviews={reviews}
              count={course ? null : combined.reviewCount}
              composing={composing}
              onEdit={setComposing}
            />
          </>
        }
        sideProps={{ "aria-label": `More about ${name}` }}
        side={
          <>
            {courseList.length > 0 ? (
              <PageSection
                title="Courses"
                aside={courseList.length}
                className="max-lg:hidden"
              >
                <CourseList
                  id={id}
                  name={name}
                  courses={courseList}
                  current={course}
                  gpaOf={(c) => {
                    const r = grades.get(c);
                    return r ? gradeSummary(r.counts).averageGpa : null;
                  }}
                />
              </PageSection>
            ) : null}
            <InstructorGrades data={data} name={name} />
          </>
        }
      />
    </ReviewsFrame>
  );
}

/** The form's subject for a review of yours. */
function targetOf(review: MyReview): ComposerTarget {
  return {
    instructorId: review.instructorId,
    reviewedName: review.reviewedName,
    dept: review.course.slice(0, 4),
    course: review.course,
  };
}

/** Their grades: in the page's course, or in every course they've taught. */
function InstructorGrades({
  data,
  name,
}: {
  data: InstructorPageData;
  name: string;
}) {
  const { course, gradesThrough } = data;
  const record = course
    ? data.courses.find((c) => c.code === course)?.grades
    : undefined;
  if (course)
    return (
      <PageSection
        title={
          <>
            Grades in <span className="ident">{course}</span>
          </>
        }
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
    );
  if (data.courses.length === 0) return null;
  // Every course of theirs, summed: the shape of how they grade.
  const all = {
    counts: addGradeCounts(data.courses.map((c) => c.grades.counts)),
    semesters: Math.max(...data.courses.map((c) => c.grades.semesters)),
    latestTermId:
      data.courses
        .map((c) => c.grades.latestTermId)
        .sort()
        .at(-1) ?? data.courses[0]?.grades.latestTermId,
  };
  return (
    <PageSection
      title="Grades"
      aside={
        data.courses.length === 1
          ? "One course"
          : `${data.courses.length} courses`
      }
    >
      {all.latestTermId ? (
        <GradesBlock
          record={all}
          gradesThrough={gradesThrough}
          courses={data.courses.length}
        />
      ) : null}
    </PageSection>
  );
}

/** The side's filter: all their courses, then each, with its GPA. */
function CourseList({
  id,
  name,
  courses,
  current,
  gpaOf,
}: {
  id: InstructorId;
  name: string;
  courses: readonly CourseCode[];
  current: CourseCode | null;
  gpaOf: (code: CourseCode) => number | null;
}) {
  const slug = instructorSlug(id);
  return (
    <ul aria-label="Courses">
      <FilterRow
        current={current === null}
        label="All courses"
        tooltip={`Reviews of ${name} in every course`}
        link={{ to: "/reviews/$slug", params: { slug }, search: {} }}
      />
      {courses.map((c) => {
        const gpa = gpaOf(c);
        return (
          <FilterRow
            key={c}
            current={current === c}
            label={<span className="ident">{c}</span>}
            trail={
              gpa !== null ? (
                <span className="text-muted">GPA {formatGpa(gpa)}</span>
              ) : undefined
            }
            tooltip={`${name}'s reviews and grades in ${c}`}
            link={{
              to: "/reviews/$slug",
              params: { slug },
              search: { course: c },
            }}
          />
        );
      })}
    </ul>
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
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 bg-product-reviews-soft px-6 py-6">
      {combined.rating === null ? (
        <p className="text-lg">No reviews yet.</p>
      ) : (
        <>
          <WithTooltip label={words}>
            <span className="tnum font-semibold text-4xl text-product-reviews-text">
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

/**
 * On the page with no course picked: which of their courses you're
 * reviewing. A pick opens the form on that course's view of the page.
 */
function CoursePickMenu({
  id,
  courses,
}: {
  id: InstructorId;
  courses: readonly CourseCode[];
}) {
  const navigate = useNavigate();
  return (
    <DropdownMenu>
      <WithTooltip label="Pick the course they taught you">
        <DropdownMenuTrigger asChild>
          <Button size="lg">
            Write a review
            <ChevronDown aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
      </WithTooltip>
      <DropdownMenuContent align="end" className="max-h-80">
        <DropdownMenuLabel>Which course?</DropdownMenuLabel>
        {courses.map((c) => (
          <DropdownMenuItem
            key={c}
            className="ident"
            onSelect={() =>
              void navigate({
                to: "/reviews/$slug",
                params: { slug: instructorSlug(id) },
                search: { course: c, write: "1" },
              })
            }
          >
            {c}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** A phone's filter: "All courses" or one of theirs, each a URL (`?course=`). */
function CourseSwitch({
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
        className={
          // Codes read as codes; the scroll keeps a long row on a phone.
          "overflow-x-auto [&>a:not(:first-child)]:ident"
        }
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
