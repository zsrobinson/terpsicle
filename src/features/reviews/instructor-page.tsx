import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";
import { useId, useRef, useState } from "react";
import { ViewWords } from "~/components/brand/view-words";
import { PanelNote } from "~/components/panel";
import { addGradeCounts } from "~/core/grades/grades";
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
import {
  type Composing,
  ReviewFilter,
  ReviewsSection,
  useMine,
} from "./reviews-section";
import { SignInPrompt } from "./sign-in-prompt";

// /reviews/<instructor> (V2 §1.1), in two columns from the top (owner,
// 2026-09-29: "having the 2/3 1/3 thing extend all the way to the top").
// The wide one: who they are, the box to review them yourself, then the
// reviews, ours and PlanetTerp's, in the order `?sort=` asks, with the
// course filter (`?course=`) left of the sort. The narrow one: their
// rating, then their grades, level with the reviews so the filter plainly
// covers both (owner, 2026-09-30). On a phone: the name, the box, the
// rating, the reviews, then the grades. No back link: where it went changed in ways you wouldn't
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
  const navigate = useNavigate();
  const [filterOpen, setFilterOpen] = useState(false);
  const filterId = useId();

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
          ready={taken !== null}
        />
      )}
    </div>
  );

  const filter = (
    <ReviewFilter
      label="Course"
      tooltip="Show one course's reviews and grades"
      all="All courses"
      value={course}
      options={courseList.map((c) => ({ value: c, label: c, ident: true }))}
      onPick={(picked) =>
        void navigate({
          to: "/reviews/$slug",
          params: { slug: instructorSlug(id) },
          search: {
            ...(picked ? { course: picked } : {}),
            ...(sort !== "latest" ? { sort } : {}),
          },
          resetScroll: false,
        })
      }
      open={filterOpen}
      onOpenChange={setFilterOpen}
      triggerId={filterId}
    />
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
                  <TaughtLine
                    courses={taught}
                    more={data.courses.length > STATUS_COURSES}
                    onMore={() => {
                      document
                        .getElementById(filterId)
                        ?.scrollIntoView?.({ block: "center" });
                      setFilterOpen(true);
                    }}
                  />
                ) : undefined
              }
            />
            {box}
          </>
        }
        sideProps={{
          "aria-label": `More about ${name}`,
          className: SIDE_START,
        }}
        side={<RatingSummary combined={combined} />}
        // Level with the reviews on a wide screen, so the course filter
        // plainly covers both; after them on a phone.
        after={<InstructorGrades data={data} name={name} />}
        main={
          <ReviewsSection
            instructorId={id}
            course={course}
            reviews={reviews}
            count={
              course
                ? (reviews.planetTerpCount ?? 0) +
                  (reviews.terpsicle?.length ?? 0)
                : combined.reviewCount
            }
            sort={sort}
            filter={courseList.length > 0 ? filter : undefined}
            composing={composing}
            onEdit={setComposing}
          />
        }
      />
    </ReviewsFrame>
  );
}

/**
 * "Taught CMSC320, CMSC351 and CMSC250 and more": each code opens its
 * course's page; "and more" opens the course filter, which lists them all
 * (owner, 2026-09-30).
 */
function TaughtLine({
  courses,
  more,
  onMore,
}: {
  courses: readonly CourseCode[];
  more: boolean;
  onMore: () => void;
}) {
  const link =
    "ident text-fg underline decoration-hairline-strong underline-offset-2 hover:decoration-fg";
  return (
    <span>
      Taught{" "}
      {courses.map((c, i) => (
        <span key={c}>
          {i > 0 ? (i === courses.length - 1 && !more ? " and " : ", ") : ""}
          <WithTooltip label={`${c}'s page: every instructor's reviews`}>
            <Link
              to="/reviews/$slug"
              params={{ slug: courseSlug(c) }}
              className={link}
            >
              {c}
            </Link>
          </WithTooltip>
        </span>
      ))}
      {more ? (
        <>
          {" "}
          and{" "}
          <WithTooltip label="Every course of theirs, in the course filter">
            <button
              type="button"
              onClick={onMore}
              className="text-fg underline decoration-hairline-strong underline-offset-2 hover:decoration-fg"
            >
              more
            </button>
          </WithTooltip>
        </>
      ) : null}
    </span>
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
