import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { formatGpa, gradeSummary } from "~/core/grades/grades";
import { planetTerpFreshnessWords } from "~/core/grades/source";
import { combineRatings, terpsicleRating } from "~/core/reviews";
import {
  type CourseCode,
  CourseCodeSchema,
  type InstructorId,
  instructorNameKey,
  type PublicReview,
} from "~/core/schema";
import { NotFoundPage } from "~/features/site/not-found-page";
import { Skeleton } from "~/ui/skeleton";
import { WithTooltip } from "~/ui/tooltip";
import { Composer, type ComposerTarget } from "./composer";
import {
  loadCourseEntry,
  loadCurrentCourse,
  loadPlanetTerp,
  useLoaded,
} from "./data";
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

interface Row {
  /** Null: PlanetTerp doesn't know this Testudo name, so it has no id yet. */
  id: InstructorId | null;
  name: string;
  teaching: boolean;
  planetTerp: { rating: number | null; reviewCount: number } | null;
  gpa: number | null;
}

/** The route's param, checked: anything but a course code is "Page not found". */
export function CourseRoute({ code }: { code: string }) {
  const parsed = CourseCodeSchema.safeParse(code.toUpperCase());
  if (!parsed.success) return <NotFoundPage />;
  return <CoursePage key={parsed.data} code={parsed.data} />;
}

export function CoursePage({ code }: { code: CourseCode }) {
  const dept = code.slice(0, 4);
  const level = useReviewsLevel();
  const entry = useLoaded(`entry:${code}`, () => loadCourseEntry(code));
  const current = useLoaded(`current:${code}`, () => loadCurrentCourse(code));
  const planetTerp = useLoaded(`pt:${dept}`, () => loadPlanetTerp(dept));
  const ptDept = planetTerp.status === "ready" ? planetTerp.data.dept : null;
  const grades = ptDept?.courses[code] ?? null;
  const [writingFor, setWritingFor] = useState<string | null>(null);

  const title =
    (entry.status === "ready" ? entry.data?.title : undefined) ??
    (current.status === "ready" ? current.data?.course.title : undefined);
  const term = current.status === "ready" ? current.data?.term : undefined;

  const rows = useMemo(() => {
    const byKey = new Map<string, Row>();
    const teachingNames =
      current.status === "ready" && current.data
        ? current.data.course.sections.flatMap((s) => s.instructors)
        : [];
    for (const name of teachingNames) {
      const id = ptDept?.names[instructorNameKey(name)] ?? null;
      const key = id ?? `name:${instructorNameKey(name)}`;
      if (byKey.has(key)) continue;
      byKey.set(key, { id, name, teaching: true, planetTerp: null, gpa: null });
    }
    for (const slug of Object.keys(grades?.byInstructor ?? {}))
      if (!byKey.has(slug))
        byKey.set(slug, {
          id: slug,
          name: ptDept?.instructors[slug]?.name ?? slug,
          teaching: false,
          planetTerp: null,
          gpa: null,
        });
    for (const row of byKey.values()) {
      const pt = row.id ? ptDept?.instructors[row.id] : undefined;
      if (pt) {
        row.name = row.teaching ? row.name : pt.name;
        row.planetTerp = { rating: pt.rating, reviewCount: pt.reviewCount };
      }
      const record = row.id ? grades?.byInstructor[row.id] : undefined;
      row.gpa = record ? gradeSummary(record.counts).averageGpa : null;
    }
    return [...byKey.values()].sort(
      (a, b) =>
        Number(b.teaching) - Number(a.teaching) ||
        (b.planetTerp?.reviewCount ?? 0) - (a.planetTerp?.reviewCount ?? 0) ||
        a.name.localeCompare(b.name),
    );
  }, [current, ptDept, grades]);

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
  const loading =
    planetTerp.status === "loading" || current.status === "loading";

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
          term
            ? `Offered in ${term.name}`
            : current.status === "ready"
              ? "Not offered this term"
              : undefined
        }
      />

      <Section title="Grades">
        <div className="pt-3">
          {planetTerp.status === "loading" ? (
            <Skeleton className="h-28 w-full" />
          ) : grades?.all ? (
            <GradesBlock
              record={grades.all}
              gradesThrough={
                planetTerp.status === "ready"
                  ? planetTerp.data.gradesThrough
                  : null
              }
            />
          ) : (
            <p className="text-muted">
              PlanetTerp has no grades for {code} yet.
            </p>
          )}
          {planetTerp.status === "ready" &&
          planetTerpFreshnessWords(planetTerp.data.source) ? (
            <p className="mt-1 text-faint text-xs">
              {planetTerpFreshnessWords(planetTerp.data.source)}
            </p>
          ) : null}
        </div>
      </Section>

      <Section title="Instructors" count={loading ? undefined : rows.length}>
        {loading ? (
          <div className="space-y-2 py-3">
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-3 w-2/5" />
          </div>
        ) : rows.length === 0 ? (
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
