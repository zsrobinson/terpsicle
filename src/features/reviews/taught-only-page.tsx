import { Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { PanelNote } from "~/components/panel";
import { termLabel } from "~/core/catalog/terms";
import {
  combineRatings,
  courseSlug,
  reviewedKey,
  type TaughtOnlyPageData,
  tookHere,
} from "~/core/reviews";
import { type CourseCode, instructorNameKey, type TermId } from "~/core/schema";
import { PageHeader } from "~/ui/page-header";
import { PageSection } from "~/ui/page-section";
import { SplitLayout } from "~/ui/split-layout";
import { WithTooltip } from "~/ui/tooltip";
import { Composer, type ComposerTarget } from "./composer";
import { FilterRow } from "./filter-list";
import { PAGE_NOTE, ReviewsFrame } from "./frame";
import { RatingSummary } from "./instructor-page";
import { useSignedIn } from "./level";
import {
  ReviewBox,
  type ReviewBoxState,
  useBringFormIn,
  useClassesTaken,
  WriteReviewButton,
} from "./review-box";
import { type Composing, ReviewsTitle, useMine } from "./reviews-section";
import { SignInPrompt } from "./sign-in-prompt";

// /reviews/<name>?course=<code>: an instructor PlanetTerp doesn't know
// (owner, 2026-09-30: every instructor row on a course page is clickable).
// Our own page, from the instructor history alone: no ratings, grades or
// reviews yet, only what they taught, term by term, and the box to be the
// first to review them (the server mints their id on the first review,
// V2 §7.2). Laid out like an instructor's page, so the two read as one.

/** Courses the status line names. */
const STATUS_COURSES = 3;

export function TaughtOnlyPage({
  data,
  write,
}: {
  data: TaughtOnlyPageData;
  /** `?write`: open the form. */
  write: boolean;
}) {
  const { name, taught } = data;
  const signedIn = useSignedIn();
  const mine = useMine();
  const taken = useClassesTaken();
  const courses = [...new Set(taught.map((t) => t.course))];

  const reviewedKeys = new Set(
    mine
      .filter((r) => r.status !== "rejected")
      .map((r) => reviewedKey(r.course, r.reviewedName)),
  );
  const took = taken
    ? tookHere(
        taken,
        { course: null, instructorName: name, taught: new Set(courses) },
        reviewedKeys,
      )
    : null;
  const nameKey = instructorNameKey(name);
  const reviewed =
    mine.find(
      (r) =>
        r.status !== "rejected" &&
        courses.includes(r.course) &&
        instructorNameKey(r.reviewedName) === nameKey,
    ) ?? null;
  const boxState: ReviewBoxState = took
    ? { kind: "took", took }
    : reviewed
      ? { kind: "reviewed", review: reviewed }
      : { kind: "ask" };

  // The course you took with them, else the one the page came from. No id
  // yet: the server mints one from the name and department.
  const course = took?.course ?? data.course;
  const target: ComposerTarget = {
    instructorId: null,
    reviewedName: took?.instructor ?? name,
    dept: course.slice(0, 4),
    course,
  };
  const [composing, setComposing] = useState<Composing>(write ? "new" : null);
  const boxRef = useRef<HTMLDivElement>(null);
  useBringFormIn(boxRef, composing);

  const composer =
    composing === null ? null : signedIn !== true ? (
      <SignInPrompt>
        Sign in with your UMD account to write a review. Readers won't see who
        wrote it.
      </SignInPrompt>
    ) : composing === "new" ? (
      <Composer
        target={target}
        existing={null}
        termId={took?.course === course ? took.termId : null}
        onClose={() => setComposing(null)}
      />
    ) : (
      <Composer
        target={{
          instructorId: composing.instructorId,
          reviewedName: composing.reviewedName,
          dept: composing.course.slice(0, 4),
          course: composing.course,
        }}
        existing={composing}
        onClose={() => setComposing(null)}
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
              eyebrow="Instructor"
              title={name}
              status={<TaughtCourses courses={courses} />}
            />
            <div ref={boxRef} className="scroll-mt-20">
              {composer ?? (
                <ReviewBox
                  state={boxState}
                  who={name}
                  question={<>Took a class with {name}?</>}
                  write={
                    <WriteReviewButton
                      tooltip={`Review ${target.reviewedName} in ${course}`}
                      onClick={() => setComposing("new")}
                    />
                  }
                  onEdit={setComposing}
                  ready={taken !== null}
                />
              )}
            </div>
          </>
        }
        sideProps={{
          "aria-label": `More about ${name}`,
          className: "lg:pt-8",
        }}
        side={<RatingSummary combined={combineRatings([])} />}
        after={<WhatTheyTaught data={data} />}
        main={
          <PageSection size="display" title={<ReviewsTitle count={0} />}>
            <PanelNote className={PAGE_NOTE}>
              Nobody's reviewed {name} yet. PlanetTerp doesn't list them, so
              there are no ratings or grades of theirs to show.
            </PanelNote>
          </PageSection>
        }
      />
    </ReviewsFrame>
  );
}

/** "Taught CMSC351, CMSC250 and 2 more": each code opens its course's page. */
function TaughtCourses({ courses }: { courses: readonly CourseCode[] }) {
  const shown = courses.slice(0, STATUS_COURSES);
  const more = courses.length - shown.length;
  return (
    <span>
      Taught{" "}
      {shown.map((c, i) => (
        <span key={c}>
          {i > 0 ? (i === shown.length - 1 && more === 0 ? " and " : ", ") : ""}
          <WithTooltip label={`${c}'s page: every instructor's reviews`}>
            <Link
              to="/reviews/$slug"
              params={{ slug: courseSlug(c) }}
              className="ident text-fg underline decoration-hairline-strong underline-offset-2 hover:decoration-fg"
            >
              {c}
            </Link>
          </WithTooltip>
        </span>
      ))}
      {more > 0 ? ` and ${more} more` : null}
    </span>
  );
}

/** Every course and term of theirs on record, newest term first. */
function WhatTheyTaught({ data }: { data: TaughtOnlyPageData }) {
  const terms = new Map<TermId, TaughtOnlyPageData["taught"]>();
  for (const row of data.taught)
    terms.set(row.termId, [...(terms.get(row.termId) ?? []), row]);
  return (
    <PageSection size="side" title="What they taught">
      <div className="flex flex-col gap-6">
        {[...terms].map(([termId, rows]) => (
          <div key={termId} className="flex flex-col gap-1">
            {/* As "Who taught it" on a course's page: the term over its
                courses, a rule filling the rest of its line. */}
            <h3 className="emph-heading flex items-center gap-3 text-lg">
              <span className="shrink-0">{termLabel(termId)}</span>
              <span aria-hidden="true" className="h-px flex-1 bg-hairline" />
            </h3>
            <ul aria-label={`Taught in ${termLabel(termId)}`}>
              {rows.map((row) => (
                <FilterRow
                  key={row.course}
                  label={
                    <span className="ident font-medium">{row.course}</span>
                  }
                  secondary={row.title ?? undefined}
                  tooltip={`${row.course}'s page: every instructor's reviews`}
                  link={{
                    to: "/reviews/$slug",
                    params: { slug: courseSlug(row.course) },
                  }}
                />
              ))}
            </ul>
          </div>
        ))}
      </div>
    </PageSection>
  );
}
