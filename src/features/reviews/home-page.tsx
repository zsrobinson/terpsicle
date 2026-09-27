import { Link, useNavigate } from "@tanstack/react-router";
import { cn } from "cn";
import { PenLine } from "lucide-react";
import {
  type RefObject,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { PanelNote } from "~/app/panel";
import type { CourseCode, CourseSearchRow } from "~/core/schema";
import { formatMonthYear } from "~/core/time/format";
import { Button } from "~/ui/button";
import { InlineError } from "~/ui/inline-error";
import { SearchField } from "~/ui/input";
import { ListRow } from "~/ui/list-row";
import { PageHeader } from "~/ui/page-header";
import { PageSection } from "~/ui/page-section";
import { RowSkeleton } from "~/ui/skeleton";
import { WithTooltip } from "~/ui/tooltip";
import { browserReader, loadCourseSearch, useLoaded } from "./data";
import { PAGE_ROW, ReviewsFrame, ROW_LINK } from "./frame";
import { useReviewsLevel, useSignedIn } from "./level";
import { isDeptQuery, type ReviewsHomeData, searchResults } from "./page-data";
import { readPlanCourses } from "./your-classes";

// /reviews (V2 §1.1), for someone who's never been here: find a course (the
// search's text is `?q=`, so a department link is a search), the courses
// most people take, what was reviewed lately, every department, and where
// the numbers come from. Dense and calm: lists, not cards.

/** Most-taken courses shown. */
const MOST_TAKEN_SHOWN = 12;

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
  const [writing, setWriting] = useState(false);
  useEffect(() => {
    void readPlanCourses().then(setYours);
  }, []);
  return (
    <ReviewsFrame page="home">
      <PageHeader
        title="Terpsicle Reviews"
        status="Ratings, grades and reviews for UMD courses and instructors. Anyone can read them."
        actions={
          level === "on" ? (
            <WithTooltip label="Find the course you took, then pick your instructor">
              <Button
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
      <CourseSearch
        initialQuery={q}
        initialResults={data.results}
        inputRef={searchRef}
        placeholder={
          writing
            ? "Which course did you take? CMSC351, algorithms…"
            : undefined
        }
      />
      {yours.length > 0 ? (
        <PageSection
          title="Your classes"
          aside="From the plans saved in this browser"
        >
          <ul className="flex flex-wrap gap-2">
            {yours.map((code) => (
              <li key={code}>
                <WithTooltip label={`Reviews and grades for ${code}`}>
                  <Button variant="outline" size="sm" className="ident" asChild>
                    <Link to="/reviews/courses/$code" params={{ code }}>
                      {code}
                    </Link>
                  </Button>
                </WithTooltip>
              </li>
            ))}
          </ul>
        </PageSection>
      ) : null}

      {/* min-w-0: long titles truncate instead of widening a column. */}
      <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2 [&>*]:min-w-0">
        {data.mostTaken.length > 0 ? (
          <PageSection title="Most taken">
            <ul>
              {data.mostTaken
                .slice(0, MOST_TAKEN_SHOWN)
                .map(([code, title, students]) => (
                  <ListRow
                    key={code}
                    as="li"
                    className={cn(PAGE_ROW, "relative")}
                    trail={
                      <span className="text-muted">
                        {students.toLocaleString("en-US")}
                      </span>
                    }
                  >
                    <CourseLink code={code} title={title} />
                  </ListRow>
                ))}
            </ul>
            <p className="text-faint text-xs">
              Offered now, by how many students PlanetTerp's grade data counts.
            </p>
          </PageSection>
        ) : null}

        <div className="flex flex-col gap-4">
          {data.recent.length > 0 ? (
            <PageSection title="Recently reviewed">
              <ul>
                {data.recent.map((r) => (
                  <ListRow
                    key={`${r.course}:${r.instructorId}`}
                    as="li"
                    className={cn(PAGE_ROW, "relative")}
                    trail={
                      <span className="text-muted">
                        {formatMonthYear(r.month)}
                      </span>
                    }
                  >
                    <WithTooltip
                      label={`Reviews of ${r.instructorName} in ${r.course}`}
                    >
                      <Link
                        to="/reviews/instructors/$id"
                        params={{ id: r.instructorId }}
                        search={{ course: r.course }}
                        className={cn(
                          ROW_LINK,
                          "block truncate hover:underline",
                        )}
                      >
                        <span className="ident font-medium">{r.course}</span>{" "}
                        <span className="text-muted">·</span> {r.instructorName}
                      </Link>
                    </WithTooltip>
                  </ListRow>
                ))}
              </ul>
            </PageSection>
          ) : null}

          <PageSection title="Where the numbers come from">
            <div className="space-y-2 text-muted leading-5">
              {level === "read" || level === "on" ? (
                <p>
                  Ratings combine PlanetTerp's student reviews, with thanks, and
                  reviews written here, weighted by how many each has. Each
                  rating's tooltip shows the math.
                </p>
              ) : (
                <p>
                  Ratings are PlanetTerp's student reviews, with thanks. Each
                  rating's tooltip says how many there are.
                </p>
              )}
              <p>
                Grades are PlanetTerp's, from UMD's own grade data. AI summaries
                of PlanetTerp's reviews are marked, and can get things wrong.
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
              className="flex flex-wrap gap-x-4 gap-y-1 text-sm"
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
          </PageSection>
        </div>
      </div>

      {data.departments.length > 0 ? (
        <PageSection
          title="Departments"
          aside={
            data.term
              ? `${data.departments.length} in ${data.term.name}`
              : data.departments.length
          }
        >
          <ul className="gap-x-6 sm:columns-2 lg:columns-3">
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
                      "flex min-w-0 items-baseline gap-2 hover:underline",
                    )}
                  >
                    <span className="ident w-11 shrink-0 font-medium">
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

      <p className="text-faint text-xs">
        Ratings and grades include PlanetTerp's, with thanks. Terpsicle isn't
        affiliated with the University of Maryland.
      </p>
    </ReviewsFrame>
  );
}

function CourseLink({ code, title }: { code: CourseCode; title: string }) {
  return (
    <WithTooltip label={`Reviews and grades for ${code}`}>
      <Link
        to="/reviews/courses/$code"
        params={{ code }}
        className={cn(
          ROW_LINK,
          "flex min-w-0 items-baseline gap-2 hover:underline",
        )}
      >
        <span className="ident shrink-0 font-medium">{code}</span>
        <span className="truncate text-muted">{title}</span>
      </Link>
    </WithTooltip>
  );
}

function CourseSearch({
  initialQuery,
  initialResults,
  inputRef,
  placeholder,
}: {
  initialQuery: string;
  /** The server's matches for `initialQuery`, until the course list loads. */
  initialResults: readonly CourseSearchRow[];
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
  const rows = useLoaded(wanted ? "course-search" : null, async () =>
    loadCourseSearch(await browserReader()),
  );
  const navigate = useNavigate();
  const listId = useId();
  const results = useMemo(
    () =>
      rows.status === "ready"
        ? searchResults(rows.data, query)
        : query === initialQuery
          ? initialResults
          : [],
    [rows, query, initialQuery, initialResults],
  );
  const open = (code: CourseCode) =>
    void navigate({ to: "/reviews/courses/$code", params: { code } });
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
  return (
    <form
      aria-label="Find a course"
      onSubmit={(e) => {
        e.preventDefault();
        const first = results[0];
        if (first && !isDeptQuery(typed)) open(first[0]);
      }}
    >
      <label htmlFor={`${listId}-input`} className="sr-only">
        Find a course
      </label>
      <WithTooltip label="Search by course code, title or department">
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
            placeholder ?? "Find a course: CMSC351, algorithms, ENGL…"
          }
          autoComplete="off"
          aria-controls={listId}
        />
      </WithTooltip>
      {typed === "" ? null : rows.status === "error" ? (
        <InlineError
          message="Couldn't load the course list. Check your connection."
          onRetry={rows.retry}
          className="px-2.5"
        />
      ) : results.length > 0 ? null : rows.status === "ready" ? (
        <PanelNote className="px-2.5">No course matches “{typed}”.</PanelNote>
      ) : (
        <RowSkeleton
          rows={3}
          inset={false}
          label="Loading courses"
          className="mt-1 px-2.5"
        />
      )}
      <ul id={listId} aria-label="Courses" className="mt-1">
        {typed !== "" && rows.status === "error"
          ? null
          : results.map(([code, title]) => (
              <ListRow
                key={code}
                as="li"
                className="relative px-2.5 hover:bg-hover"
              >
                <WithTooltip label={`Reviews and grades for ${code}`}>
                  <Link
                    to="/reviews/courses/$code"
                    params={{ code }}
                    className={cn(ROW_LINK, "flex items-baseline gap-2")}
                  >
                    <span className="ident font-medium">{code}</span>
                    <span className="truncate text-muted">{title}</span>
                  </Link>
                </WithTooltip>
              </ListRow>
            ))}
      </ul>
    </form>
  );
}
