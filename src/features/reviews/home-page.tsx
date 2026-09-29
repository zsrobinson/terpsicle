import { Link } from "@tanstack/react-router";
import { cn } from "cn";
import { PenLine } from "lucide-react";
import { type ReactNode, useId, useRef, useState } from "react";
import { PanelNote } from "~/components/panel";
import { combineRatings, courseSlug, instructorSlug } from "~/core/reviews";
import type { CourseCode, InstructorId } from "~/core/schema";
import { useIsMobile } from "~/hooks/use-media-query";
import { Button } from "~/ui/button";
import { ListRow } from "~/ui/list-row";
import { PageHeader } from "~/ui/page-header";
import { PageSection } from "~/ui/page-section";
import { SplitLayout } from "~/ui/split-layout";
import { WithTooltip } from "~/ui/tooltip";
import { PAGE_NOTE, PAGE_ROW, ReviewsFrame, ROW_LINK } from "./frame";
import { useReviewsLevel, useSignedIn } from "./level";
import {
  isDeptQuery,
  type LatestReview,
  type ReviewsHomeData,
  type SearchResults,
} from "./page-data";
import { GradesBlock } from "./planetterp-blocks";
import { PlanetTerpReviewCard } from "./planetterp-review";
import { CombinedRatingBadge } from "./rating";
import { ReviewCard } from "./review-card";
import { ReviewsSearch } from "./search";
import { StatsRow } from "./stats-row";
import { YourReviewsColumn } from "./to-review";

// /reviews (V2 §1.1), Reviews' front door, which people often reach from a
// search engine: a public website, not a dashboard (owner, 2026-09-28). In
// two columns (owner, 2026-09-29). The wide one: Terpsicle Reviews by name,
// one search, whose results open over the page, finding instructors and
// courses alike, as equals; the numbers, counting up; the newest reviews;
// the most-reviewed instructors beside the most-taken courses; grades
// across every course; and every department. Like PlanetTerp's front page
// (owner, 2026-09-29), so it's familiar to anyone who's used it. `?q=`
// lists every match under the search. The narrow one is yours: your
// classes to review, and what you've reviewed.

/** Rows each of the two lists shows. */
const SHOWN = 10;

/**
 * The two lists side by side start level: neither draws the rule a section
 * draws between it and the one before, which only the first would skip.
 */
const SIDE_BY_SIDE = "border-t-0 pt-0";

export function ReviewsHomePage({
  data,
  q,
}: {
  data: ReviewsHomeData;
  q: string;
}) {
  const level = useReviewsLevel();
  const signedIn = useSignedIn();
  const searchRef = useRef<HTMLInputElement>(null);
  const phone = useIsMobile();
  const [writing, setWriting] = useState(false);
  const typed = q.trim();
  return (
    <ReviewsFrame page="home" wide>
      <PageHeader
        size="display"
        // The product's name is the page's (owner, 2026-09-29): anyone here
        // has already found it's free to read.
        title={
          <span className="block text-4xl md:text-5xl">
            Terpsicle <span className="text-product-reviews-text">Reviews</span>
          </span>
        }
        actions={
          level === "on" ? (
            <WithTooltip label="Find who taught you, or the course you took">
              <Button
                size="lg"
                onClick={() => {
                  setWriting(true);
                  searchRef.current?.focus();
                }}
              >
                <PenLine aria-hidden="true" />
                Write a review
              </Button>
            </WithTooltip>
          ) : undefined
        }
      />
      <SplitLayout
        size="display"
        main={
          <>
            <ReviewsSearch
              variant="page"
              // `?q=`'s words stay in the box above their results.
              key={typed}
              initialQuery={q}
              inputRef={searchRef}
              placeholder={
                // Phones get the question alone: the example was cut off there.
                writing
                  ? phone
                    ? "Who taught you, or which course?"
                    : "Who taught you, or which course? Kruskal, CMSC351…"
                  : undefined
              }
            />
            {typed ? <Results q={typed} results={data.results} /> : null}
            {data.totals && data.totals.reviews > 0 ? (
              <StatsRow totals={data.totals} />
            ) : null}
            <Browse data={data} />
          </>
        }
        sideProps={{ "aria-label": "Yours" }}
        side={<YourReviewsColumn />}
      />
      {/* Under both columns, in the wide one's width: on a phone, what's
          yours comes before the fine print. */}
      <SplitLayout
        size="display"
        main={<About level={level} signedIn={signedIn} />}
        side={null}
      />
    </ReviewsFrame>
  );
}

/**
 * Every match for `?q=`: the page a department's link opens, and the
 * search's "Every result". The server's HTML lists them, so they're read
 * and followed like the rest of the page.
 */
