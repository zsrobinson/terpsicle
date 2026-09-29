import { Link, useNavigate } from "@tanstack/react-router";
import { cn } from "cn";
import { ArrowUpRight, ChevronDown } from "lucide-react";
import { useRef, useState } from "react";
import { ViewWords } from "~/components/brand/view-words";
import { PanelNote } from "~/components/panel";
import { addGradeCounts, formatGpa, gradeSummary } from "~/core/grades/grades";
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
  ReviewSort,
} from "~/core/schema";
import { crossLinkClicked } from "~/lib/cross-link";
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
import { SplitLayout } from "~/ui/split-layout";
import { WithTooltip } from "~/ui/tooltip";
import { Composer, type ComposerTarget } from "./composer";
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

// /reviews/<instructor> (V2 §1.1), in two columns from the top (owner,
// 2026-09-29: "having the 2/3 1/3 thing extend all the way to the top").
// The wide one: who they are, their rating, then the reviews, ours and
// PlanetTerp's, in the order `?sort=` asks. The narrow one: the box to
// review them yourself, their courses as chips (each a view of the page,
// `?course=`, with an arrow to the course's own page), then their grades.
// On a phone it's the name and rating, the narrow column, the reviews, then
// the grades. No back link: where it went changed in ways you wouldn't
// expect (owner). The route's loader read it all, so the server's HTML has it.

/** Courses the status line names. */
const STATUS_COURSES = 3;

/** The route's page: what the loader read. */
export function InstructorPage({
  data,
  reviews,
  write,
  sort = "latest",
}: {
  data: InstructorPageData;
  reviews: PageReviews;
  /** `?write`: open the form (from "Review your classes"). */
  write: boolean;
  /** `?sort=`: the reviews' order. */
  sort?: ReviewSort;
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

  const box = (
    <div ref={boxRef} className="scroll-mt-20">
      {composer ?? (
        <ReviewBox
          state={boxState}
          who={name}
          question={
            course ? (
              <>
                Took <span className="ident">{course}</span> with {name}?
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
  );

  return (
    <ReviewsFrame page="instructor" wide>
      <SplitLayout
        size="display"
        top={
          <>
            <PageHeader
              size="display"
              eyebrow={data.ta ? "Teaching assistant" : "Instructor"}
              title={name}
              status={
                taught.length > 0 ? (
                  <span>
                    Taught{" "}
                    {taught.map((c, i) => (
                      <span key={c}>
                        {i > 0
                          ? i === taught.length - 1
                            ? " and "
                            : ", "
                          : ""}
                        <span className="ident">{c}</span>
                      </span>
                    ))}
                    {data.courses.length > STATUS_COURSES ? " and more" : ""}
                  </span>
                ) : undefined
              }
            />
            <RatingSummary combined={combined} />
          </>
        }
        sideProps={{
          "aria-label": `More about ${name}`,
          className: SIDE_START,
        }}
        side={
          <>
            {box}
            {courseList.length > 0 ? (
              <PageSection
                size="side"
                title="Courses"
                aside={courseList.length}
              >
                <CourseChips
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
          </>
        }
        // Beside the reviews on a wide screen; after them on a phone.
        after={<InstructorGrades data={data} name={name} />}
        main={
          <ReviewsSection
            instructorId={id}
            course={course}
            reviews={reviews}
            count={course ? null : combined.reviewCount}
            sort={sort}
            composing={composing}
            onEdit={setComposing}
          />
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
        size="side"
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
              className="inline-flex items-center gap-1 text-muted underline decoration-hairline-strong underline-offset-2 hover:text-fg hover:decoration-fg"
            >
              <ViewWords to="schedule" size={13} />
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
      size="side"
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

/**
 * The side's filter (owner, 2026-09-29: "selectable chips rather than a
 * long list, since some professors have a lot"): all their courses, then
 * each, a view of this page, fused with an arrow to the course's own page.
 */
function CourseChips({
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
    <ul aria-label="Courses" className="flex flex-wrap gap-2">
      <li>
        <WithTooltip label={`Reviews of ${name} in every course`}>
          <Link
            to="/reviews/$slug"
            params={{ slug }}
            search={{}}
            aria-current={current === null ? "page" : undefined}
            className={cn(CHIP, "rounded-md", chipState(current === null))}
          >
            All courses
          </Link>
        </WithTooltip>
      </li>
      {courses.map((c) => {
        const gpa = gpaOf(c);
        const on = current === c;
        return (
          <li key={c} className="flex">
            <WithTooltip
              label={`${name}'s reviews and grades in ${c}${gpa !== null ? ` (GPA ${formatGpa(gpa)})` : ""}`}
            >
              <Link
                to="/reviews/$slug"
                params={{ slug }}
                search={{ course: c }}
                aria-current={on ? "page" : undefined}
                className={cn(CHIP, "ident rounded-l-md", chipState(on))}
              >
                {c}
              </Link>
            </WithTooltip>
            <WithTooltip label={`${c}'s page: every instructor's reviews`}>
              <Link
                to="/reviews/$slug"
                params={{ slug: courseSlug(c) }}
                aria-label={`${c}'s page`}
                className={cn(
                  CHIP,
                  "-ml-px rounded-r-md px-2 max-md:px-3",
                  chipState(on),
                )}
              >
                <ArrowUpRight size={14} aria-hidden="true" />
              </Link>
            </WithTooltip>
          </li>
        );
      })}
    </ul>
  );
}

/** A course chip's box: a 36px target (44 on phones), the code at a reading size. */
const CHIP =
  "inline-flex h-9 items-center border px-3 text-base transition-colors max-md:h-11";

/** The chip you're on fills in, as the kit's chips do. */
const chipState = (on: boolean) =>
  on
    ? "border-fg bg-fg text-bg hover:bg-fg/85"
    : "border-hairline-strong text-fg hover:bg-hover";

/** The narrow column starts level with the name, past the header's top space. */
const SIDE_START = "lg:pt-8";

/**
 * The big number, its stars filled to it, and how many reviews it's from,
 * on the product's soft purple: the one thing on the page that should
 * stand out. Where the reviews come from is on each review, and the math
 * is in the tooltip (owner, 2026-09-29: no notice or source here).
 */
export function RatingSummary({ combined }: { combined: CombinedRating }) {
  const words = combinedRatingWords(combined);
  const count = combined.reviewCount;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 bg-product-reviews-soft px-6 py-6">
      {combined.rating === null ? (
        <p className="text-lg">No reviews yet.</p>
      ) : (
        <>
          <WithTooltip label={words}>
            <span className="tnum font-semibold text-5xl text-product-reviews-text">
              {formatStars(combined.rating)}
            </span>
          </WithTooltip>
          <div className="flex min-w-0 flex-col gap-1">
            <Stars rating={combined.rating} size={22} />
            <span
              className="tnum text-base text-muted"
              data-testid="rating-math"
            >
              from {count.toLocaleString("en-US")} review
              {count === 1 ? "" : "s"}
            </span>
          </div>
        </>
      )}
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
