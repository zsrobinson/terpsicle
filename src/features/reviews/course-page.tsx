import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";
import { useRef, useState } from "react";
import { ViewWords } from "~/components/brand/view-words";
import { PanelNote } from "~/components/panel";
import { termLabel } from "~/core/catalog/terms";
import { formatGpa } from "~/core/grades/grades";
import {
  type CourseInstructorRow,
  type CoursePageData,
  type CourseTermGroup,
  combineRatings,
  courseTermGroups,
  hasTermStarted,
  historyInstructorSlug,
  instructorSlug,
  reviewedHere,
  reviewedKey,
  tookHere,
} from "~/core/reviews";
import {
  type CourseCode,
  type InstructorId,
  instructorNameKey,
  type MyReview,
  type PageReviews,
  type ReviewSort,
} from "~/core/schema";
import { newYorkClock } from "~/core/todo/list";
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
import { FilterRow } from "./filter-list";
import { PAGE_NOTE, ReviewsFrame } from "./frame";
import { RatingSummary } from "./instructor-page";
import { useReviewsLevel, useSignedIn } from "./level";
import { GradesBlock } from "./planetterp-blocks";
import { CombinedRatingBadge } from "./rating";
import {
  ReviewBox,
  type ReviewBoxState,
  useBringFormIn,
  useClassesTaken,
  WriteReviewButton,
} from "./review-box";
import {
  FILTER_ROW,
  ReviewFilter,
  ReviewList,
  ReviewsTitle,
  SortControl,
  useMine,
  useReloadOnChange,
} from "./reviews-section";
import { SignInPrompt } from "./sign-in-prompt";

// /reviews/<course> (V2 §1.1), in two columns from the top (owner,
// 2026-09-29). The wide one: the course, the box to review it yourself,
// then the reviews, ours and PlanetTerp's about every instructor, never
// filtered to one (as on PlanetTerp), in the order `?sort=` asks; the
// instructor filter left of the sort opens one instructor's page for this
// course (owner, 2026-09-30). The narrow one: its rating from every review
// of it, then its grades and who taught it term by term, each column
// flowing on its own (owner, 2026-10-04). On a phone: the course, who
// teaches it now, the box, the rating, the reviews, then the grades and
// who taught it. No back link (owner). The route's loader read it all, so
// the server's HTML has it.

type Row = CourseInstructorRow;

/** What the form is open on: a new review of someone, one of yours, or nothing. */
type Writing = { name: string } | MyReview | null;