function Results({ q, results }: { q: string; results: SearchResults }) {
  const found = results.instructors.length + results.courses.length;
  return (
    <PageSection
      size="display"
      title={
        isDeptQuery(q) && results.instructors.length === 0 ? (
          <>
            <span className="ident">{q.toUpperCase()}</span> courses
          </>
        ) : (
          <>Results for “{q}”</>
        )
      }
      aside={
        <WithTooltip label="Back to browsing">
          <Link
            to="/reviews"
            className="text-muted underline decoration-hairline-strong underline-offset-2 hover:text-fg hover:decoration-fg"
          >
            Clear
          </Link>
        </WithTooltip>
      }
    >
      {found === 0 ? (
        <PanelNote className={PAGE_NOTE}>
          No instructor or course matches “{q}”.
        </PanelNote>
      ) : (
        <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2 [&>*]:min-w-0">
          {results.instructors.length > 0 ? (
            <ResultGroup
              title="Instructors"
              wide={results.courses.length === 0}
            >
              {results.instructors.map(([id, name]) => (
                <ListRow key={id} as="li" className={cn(PAGE_ROW, "relative")}>
                  <InstructorLink id={id} name={name} />
                </ListRow>
              ))}
            </ResultGroup>
          ) : null}
          {results.courses.length > 0 ? (
            <ResultGroup
              title="Courses"
              wide={results.instructors.length === 0}
            >
              {results.courses.map(([code, title]) => (
                <ListRow
                  key={code}
                  as="li"
                  className={cn(PAGE_ROW, "relative")}
                >
                  <CourseLink code={code} title={title} />
                </ListRow>
              ))}
            </ResultGroup>
          ) : null}
        </div>
      )}
    </PageSection>
  );
}

/** The front door's lists: who's most reviewed, what's most taken, and more. */
function Browse({ data }: { data: ReviewsHomeData }) {
  const level = useReviewsLevel();
  return (
    <>
      {data.latest.length > 0 ? (
        <PageSection size="display" title="Recent reviews">
          {/* A taste of each: the whole review is a click away, on the
              instructor's page for the course. */}
          <ul className="[&_[data-private]]:line-clamp-6">
            {data.latest.map((item) => (
              <LatestRow key={item.shown.review.id} item={item} level={level} />
            ))}
          </ul>
        </PageSection>
      ) : null}

      {/* Instructors and courses as equals, side by side. min-w-0: long
          titles truncate instead of widening a column. */}
      <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2 [&>*]:min-w-0">
        {data.mostReviewed.length > 0 ? (
          <PageSection
            size="display"
            title="Most reviewed"
            className={SIDE_BY_SIDE}
          >
            <ul>
              {data.mostReviewed
                .slice(0, SHOWN)
                .map(([id, name, count, rating]) => (
                  <ListRow
                    key={id}
                    as="li"
                    className={cn(PAGE_ROW, "relative")}
                    trail={
                      <CombinedRatingBadge
                        combined={combineRatings([
                          { source: "planetterp", rating, reviewCount: count },
                        ])}
                      />
                    }
                  >
                    <InstructorLink id={id} name={name} />
                  </ListRow>
                ))}
            </ul>
            <p className="text-faint text-sm">
              Instructors with the most reviews on PlanetTerp.
            </p>
          </PageSection>
        ) : null}

        {data.mostTaken.length > 0 ? (
          <PageSection
            size="display"
            title="Most taken"
            className={SIDE_BY_SIDE}
          >
            <ul>
              {data.mostTaken.slice(0, SHOWN).map(([code, title, students]) => (
                <ListRow
                  key={code}
                  as="li"
                  className={cn(PAGE_ROW, "relative")}
                  trail={
                    <span className="tnum text-muted">
                      {students.toLocaleString("en-US")}
                    </span>
                  }
                >
                  <CourseLink code={code} title={title} />
                </ListRow>
              ))}
            </ul>
            <p className="text-faint text-sm">
              Courses offered now, by how many students PlanetTerp's grade data
              counts.
            </p>
          </PageSection>
        ) : null}
      </div>

      {data.totals && data.totals.grades > 0 ? (
        <PageSection size="display" title="Grades across UMD">
          <GradesBlock
            record={{
              counts: data.totals.counts,
              semesters: 0,
            }}
            gradesThrough={data.gradesThrough}
            courses={data.totals.courses}
          />
        </PageSection>
      ) : null}

      {data.departments.length > 0 ? (
        <PageSection
          size="display"
          title="Departments"
          aside={
            data.term
              ? `${data.departments.length} in ${data.term.name}`
              : data.departments.length
          }
        >
          <ul className="gap-x-6 sm:columns-2">
            {data.departments.map((d) => (
              <ListRow
                key={d.code}
                as="li"
                density="compact"
                className={cn(PAGE_ROW, "relative break-inside-avoid")}
              >
                <WithTooltip label={`Every ${d.code} course`}>
                  <Link
                    to="/reviews"
                    search={{ q: d.code }}
                    className={cn(
                      ROW_LINK,
                      "flex min-w-0 items-baseline gap-2 text-base hover:underline",
                    )}
                  >
                    <span className="ident w-12 shrink-0 font-medium">
                      {d.code}
                    </span>
                    <span className="truncate text-muted">{d.name}</span>
                  </Link>
                </WithTooltip>
              </ListRow>
            ))}
          </ul>
        </PageSection>
      ) : null}
    </>
  );
}

