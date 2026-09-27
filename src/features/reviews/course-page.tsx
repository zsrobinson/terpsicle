import { Link } from "@tanstack/react-router";
import { ChevronDown, PenLine } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { crossLinkClicked, viewWords } from "~/app/cross-link";
import { PanelNote } from "~/app/panel";
import { formatGpa } from "~/core/grades/grades";
import { planetTerpFreshnessWords } from "~/core/grades/source";
import {
  type CourseInstructorRow,
  type CoursePageData,
  combineRatings,
  hasTermStarted,
  terpsicleRating,
} from "~/core/reviews";
import type {
  CourseCode,
  InstructorId,
  MyReview,
  PublicReview,
} from "~/core/schema";
import { newYorkClock } from "~/core/todo/list";
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
import { RowSkeleton } from "~/ui/skeleton";
import { WithTooltip } from "~/ui/tooltip";
import { Composer, type ComposerTarget } from "./composer";
import { PAGE_NOTE, PAGE_ROW, ReviewsFrame } from "./frame";
import { type ReviewsLevel, useReviewsLevel, useSignedIn } from "./level";
import { GradesBlock } from "./planetterp-blocks";
import { CombinedRatingBadge } from "./rating";
import { ReviewCard } from "./review-card";
import { useMine, useVisible, WriteButton } from "./reviews-section";
import { type ListState, useReviews } from "./reviews-store";
import { SignInPrompt } from "./sign-in-prompt";

// /reviews/courses/$code (V2 §1.1): the course's grades, everyone who's
// taught it with their numbers, and the newest reviews of it. Who teaches it
// this term comes first: they're who you can pick.

/**
 * Instructors whose reviews this page reads (reviews/list, one request
 * each): this term's, most-reviewed first. The rest show PlanetTerp's
 * numbers until our published numbers land in R2 (v2/reviews-publish).
 */
export const COURSE_LISTS_MAX = 12;
/** Reviews of the course shown under the instructors. */
const NEWEST = 10;

type Row = CourseInstructorRow;

