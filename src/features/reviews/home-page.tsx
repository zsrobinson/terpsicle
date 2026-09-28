import { Link, useNavigate } from "@tanstack/react-router";
import { cn } from "cn";
import { PenLine } from "lucide-react";
import {
  type ReactNode,
  type RefObject,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { PanelNote } from "~/app/panel";
import { useIsMobile } from "~/app/use-media-query";
import { combineRatings, courseSlug, instructorSlug } from "~/core/reviews";
import type { CourseCode, InstructorId } from "~/core/schema";
import { formatMonthYear } from "~/core/time/format";
import { Button } from "~/ui/button";
import { InlineError } from "~/ui/inline-error";
import { SearchField } from "~/ui/input";
import { ListRow } from "~/ui/list-row";
import { PageHeader } from "~/ui/page-header";
import { PageSection } from "~/ui/page-section";
import { RowSkeleton } from "~/ui/skeleton";
import { WithTooltip } from "~/ui/tooltip";
import {
  browserReader,
  loadCourseSearch,
  loadPlanetTerpIndex,
  useLoaded,
} from "./data";
import { PAGE_ROW, ReviewsFrame, ROW_LINK } from "./frame";
import { useReviewsLevel, useSignedIn } from "./level";
import {
  isDeptQuery,
  type ReviewsHomeData,
  type SearchResults,
  searchResults,
} from "./page-data";
import { CombinedRatingBadge } from "./rating";
import { ReviewYourInstructors } from "./to-review";
import { readPlanCourses } from "./your-classes";

// /reviews (V2 §1.1), Reviews' front door, which people often reach from a
// search engine: a public website, not a dashboard (owner, 2026-09-28). One
// search finds instructors and courses alike, as equals; then who you could
// review, the most-reviewed instructors beside the most-taken courses, what
// was reviewed lately and every department.

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
  const [yours, setYours] = useState<CourseCode[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);
  const phone = useIsMobile();
  const [writing, setWriting] = useState(false);
  useEffect(() => {
    void readPlanCourses().then(setYours);
  }, []);
  return (
    <ReviewsFrame page="home">
      <PageHeader
        size="display"
        eyebrow="Terpsicle Reviews"
        title="UMD course and instructor reviews"
        status="What students say about University of Maryland instructors and courses, here and on PlanetTerp. Free to read, no sign-in."
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
      <Search
        initialQuery={q}
        initialResults={data.results}
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

      <ReviewYourInstructors />

      {yours.length > 0 ? (
        <PageSection
          size="display"
          title="Your classes"
          // Signed in, plan sync keeps every device's plans here too.
          aside="From your plans in Schedule"
        >
          <ul className="flex flex-wrap gap-2">
            {yours.map((code) => (
              <li key={code}>
                <WithTooltip label={`Reviews and grades for ${code}`}>
                  <Button variant="outline" className="ident" asChild>
                    <Link
                      to="/reviews/$slug"
                      params={{ slug: courseSlug(code) }}
                    >
                      {code}
                    </Link>
                  </Button>
                </WithTooltip>
              </li>
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

      {data.recent.length > 0 ? (
        <PageSection size="display" title="Recently reviewed">
          <ul>
            {data.recent.map((r) => (
              <ListRow
                key={`${r.course}:${r.instructorId}`}
                as="li"
                className={cn(PAGE_ROW, "relative")}
                trail={
                  <span className="tnum text-muted">
                    {formatMonthYear(r.month)}
                  </span>
                }
              >
                <WithTooltip
                  label={`Reviews of ${r.instructorName} in ${r.course}`}
                >
                  <Link
                    to="/reviews/$slug"
                    params={{ slug: instructorSlug(r.instructorId) }}
                    search={{ course: r.course }}
                    className={cn(
                      ROW_LINK,
                      "block truncate text-lg hover:underline",
                    )}
                  >
                    <span className="font-medium">{r.instructorName}</span>{" "}
                    <span className="text-muted">in</span>{" "}
                    <span className="ident">{r.course}</span>
                  </Link>
                </WithTooltip>
              </ListRow>
            ))}
          </ul>
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

      <PageSection size="display" title="Where this comes from">
        <div className="flex flex-col gap-3 text-lg text-muted">
          <p>
            Reviews come from students here and on PlanetTerp, a separate UMD
            review site, shown with thanks. Each of PlanetTerp's is marked as
            theirs. Ratings combine both, weighted by how many each has.
          </p>
          <p>
            Grades are PlanetTerp's, from the university's own grade data. AI
            summaries of PlanetTerp's reviews are marked, and can get things
            wrong.
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
    </ReviewsFrame>
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

/** The course list and PlanetTerp's index, read once the search is used. */
function useSearchData(wanted: boolean) {
  return useLoaded(wanted ? "reviews-search" : null, async () => {
    const reader = await browserReader();
    const [rows, index] = await Promise.all([
      loadCourseSearch(reader),
      loadPlanetTerpIndex(reader).catch(() => null),
    ]);
    return { rows, index };
  });
}

function Search({
  initialQuery,
  initialResults,
  inputRef,
  placeholder,
}: {
  initialQuery: string;
  /** The server's matches for `initialQuery`, until the lists load. */
  initialResults: SearchResults;
  inputRef: RefObject<HTMLInputElement | null>;
  placeholder: string | undefined;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [wanted, setWanted] = useState(initialQuery !== "");
  // A department link (or Back) changes `?q=` from outside the box.
  useEffect(() => {
    setQuery((current) =>
      current.trim() === initialQuery.trim() ? current : initialQuery,
    );
    if (initialQuery !== "") setWanted(true);
  }, [initialQuery]);
  const lists = useSearchData(wanted);
  const navigate = useNavigate();
  const listId = useId();
  const phone = useIsMobile();
  const results = useMemo(
    () =>
      lists.status === "ready"
        ? searchResults(lists.data.rows, lists.data.index, query)
        : query === initialQuery
          ? initialResults
          : { instructors: [], courses: [] },
    [lists, query, initialQuery, initialResults],
  );
  // Typing replaces: Back leaves the page, not each letter.
  const search = (text: string) => {
    setQuery(text);
    void navigate({
      to: "/reviews",
      search: text.trim() ? { q: text } : {},
      replace: true,
    });
  };
  const typed = query.trim();
  const found = results.instructors.length + results.courses.length;
  return (
    <form
      aria-label="Search reviews"
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (isDeptQuery(typed) && results.courses.length > 1) return;
        const [instructor] = results.instructors;
        const [course] = results.courses;
        // A code typed goes to the course; a name, to the instructor.
        if (course && (/\d/.test(typed) || !instructor))
          void navigate({
            to: "/reviews/$slug",
            params: { slug: courseSlug(course[0]) },
          });
        else if (instructor)
          void navigate({
            to: "/reviews/$slug",
            params: { slug: instructorSlug(instructor[0]) },
          });
      }}
    >
      <label htmlFor={`${listId}-input`} className="sr-only">
        Search instructors and courses
      </label>
      <WithTooltip label="Search by an instructor's name, or a course's code, title or department">
        <SearchField
          ref={inputRef}
          id={`${listId}-input`}
          value={query}
          onChange={(e) => search(e.target.value)}
          onClear={() => {
            search("");
            inputRef.current?.focus();
          }}
          onFocus={() => setWanted(true)}
          placeholder={
            placeholder ??
            (phone
              ? "Search instructors and courses"
              : "Search instructors and courses: Kruskal, CMSC351…")
          }
          autoComplete="off"
          aria-controls={listId}
          className="h-12 pl-4 text-lg md:h-12"
        />
      </WithTooltip>
      {typed === "" ? null : lists.status === "error" ? (
        <InlineError
          message="Couldn't load the search. Check your connection."
          onRetry={lists.retry}
        />
      ) : found > 0 ? null : lists.status === "ready" ? (
        <PanelNote className="p-0 text-base">
          No instructor or course matches “{typed}”.
        </PanelNote>
      ) : (
        <RowSkeleton rows={3} inset={false} label="Loading the search" />
      )}
      <div id={listId} className="flex flex-col gap-4">
        {results.instructors.length > 0 ? (
          <ResultGroup title="Instructors">
            {results.instructors.map(([id, name]) => (
              <ListRow
                key={id}
                as="li"
                className="relative px-2.5 hover:bg-hover"
              >
                <InstructorLink id={id} name={name} />
              </ListRow>
            ))}
          </ResultGroup>
        ) : null}
        {results.courses.length > 0 ? (
          <ResultGroup title="Courses">
            {results.courses.map(([code, title]) => (
              <ListRow
                key={code}
                as="li"
                className="relative px-2.5 hover:bg-hover"
              >
                <CourseLink code={code} title={title} />
              </ListRow>
            ))}
          </ResultGroup>
        ) : null}
      </div>
    </form>
  );
}

function ResultGroup({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <h2 id={id} className="font-medium text-muted text-sm">
        {title}
      </h2>
      <ul aria-labelledby={id}>{children}</ul>
    </div>
  );
}