/** The route's page: what the loader read (page-data.ts). */
export function CoursePage({
  data,
  reviews,
  write,
  sort = "latest",
}: {
  data: CoursePageData;
  reviews: PageReviews;
  /** `?write=<name>`: open the form for who taught you. */
  write: string | null;
  /** `?sort=`: the reviews' order. */
  sort?: ReviewSort;
}) {
  const { code, title, term, grades } = data;
  const level = useReviewsLevel();
  const signedIn = useSignedIn();
  const rows = data.instructors;
  const mine = useMine();
  const taken = useClassesTaken();
  useReloadOnChange();
  const [writing, setWriting] = useState<Writing>(
    write && rows.some((r) => r.name === write) ? { name: write } : null,
  );
  const boxRef = useRef<HTMLDivElement>(null);
  useBringFormIn(boxRef, writing);
  const nameOf = new Map(rows.map((r) => [r.id, r.name]));
  const today = newYorkClock(Date.now()).date;
  const teaching = rows.filter((r) => r.teaching);
  // The instructor filter: everyone with a page of their own, by name.
  // Everyone has one: PlanetTerp's, or ours from the history.
  const withPages = rows
    .map((r) => ({
      slug: rowLink(r, code).params.slug,
      name: r.name,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const navigate = useNavigate();

  // Every review of the course: PlanetTerp's of it, and ours.
  const combined = combineRatings([
    {
      source: "planetterp",
      rating: reviews.planetTerpCourse?.rating ?? null,
      reviewCount: reviews.planetTerpCourse?.reviewCount ?? 0,
    },
    {
      source: "terpsicle",
      rating: data.terpsicle?.rating ?? null,
      reviewCount: data.terpsicle?.reviewCount ?? 0,
    },
  ]);

  const reviewedKeys = new Set(
    mine
      .filter((r) => r.status !== "rejected")
      .map((r) => reviewedKey(r.course, r.reviewedName)),
  );
  const took = taken
    ? tookHere(taken, { course: code, instructorName: null }, reviewedKeys)
    : null;
  const reviewed = reviewedHere(mine, { instructorId: null, course: code });
  const boxState: ReviewBoxState = took
    ? { kind: "took", took }
    : reviewed
      ? { kind: "reviewed", review: reviewed }
      : { kind: "ask" };

  const targetFor = (name: string): ComposerTarget => ({
    instructorId:
      rows.find((r) => instructorNameKey(r.name) === instructorNameKey(name))
        ?.id ?? null,
    reviewedName: name,
    dept: code.slice(0, 4),
    course: code,
  });
  const existingFor = (name: string) =>
    mine.find(
      (r) =>
        r.course === code &&
        r.status !== "rejected" &&
        instructorNameKey(r.reviewedName) === instructorNameKey(name),
    ) ?? null;

  const composer =
    writing === null ? null : signedIn !== true ? (
      <SignInPrompt>
        Sign in with your UMD account to write a review. Readers won't see who
        wrote it.
      </SignInPrompt>
    ) : "id" in writing ? (
      <Composer
        target={{
          instructorId: writing.instructorId,
          reviewedName: writing.reviewedName,
          dept: code.slice(0, 4),
          course: code,
        }}
        existing={writing}
        onClose={() => setWriting(null)}
      />
    ) : (
      <Composer
        target={targetFor(writing.name)}
        existing={existingFor(writing.name)}
        termId={took?.instructor === writing.name ? took.termId : null}
        onClose={() => setWriting(null)}
      />
    );

  const box = (
    <div ref={boxRef} className="scroll-mt-20">
      {composer ?? (
        <ReviewBox
          state={boxState}
          question={
            <>
              Took <span className="ident">{code}</span>?
            </>
          }
          write={
            rows.length === 0 ? null : took?.instructor ? (
              <WriteReviewButton
                tooltip={`Review ${took.instructor} in ${code}`}
                onClick={() => setWriting({ name: took.instructor ?? "" })}
              />
            ) : (
              <WriteMenu
                code={code}
                rows={rows}
                term={term && hasTermStarted(term.id, today) ? term.name : null}
                onWrite={(name) => setWriting({ name })}
              />
            )
          }
          onEdit={setWriting}
          ready={taken !== null}
        />
      )}
    </div>
  );
  // Its grades, then who taught it: the narrow column's second part.
  const more = (
    <>
      <PageSection size="side" title="Grades">
        {grades ? (
          <GradesBlock record={grades} gradesThrough={data.gradesThrough} />
        ) : (
          <PanelNote className={PAGE_NOTE}>
            PlanetTerp has no grades for {code} yet.
          </PanelNote>
        )}
      </PageSection>
      <PageSection
        size="side"
        title="Who taught it"
        aside={rows.length > 0 ? rows.length : undefined}
      >
        {rows.length === 0 ? (
          <PanelNote className={PAGE_NOTE}>
            We don't know who's taught {code} yet.
          </PanelNote>
        ) : (
          <div className="flex flex-col gap-6">
            {courseTermGroups(data).map((group) => (
              <TermGroup
                key={group.termId ?? "earlier"}
                group={group}
                code={code}
                now={group.termId !== null && group.termId === term?.id}
              />
            ))}
          </div>
        )}
        {rows.some((r) => r.overallGpa !== null) ? (
          <p className="text-faint text-sm">
            Each GPA is the average across all their courses.
          </p>
        ) : null}
      </PageSection>
    </>
  );

  return (
    <ReviewsFrame page="course" wide>
      <SplitLayout
        size="display"
        top={
          <>
            <PageHeader
              size="display"
              eyebrow="Course"
              title={
                // One box the row you opened it from grows into
                // (~/lib/view-transition); a wrapped inline one can't be.
                <span className="block" data-vt-course={code}>
                  <span className="ident">{code}</span>
                  {title ? ` ${title}` : null}
                </span>
              }
              status={
                term ? (
                  <>
                    Offered in {term.name} ·{" "}
                    <WithTooltip label={`${code}'s sections in ${term.name}`}>
                      <Link
                        to="/schedule/course/$code"
                        params={{ code }}
                        onClick={() => crossLinkClicked("reviews", "schedule")}
                        className="inline-flex items-center gap-1 text-fg underline decoration-hairline-strong underline-offset-2 hover:decoration-fg"
                      >
                        <ViewWords to="schedule" size={16} />
                      </Link>
                    </WithTooltip>
                  </>
                ) : (
                  "Not offered this term"
                )
              }
              views={
                term && teaching.length > 0 ? (
                  // A phone's way to who teaches it: the full list comes after the reviews there.
                  <div className="lg:hidden">
                    <TeachingNow term={term.name} code={code} rows={teaching} />
                  </div>
                ) : undefined
              }
            />
            {box}
          </>
        }
        sideProps={{ "aria-label": `More about ${code}`, className: "lg:pt-8" }}
        side={<RatingSummary combined={combined} />}
        // Under the rating on a wide screen; after the reviews on a phone.
        after={more}
        main={
          <PageSection
            size="display"
            title={<ReviewsTitle count={combined.reviewCount} />}
            aside={
              <div className={FILTER_ROW}>
                {withPages.length > 0 ? (
                  <ReviewFilter
                    label="Instructor"
                    tooltip={`One instructor's reviews and grades in ${code}`}
                    all="All instructors"
                    value={null}
                    options={withPages.map((r) => ({
                      value: r.slug,
                      label: r.name,
                    }))}
                    onPick={(slug) => {
                      // One instructor in this course is their page's view
                      // of it, with this page's order (owner, 2026-09-30).
                      if (slug === null) return;
                      void navigate({
                        to: "/reviews/$slug",
                        params: { slug },
                        search: {
                          course: code,
                          ...(sort !== "latest" ? { sort } : {}),
                        },
                      });
                    }}
                  />
                ) : null}
                <SortControl sort={sort} />
              </div>
            }
          >
            <ReviewList
              reviews={reviews}
              query={{ instructorId: null, course: code }}
              sort={sort}
              level={level}
              showCourse={false}
              hideId={
                writing !== null && "id" in writing ? writing.id : undefined
              }
              onEdit={setWriting}
              about={(id) => (
                <AboutInstructor
                  id={id}
                  code={code}
                  name={nameOf.get(id) ?? null}
                />
              )}
              empty={`No reviews of ${code} yet.`}
            />
          </PageSection>
        }
      />
    </ReviewsFrame>
  );
}

/** "About Clyde Kruskal", linking to their page for this course. */
function AboutInstructor({
  id,
  code,
  name,
}: {
  id: InstructorId;
  code: CourseCode;
  name: string | null;
}) {
  return (
    <>
      About{" "}
      <WithTooltip label={`All reviews of ${name ?? "them"} in ${code}`}>
        <Link
          to="/reviews/$slug"
          params={{ slug: instructorSlug(id) }}
          search={{ course: code }}
          className="font-medium text-fg hover:underline"
        >
          {name ?? "this instructor"}
        </Link>
      </WithTooltip>
    </>
  );
}

/** Who teaches it this term, each a link with their rating: who you can pick. */
function TeachingNow({
  term,
  code,
  rows,
}: {
  term: string;
  code: CourseCode;
  rows: readonly Row[];
}) {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="emph-heading text-base">Teaching in {term}</h2>
      <ul className="flex flex-wrap gap-2">
        {rows.map((row) => (
          <li
            key={row.id ?? row.name}
            className="flex items-center gap-2 border border-hairline-strong px-3 py-2"
          >
            <WithTooltip
              label={
                row.id
                  ? `${row.name}'s reviews and grades in ${code}`
                  : `What ${row.name} has taught`
              }
            >
              <Link
                {...rowLink(row, code)}
                className="font-medium text-lg hover:underline"
              >
                {row.name}
              </Link>
            </WithTooltip>
            <CombinedRatingBadge combined={rowRating(row)} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** PlanetTerp's numbers and ours, for one instructor, every course. */
function rowRating(row: Row) {
  return combineRatings([
    {
      source: "planetterp",
      rating: row.planetTerp?.rating ?? null,
      reviewCount: row.planetTerp?.reviewCount ?? 0,
    },
    {
      source: "terpsicle",
      rating: row.terpsicle?.rating ?? null,
      reviewCount: row.terpsicle?.reviewCount ?? 0,
    },
  ]);
}

/**
 * The box's action when we don't know who taught you: a review is of an
 * instructor in a course, so it asks who, then opens the form. The term
 * beside a name is only one that's begun: nobody's taken a class in a term
 * still ahead.
 */
function WriteMenu({
  code,
  rows,
  term,
  onWrite,
}: {
  code: CourseCode;
  rows: readonly Row[];
  /** This term's name while it's under way; null before it starts. */
  term: string | null;
  onWrite: (name: string) => void;
}) {
  // A pick opens the form in the menu's place and focuses it there; the
  // menu mustn't hand focus back to its button, which is gone.
  const picked = useRef(false);
  return (
    <DropdownMenu>
      <WithTooltip label={`Pick who taught you ${code}`}>
        <DropdownMenuTrigger asChild>
          <Button size="lg">
            Write a review
            <ChevronDown aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
      </WithTooltip>
      <DropdownMenuContent
        align="end"
        className="max-h-80"
        onCloseAutoFocus={(event) => {
          if (picked.current) event.preventDefault();
          picked.current = false;
        }}
      >
        <DropdownMenuLabel>Who taught you?</DropdownMenuLabel>
        {rows.map((row) => (
          <DropdownMenuItem
            key={row.id ?? row.name}
            onSelect={() => {
              picked.current = true;
              onWrite(row.name);
            }}
          >
            {row.name}
            {row.teaching && term ? (
              <span className="ml-auto pl-3 text-muted text-sm">{term}</span>
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * One term of "Who taught it" (owner, 2026-09-29: like PlanetTerp's course
 * pages, which "group by term and show what professors taught it, their
 * average GPAs (across all their courses)"). Each instructor is under the
 * newest term they taught it.
 */
function TermGroup({
  group,
  code,
  now,
}: {
  group: CourseTermGroup;
  code: CourseCode;
  /** The term the scheduler's on. */
  now: boolean;
}) {
  const label = group.termId ? termLabel(group.termId) : "Earlier";
  return (
    <div className="flex flex-col gap-1">
      {/* The term over its names, a rule filling the rest of its line, so
          one term reads apart from the next (owner, 2026-09-29). */}
      <h3 className="emph-heading flex items-center gap-3 text-lg">
        <span className="shrink-0">{label}</span>
        {now ? (
          <span className="shrink-0 font-normal text-muted text-sm">
            Teaching now
          </span>
        ) : null}
        <span aria-hidden="true" className="h-px flex-1 bg-hairline" />
      </h3>
      <ul aria-label={`Taught ${code} in ${label}`}>
        {group.rows.map((row) => (
          <InstructorRow key={row.id ?? row.name} row={row} code={code} />
        ))}
      </ul>
    </div>
  );
}

/** One of everyone who's taught it: their page in this course, and numbers. */
function InstructorRow({ row, code }: { row: Row; code: CourseCode }) {
  const trail = <CombinedRatingBadge combined={rowRating(row)} />;
  const secondary =
    row.overallGpa !== null
      ? `Average GPA ${formatGpa(row.overallGpa)}`
      : undefined;
  return (
    <FilterRow
      label={<span className="font-medium">{row.name}</span>}
      secondary={secondary}
      trail={trail}
      tooltip={
        row.id
          ? `${row.name}'s reviews and grades in ${code}`
          : `What ${row.name} has taught`
      }
      link={rowLink(row, code)}
    />
  );
}

/**
 * Where an instructor's name goes: their page in this course, or, when
 * PlanetTerp doesn't know them, our own page of what they taught, found
 * through this course (owner, 2026-09-30: every row is clickable).
 */
function rowLink(row: Row, code: CourseCode) {
  return {
    to: "/reviews/$slug",
    params: {
      slug: row.id ? instructorSlug(row.id) : historyInstructorSlug(row.name),
    },
    search: { course: code },
  } as const;
}
