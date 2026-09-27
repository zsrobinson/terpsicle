import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { crossLinkClicked } from "~/app/cross-link";
import { formatGpa } from "~/core/grades/grades";
import { planetTerpFreshnessWords } from "~/core/grades/source";
import {
  type CourseInstructorRow,
  type CoursePageData,
  combineRatings,
  terpsicleRating,
} from "~/core/reviews";
import type { CourseCode, InstructorId, PublicReview } from "~/core/schema";
import { Skeleton } from "~/ui/skeleton";
import { WithTooltip } from "~/ui/tooltip";
import { Composer, type ComposerTarget } from "./composer";
import { Breadcrumbs, PageTitle, ReviewsFrame, Section } from "./frame";
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

  return (
    <ReviewsFrame page="course">
      <Breadcrumbs crumbs={[{ label: "Reviews", to: "/reviews" }]} />
      <PageTitle
        title={
          <>
            <span className="ident">{code}</span>
            {title ? <span className="font-normal"> · {title}</span> : null}
          </>
        }
        sub={
          term ? (
            <>
              Offered in {term.name} ·{" "}
              <WithTooltip label={`${code}'s sections in ${term.name}`}>
                <Link
                  to="/schedule/course/$code"
                  params={{ code }}
                  onClick={() => crossLinkClicked("reviews", "schedule")}
                  className="text-fg underline underline-offset-2"
                >
                  View schedule
                </Link>
              </WithTooltip>
            </>
          ) : (
            "Not offered this term"
          )
        }
      />

      <Section title="Grades">
        <div className="pt-3">
          {grades ? (
            <GradesBlock record={grades} gradesThrough={data.gradesThrough} />
          ) : (
            <p className="text-muted">
              PlanetTerp has no grades for {code} yet.
            </p>
          )}
          {freshness ? (
            <p className="mt-1 text-faint text-xs">{freshness}</p>
          ) : null}
        </div>
      </Section>

      <Section title="Instructors" count={rows.length}>
        {rows.length === 0 ? (
          <p className="py-3 text-muted">
            We don't know who's taught {code} yet.
          </p>
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
                writing={writingFor === row.name}
                onWrite={() => setWritingFor(row.name)}
                onClose={() => setWritingFor(null)}
              />
            ))}
          </ul>
        )}
      </Section>

      {level === "read" || level === "on" ? (
        <Section title={`Newest reviews of ${code}`}>
          {readIds.some(
            (id) =>
              lists[id]?.status !== "ready" && lists[id]?.status !== "error",
          ) ? (
            <div className="space-y-2 py-3" aria-busy="true">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-4/5" />
            </div>
          ) : newest.length === 0 ? (
            <p className="py-3 text-muted">
              No reviews of {code} on Terpsicle yet.
            </p>
          ) : (
            newest.slice(0, NEWEST).map((r) => (
              <div key={r.id}>
                <p className="pt-3 text-muted text-sm">
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
                </p>
                <ReviewCard
                  review={r}
                  own={ownById.get(r.id) ?? null}
                  level={level}
                  showCourse={false}
                />
              </div>
            ))
          )}
        </Section>
      ) : null}
    </ReviewsFrame>
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
  writing,
  onWrite,
  onClose,
}: {
  row: Row;
  code: CourseCode;
  term: string | null;
  list: ListState | undefined;
  level: ReviewsLevel;
  writing: boolean;
  onWrite: () => void;
  onClose: () => void;
}) {
  const signedIn = useSignedIn();
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
    <li className="border-hairline border-b py-2">
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
          <span className="bg-hover px-1.5 text-muted text-xs">
            Teaching {term}
          </span>
        ) : null}
        <span className="ml-auto flex items-center gap-3 text-sm">
          <CombinedRatingBadge combined={combined} />
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
            />
          ) : null}
        </span>
      </div>
      {writing && signedIn !== true ? (
        <SignInPrompt>
          Sign in with your UMD account to write a review. Readers won't see who
          wrote it.
        </SignInPrompt>
      ) : writing ? (
        <div className="mt-2">
          <Composer target={target} existing={null} onClose={onClose} />
        </div>
      ) : null}
    </li>
  );
}
