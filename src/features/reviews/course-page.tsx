import { Link } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";
import { useRef, useState } from "react";
import { PanelNote } from "~/components/panel";
import { termLabel } from "~/core/catalog/terms";
import { formatGpa } from "~/core/grades/grades";
import { planetTerpFreshnessWords } from "~/core/grades/source";
import {
  type CourseInstructorRow,
  type CoursePageData,
  type CourseTermGroup,
  combineRatings,
  courseTermGroups,
  hasTermStarted,
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
} from "~/core/schema";
import { newYorkClock } from "~/core/todo/list";
import { crossLinkClicked, viewWords } from "~/lib/cross-link";
import { Button } from "~/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "~/ui/dropdown-menu";
import { ListRow } from "~/ui/list-row";
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
import { ReviewList, useMine, useReloadOnChange } from "./reviews-section";
import { SignInPrompt } from "./sign-in-prompt";

// /reviews/<course> (V2 §1.1), in two columns (owner, 2026-09-29). The wide
// one reads top to bottom: the course, its rating from every review of it,
// the box to review it yourself, then the reviews, ours and PlanetTerp's
// about every instructor, never filtered to one (owner, 2026-09-29: as on
// PlanetTerp). The narrow one holds who taught it, by term, each a link to
// their reviews in this course, and its grades. On a phone
// it's one column, the wide one first, with who teaches it now under the
// title. The route's loader read it all, so the server's HTML has it.

type Row = CourseInstructorRow;

/** What the form is open on: a new review of someone, one of yours, or nothing. */
type Writing = { name: string } | MyReview | null;

/** The route's page: what the loader read (page-data.ts). */
export function CoursePage({
  data,
  reviews,
  write,
}: {
  data: CoursePageData;
  reviews: PageReviews;
  /** `?write=<name>`: open the form for who taught you. */
  write: string | null;
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
  const freshness = planetTerpFreshnessWords(data.source);
  const today = newYorkClock(Date.now()).date;
  const teaching = rows.filter((r) => r.teaching);

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

  return (
    <ReviewsFrame page="course" wide>
      <PageHeader
        size="display"
        back={{ label: "Reviews", to: "/reviews" }}
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
                  className="text-fg underline decoration-hairline-strong underline-offset-2 hover:decoration-fg"
                >
                  {viewWords("schedule")}
                </Link>
              </WithTooltip>
            </>
          ) : (
            "Not offered this term"
          )
        }
        views={
          term && teaching.length > 0 ? (
            // A phone's way to who teaches it: the side's list comes last there.
            <div className="lg:hidden">
              <TeachingNow term={term.name} code={code} rows={teaching} />
            </div>
          ) : undefined
        }
      />
      <SplitLayout
        size="display"
        main={
          <>
            <RatingSummary combined={combined} freshness={null} />
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
                        onClick={() =>
                          setWriting({ name: took.instructor ?? "" })
                        }
                      />
                    ) : (
                      <WriteMenu
                        code={code}
                        rows={rows}
                        term={
                          term && hasTermStarted(term.id, today)
                            ? term.name
                            : null
                        }
                        onWrite={(name) => setWriting({ name })}
                      />
                    )
                  }
                  onEdit={setWriting}
                />
              )}
            </div>
            <PageSection size="display" title="Reviews">
              <ReviewList
                reviews={reviews}
                query={{ instructorId: null, course: code }}
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
          </>
        }
        sideProps={{ "aria-label": `More about ${code}` }}
        side={
          <>
            <PageSection
              title="Who taught it"
              aside={rows.length > 0 ? rows.length : undefined}
            >
              {rows.length === 0 ? (
                <PanelNote className={PAGE_NOTE}>
                  We don't know who's taught {code} yet.
                </PanelNote>
              ) : (
                <div className="flex flex-col gap-4">
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
              {/* About the numbers beside each name, which are PlanetTerp's. */}
              {rows.some((r) => r.overallGpa !== null) || freshness ? (
                <p className="text-faint text-sm">
                  {rows.some((r) => r.overallGpa !== null)
                    ? "Each GPA is the average across all their courses. "
                    : ""}
                  {freshness}
                </p>
              ) : null}
            </PageSection>
            <PageSection title="Grades">
              {grades ? (
                <GradesBlock
                  record={grades}
                  gradesThrough={data.gradesThrough}
                />
              ) : (
                <PanelNote className={PAGE_NOTE}>
                  PlanetTerp has no grades for {code} yet.
                </PanelNote>
              )}
            </PageSection>
          </>
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
            {row.id ? (
              <WithTooltip
                label={`${row.name}'s reviews and grades in ${code}`}
              >
                <Link
                  to="/reviews/$slug"
                  params={{ slug: instructorSlug(row.id) }}
                  search={{ course: code }}
                  className="font-medium text-lg hover:underline"
                >
                  {row.name}
                </Link>
              </WithTooltip>
            ) : (
              <span className="font-medium text-lg">{row.name}</span>
            )}
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
      <h3 className="emph-label flex items-baseline gap-2 text-sm">
        {label}
        {now ? <span className="text-muted">Teaching now</span> : null}
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
  if (row.id)
    return (
      <FilterRow
        label={<span className="font-medium">{row.name}</span>}
        secondary={secondary}
        trail={trail}
        tooltip={`${row.name}'s reviews and grades in ${code}`}
        link={{
          to: "/reviews/$slug",
          params: { slug: instructorSlug(row.id) },
          search: { course: code },
        }}
      />
    );
  // PlanetTerp doesn't know them yet: no page of theirs to go to.
  return (
    <ListRow
      as="li"
      className="-mx-2 border-b-0 px-2"
      secondary={secondary}
      trail={trail}
    >
      <span className="block truncate font-medium text-base">{row.name}</span>
    </ListRow>
  );
}
