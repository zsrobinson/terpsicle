import { Link } from "@tanstack/react-router";
import { ChevronDown, PenLine } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { PanelNote } from "~/components/panel";
import { formatGpa } from "~/core/grades/grades";
import { planetTerpFreshnessWords } from "~/core/grades/source";
import {
  type CourseInstructorRow,
  type CoursePageData,
  combineRatings,
  hasTermStarted,
  instructorSlug,
} from "~/core/reviews";
import type {
  CourseCode,
  InstructorId,
  MyReview,
  PageReviews,
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
import { WithTooltip } from "~/ui/tooltip";
import { Composer, type ComposerTarget } from "./composer";
import { PAGE_NOTE, PAGE_ROW, ReviewsFrame } from "./frame";
import { type ReviewsLevel, useReviewsLevel, useSignedIn } from "./level";
import { GradesBlock } from "./planetterp-blocks";
import { CombinedRatingBadge } from "./rating";
import {
  ReviewList,
  useMine,
  useReloadOnChange,
  WriteButton,
} from "./reviews-section";
import { SignInPrompt } from "./sign-in-prompt";

// /reviews/<course> (V2 §1.1): who teaches it now, then its reviews, ours
// and PlanetTerp's about every instructor, then everyone who's taught it
// with their numbers, and last its grades (owner, 2026-09-28: "reviews are
// more important to display than grades"). The route's loader read it all,
// so the server's HTML has it.

type Row = CourseInstructorRow;

/** The route's page: what the loader read (page-data.ts). */
export function CoursePage({
  data,
  reviews,
  write,
}: {
  data: CoursePageData;
  reviews: PageReviews;
  /** `?write=<name>`: open the form under who taught you. */
  write: string | null;
}) {
  const { code, title, term, grades } = data;
  const level = useReviewsLevel();
  const rows = data.instructors;
  const [writingFor, setWritingFor] = useState<string | null>(
    write && rows.some((r) => r.name === write) ? write : null,
  );
  const mine = useMine();
  useReloadOnChange();
  const nameOf = new Map(rows.map((r) => [r.id, r.name]));
  const freshness = planetTerpFreshnessWords(data.source);
  const today = newYorkClock(Date.now()).date;
  const teaching = rows.filter((r) => r.teaching);

  return (
    <ReviewsFrame page="course">
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
        actions={
          level === "on" && rows.length > 0 ? (
            <WriteMenu
              code={code}
              rows={rows}
              term={term && hasTermStarted(term.id, today) ? term.name : null}
              onWrite={setWritingFor}
            />
          ) : undefined
        }
      />

      {term && teaching.length > 0 ? (
        <TeachingNow term={term.name} code={code} rows={teaching} />
      ) : null}

      <PageSection size="display" title="Reviews">
        <ReviewList
          reviews={reviews}
          query={{ instructorId: null, course: code }}
          level={level}
          showCourse={false}
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

      <PageSection
        size="display"
        title="Everyone who's taught it"
        aside={rows.length > 0 ? rows.length : undefined}
      >
        {rows.length === 0 ? (
          <PanelNote className={PAGE_NOTE}>
            We don't know who's taught {code} yet.
          </PanelNote>
        ) : (
          <ul>
            {rows.map((row) => (
              <InstructorRow
                key={row.id ?? row.name}
                row={row}
                code={code}
                term={term?.name ?? null}
                level={level}
                existing={
                  mine.find(
                    (r) =>
                      r.instructorId === row.id &&
                      r.course === code &&
                      r.status !== "rejected",
                  ) ?? null
                }
                writing={writingFor === row.name}
                onWrite={() => setWritingFor(row.name)}
                onClose={() => setWritingFor(null)}
              />
            ))}
          </ul>
        )}
        {/* About the ratings beside each name, which are PlanetTerp's. */}
        {freshness ? <p className="text-faint text-sm">{freshness}</p> : null}
      </PageSection>

      <PageSection size="display" title="Grades">
        {grades ? (
          <GradesBlock record={grades} gradesThrough={data.gradesThrough} />
        ) : (
          <PanelNote className={PAGE_NOTE}>
            PlanetTerp has no grades for {code} yet.
          </PanelNote>
        )}
      </PageSection>
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
 * The page's one filled action. A review is of an instructor in a course,
 * so it asks who taught you, then opens the form for them under their row:
 * one pick and you're writing (or asked to sign in). The term beside a name
 * is only one that's begun: nobody's taken a class in a term still ahead.
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
  const signedIn = useSignedIn();
  // A pick opens the form a screen away and focuses it there; the menu
  // mustn't hand focus back to its button, which scrolled back up to it.
  const picked = useRef(false);
  if (signedIn === "loading") return null;
  return (
    <DropdownMenu>
      <WithTooltip label={`Pick who taught you ${code}`}>
        <DropdownMenuTrigger asChild>
          <Button size="lg">
            <PenLine aria-hidden="true" />
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

function InstructorRow({
  row,
  code,
  term,
  level,
  existing,
  writing,
  onWrite,
  onClose,
}: {
  row: Row;
  code: CourseCode;
  term: string | null;
  level: ReviewsLevel;
  /** Your live review of them in this course, which the form edits. */
  existing: MyReview | null;
  writing: boolean;
  onWrite: () => void;
  onClose: () => void;
}) {
  const signedIn = useSignedIn();
  const formRef = useRef<HTMLDivElement>(null);
  // The header's menu can be a screen away: bring the form to it, and
  // focus its first control (the rating, or Sign in).
  useEffect(() => {
    if (!writing) return;
    const form = formRef.current;
    form?.scrollIntoView?.({ block: "center" });
    form
      ?.querySelector<HTMLElement>("input, textarea, select, button, a[href]")
      ?.focus({ preventScroll: true });
  }, [writing]);
  const target: ComposerTarget = {
    instructorId: row.id,
    reviewedName: row.name,
    dept: code.slice(0, 4),
    course: code,
  };
  return (
    // The row, then the form it opens under it: one item of the list.
    <li>
      <ListRow
        className={PAGE_ROW}
        trail={
          <span className="flex items-center gap-4 text-base">
            <CombinedRatingBadge combined={rowRating(row)} />
            {row.gpa !== null ? (
              <span className="tnum text-muted">GPA {formatGpa(row.gpa)}</span>
            ) : null}
            {row.id === null && (!writing || signedIn !== true) ? (
              <WriteButton
                level={level}
                target={target}
                existing={null}
                onWrite={writing ? onClose : onWrite}
                label="Write the first review"
                size="row"
              />
            ) : null}
          </span>
        }
      >
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {row.id ? (
            <WithTooltip label={`${row.name}'s reviews and grades in ${code}`}>
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
          {row.teaching && term ? (
            <span className="border border-hairline-strong px-1.5 text-muted text-xs">
              Teaching {term}
            </span>
          ) : null}
        </div>
      </ListRow>
      {writing ? (
        <div ref={formRef} className="scroll-mt-16 pb-3">
          {signedIn !== true ? (
            <SignInPrompt>
              Sign in with your UMD account to write a review. Readers won't see
              who wrote it.
            </SignInPrompt>
          ) : (
            <Composer target={target} existing={existing} onClose={onClose} />
          )}
        </div>
      ) : null}
    </li>
  );
}