/** Where the reviews and grades come from, and the policy. */
function About({
  level,
  signedIn,
}: {
  level: ReturnType<typeof useReviewsLevel>;
  signedIn: ReturnType<typeof useSignedIn>;
}) {
  return (
    <PageSection
      size="display"
      title="Where this comes from"
      // It follows the columns above: it keeps its rule.
      className="first:border-t first:pt-6"
    >
      <div className="flex flex-col gap-3 text-lg text-muted">
        <p>
          Reviews come from students here and on PlanetTerp, a separate UMD
          review site, shown with thanks. Each of PlanetTerp's is marked as
          theirs. Ratings combine both, weighted by how many each has.
        </p>
        <p>
          Grades are PlanetTerp's, from the university's own grade data. The
          numbers at the top count PlanetTerp's data.
        </p>
        {level === "read" || level === "on" ? (
          <p>
            Reviews here are anonymous to readers. Writing one takes a UMD
            sign-in, and a check before it's posted.
          </p>
        ) : null}
      </div>
      <nav
        aria-label="More about Reviews"
        className="flex flex-wrap gap-x-4 gap-y-1 text-base"
      >
        <WithTooltip label="What reviews can and can't say, and how checks work">
          <Link
            to="/reviews/policy"
            className="font-medium text-muted underline decoration-hairline-strong underline-offset-2 hover:text-fg hover:decoration-fg"
          >
            What's allowed
          </Link>
        </WithTooltip>
        {signedIn === true && level !== "off" ? (
          <WithTooltip label="Everything you've written, and where each stands">
            <Link
              to="/reviews/mine"
              className="font-medium text-muted underline decoration-hairline-strong underline-offset-2 hover:text-fg hover:decoration-fg"
            >
              Your reviews
            </Link>
          </WithTooltip>
        ) : null}
      </nav>
      <p className="text-faint text-sm">
        Terpsicle isn't affiliated with the University of Maryland.
      </p>
    </PageSection>
  );
}

/** One of "Recent reviews": the page's own card, saying who it's about. */
function LatestRow({
  item: { shown, instructorName },
  level,
}: {
  item: LatestReview;
  level: ReturnType<typeof useReviewsLevel>;
}) {
  const about = (
    <ReviewAbout
      id={shown.review.instructorId}
      name={instructorName}
      course={shown.review.course}
    />
  );
  return shown.source === "terpsicle" ? (
    <ReviewCard
      review={shown.review}
      own={null}
      level={level}
      showCourse={false}
      about={about}
    />
  ) : (
    <PlanetTerpReviewCard
      review={shown.review}
      showCourse={false}
      about={about}
    />
  );
}

/** "Clyde Kruskal in CMSC351": who a recent review is about, and the way to it. */
function ReviewAbout({
  id,
  name,
  course,
}: {
  id: InstructorId;
  name: string | null;
  course: CourseCode | null;
}) {
  const who = name ?? "An instructor";
  return (
    <WithTooltip
      label={
        course
          ? `Reviews of ${who} in ${course}`
          : `${who}'s reviews and grades`
      }
    >
      <Link
        to="/reviews/$slug"
        params={{ slug: instructorSlug(id) }}
        search={course ? { course } : {}}
        className="text-lg hover:underline"
      >
        <span className="font-medium text-fg">{who}</span>
        {course ? (
          <>
            {" "}
            in <span className="ident text-fg">{course}</span>
          </>
        ) : null}
      </Link>
    </WithTooltip>
  );
}

function InstructorLink({ id, name }: { id: InstructorId; name: string }) {
  return (
    <WithTooltip label={`${name}'s reviews and grades`}>
      <Link
        to="/reviews/$slug"
        params={{ slug: instructorSlug(id) }}
        className={cn(ROW_LINK, "block truncate text-lg hover:underline")}
      >
        {name}
      </Link>
    </WithTooltip>
  );
}

function CourseLink({ code, title }: { code: CourseCode; title: string }) {
  return (
    <WithTooltip label={`Reviews and grades for ${code}`}>
      <Link
        to="/reviews/$slug"
        params={{ slug: courseSlug(code) }}
        // Grows into the course page's header (~/lib/view-transition).
        data-vt-course={code}
        className={cn(
          ROW_LINK,
          "flex min-w-0 items-baseline gap-2 text-lg hover:underline",
        )}
      >
        <span className="ident shrink-0 font-medium">{code}</span>
        <span className="truncate text-base text-muted">{title}</span>
      </Link>
    </WithTooltip>
  );
}

function ResultGroup({
  title,
  wide,
  children,
}: {
  title: string;
  /** The only group: it takes both columns, flowing down one then the other. */
  wide: boolean;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <div className={cn("flex flex-col gap-1", wide && "sm:col-span-2")}>
      <h3 id={id} className="emph-heading text-sm">
        {title}
      </h3>
      <ul
        aria-labelledby={id}
        className={cn(wide && "gap-x-8 sm:columns-2 [&>li]:break-inside-avoid")}
      >
        {children}
      </ul>
    </div>
  );
}