/** The route's page: what the loader read (page-data.ts). */
export function CoursePage({ data }: { data: CoursePageData }) {
  const { code, title, term, grades } = data;
  const level = useReviewsLevel();
  const [writingFor, setWritingFor] = useState<string | null>(null);
  const rows = data.instructors;

  const readIds = useMemo(
    () =>
      rows
        .filter((r) => r.teaching && r.id !== null)
        .slice(0, COURSE_LISTS_MAX)
        .flatMap((r) => (r.id ? [r.id] : [])),
    [rows],
  );
  const lists = useCourseLists(readIds, level);
  const newest = useVisible(
    useMemo(
      () =>
        readIds
          .flatMap((id) => {
            const list = lists[id];
            return list?.status === "ready"
              ? list.reviews
                  .filter((r) => r.course === code)
                  .map((r) => ({ ...r, instructorId: id }))
              : [];
          })
          .sort((a, b) => b.createdMonth.localeCompare(a.createdMonth)),
      [readIds, lists, code],
    ),
  ) as (PublicReview & { instructorId: InstructorId })[];
  const mine = useMine();
  const ownById = new Map(mine.map((r) => [r.id, r]));
  const nameOf = new Map(rows.map((r) => [r.id, r.name]));
  const freshness = planetTerpFreshnessWords(data.source);
  const today = newYorkClock(Date.now()).date;

  return (
    <ReviewsFrame page="course">
      <PageHeader
        back={{ label: "Reviews", to: "/reviews" }}
        title={
          <>
            <span className="ident">{code}</span>
            {title ? ` · ${title}` : null}
          </>
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

      <PageSection title="Grades">
        {grades ? (
          <GradesBlock record={grades} gradesThrough={data.gradesThrough} />
        ) : (
          <PanelNote className={PAGE_NOTE}>
            PlanetTerp has no grades for {code} yet.
          </PanelNote>
        )}
      </PageSection>

      <PageSection
        title="Instructors"
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
                list={row.id ? lists[row.id] : undefined}
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
        {freshness ? <p className="text-faint text-xs">{freshness}</p> : null}
      </PageSection>

      {level === "read" || level === "on" ? (
        <PageSection title={`Newest reviews of ${code}`}>
          {readIds.some(
            (id) =>
              lists[id]?.status !== "ready" && lists[id]?.status !== "error",
          ) ? (
            <RowSkeleton
              rows={2}
              inset={false}
              label={`Loading reviews of ${code}`}
            />
          ) : newest.length === 0 ? (
            <PanelNote className={PAGE_NOTE}>
              No reviews of {code} on Terpsicle yet.
            </PanelNote>
          ) : (
            <ul>
              {newest.slice(0, NEWEST).map((r) => (
                <ReviewCard
                  key={r.id}
                  review={r}
                  own={ownById.get(r.id) ?? null}
                  level={level}
                  showCourse={false}
                  about={
                    <>
                      About{" "}
                      <WithTooltip
                        label={`All reviews of ${nameOf.get(r.instructorId) ?? "them"} in ${code}`}
                      >
                        <Link
                          to="/reviews/instructors/$id"
                          params={{ id: r.instructorId }}
                          search={{ course: code }}
                          className="font-medium text-fg hover:underline"
                        >
                          {nameOf.get(r.instructorId) ?? "this instructor"}
                        </Link>
                      </WithTooltip>
                    </>
                  }
                />
              ))}
            </ul>
          )}
        </PageSection>
      ) : null}
    </ReviewsFrame>
  );
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
  if (signedIn === "loading") return null;
  return (
    <DropdownMenu>
      <WithTooltip label={`Pick who taught you ${code}`}>
        <DropdownMenuTrigger asChild>
          <Button>
            <PenLine aria-hidden="true" />
            Write a review
            <ChevronDown aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
      </WithTooltip>
      <DropdownMenuContent align="end" className="max-h-80">
        <DropdownMenuLabel>Who taught you?</DropdownMenuLabel>
        {rows.map((row) => (
          <DropdownMenuItem
            key={row.id ?? row.name}
            onSelect={() => onWrite(row.name)}
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

/** Loads these instructors' reviews (at most COURSE_LISTS_MAX of them). */
function useCourseLists(
  ids: readonly InstructorId[],
  level: ReviewsLevel,
): Readonly<Record<InstructorId, ListState>> {
  const lists = useReviews((s) => s.lists);
  const ensureList = useReviews((s) => s.ensureList);
  useEffect(() => {
    if (level !== "read" && level !== "on") return;
    for (const id of ids) void ensureList(id);
  }, [ids, level, ensureList]);
  return lists;
}

function InstructorRow({
  row,
  code,
  term,
  list,
  level,
  existing,
  writing,
  onWrite,
  onClose,
}: {
  row: Row;
  code: CourseCode;
  term: string | null;
  list: ListState | undefined;
  level: ReviewsLevel;
  /** Your live review of them in this course, which the form edits. */
  existing: MyReview | null;
  writing: boolean;
  onWrite: () => void;
  onClose: () => void;
}) {
  const signedIn = useSignedIn();
  const formRef = useRef<HTMLDivElement>(null);
  // The header's menu can be a screen away: bring the form to it.
  useEffect(() => {
    if (writing) formRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [writing]);
  const ours = list?.status === "ready" ? terpsicleRating(list.reviews) : null;
  const combined = combineRatings([
    {
      source: "planetterp",
      rating: row.planetTerp?.rating ?? null,
      reviewCount: row.planetTerp?.reviewCount ?? 0,
    },
    ...(ours ? [ours] : []),
  ]);
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
          <span className="flex items-center gap-3">
            <CombinedRatingBadge combined={combined} />
            {row.gpa !== null ? (
              <span className="text-muted">GPA {formatGpa(row.gpa)}</span>
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
                to="/reviews/instructors/$id"
                params={{ id: row.id }}
                search={{ course: code }}
                className="font-medium hover:underline"
              >
                {row.name}
              </Link>
            </WithTooltip>
          ) : (
            <span className="font-medium">{row.name}</span>
          )}
          {row.teaching && term ? (
            <span className="border border-hairline-strong px-1.5 text-muted text-xs">
              Teaching {term}
            </span>
          ) : null}
        </div>
      </ListRow>
      {writing ? (
        <div ref={formRef} className="scroll-mt-4 pb-3">
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
