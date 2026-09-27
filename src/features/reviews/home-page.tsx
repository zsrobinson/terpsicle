import { Link, useNavigate } from "@tanstack/react-router";
import { PenLine, Search } from "lucide-react";
import {
  type RefObject,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import type { CourseCode, CourseSearchRow } from "~/core/schema";
import { formatMonthYear } from "~/core/time/format";
import { Button } from "~/ui/button";
import { WithTooltip } from "~/ui/tooltip";
import { browserReader, loadCourseSearch, useLoaded } from "./data";
import { PageTitle, ReviewsFrame, Section } from "./frame";
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
      <PageTitle
        title="Terpsicle Reviews"
        sub="Ratings, grades and reviews for UMD courses and instructors. Anyone can read them."
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
        <Section title="Your classes">
          <ul className="flex flex-wrap gap-1 pt-3">
            {yours.map((code) => (
              <li key={code}>
                <CourseChip code={code} />
              </li>
            ))}
          </ul>
          <p className="mt-2 text-faint text-xs">
            From the plans saved in this browser.
          </p>
        </Section>
      ) : null}

      {/* min-w-0: long titles truncate instead of widening a column. */}
      <div className="grid gap-x-8 sm:grid-cols-2 [&>*]:min-w-0">
        {data.mostTaken.length > 0 ? (
          <Section title="Most taken">
            <ul className="pt-1">
              {data.mostTaken
                .slice(0, MOST_TAKEN_SHOWN)
                .map(([code, title, students]) => (
                  <li
                    key={code}
                    className="flex items-baseline gap-2 border-hairline border-b py-1.5"
                  >
                    <CourseLink code={code} title={title} />
                    <span className="tnum ml-auto shrink-0 text-muted text-sm">
                      {students.toLocaleString("en-US")}
                    </span>
                  </li>
                ))}
            </ul>
            <p className="mt-2 text-faint text-xs">
              Offered now, by how many students PlanetTerp's grade data counts.
            </p>
          </Section>
        ) : null}

        <div>
          {data.recent.length > 0 ? (
            <Section title="Recently reviewed">
              <ul className="pt-1">
                {data.recent.map((r) => (
                  <li
                    key={`${r.course}:${r.instructorId}`}
                    className="flex items-baseline gap-2 border-hairline border-b py-1.5"
                  >
                    <WithTooltip
                      label={`Reviews of ${r.instructorName} in ${r.course}`}
                    >
                      <Link
                        to="/reviews/instructors/$id"
                        params={{ id: r.instructorId }}
                        search={{ course: r.course }}
                        className="min-w-0 truncate hover:underline"
                      >
                        <span className="ident font-medium">{r.course}</span>{" "}
                        <span className="text-muted">·</span> {r.instructorName}
                      </Link>
                    </WithTooltip>
                    <span className="ml-auto shrink-0 text-muted text-sm">
                      {formatMonthYear(r.month)}
                    </span>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          <Section title="Where the numbers come from">
            <div className="space-y-2 pt-3 text-muted leading-5">
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
            {level === "on" ? (
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
                <WithTooltip label="Find the course you took, then pick your instructor">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setWriting(true);
                      searchRef.current?.focus();
                    }}
                  >
                    <PenLine aria-hidden="true" />
                    Write a review
                  </Button>
                </WithTooltip>
                <span className="text-faint text-xs">
                  Find the course, then pick your instructor.
                </span>
              </div>
            ) : null}
          </Section>
        </div>
      </div>

      {data.departments.length > 0 ? (
        <Section
          title="Departments"
          count={data.departments.length}
          right={
            data.term ? (
              <span className="text-muted text-sm">{data.term.name}</span>
            ) : undefined
          }
        >
          <ul className="gap-x-6 pt-2 sm:columns-2 lg:columns-3">
            {data.departments.map((d) => (
              <li key={d.code} className="break-inside-avoid">
                <WithTooltip label={`Every ${d.code} course`}>
                  <Link
                    to="/reviews"
                    search={{ q: d.code }}
                    className="flex min-h-6 items-center gap-2 text-sm hover:underline"
                  >
                    <span className="ident w-11 shrink-0 font-medium">
                      {d.code}
                    </span>
                    <span className="truncate text-muted">{d.name}</span>
                  </Link>
                </WithTooltip>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <nav
        aria-label="More"
        className="mt-8 flex flex-wrap gap-4 text-muted text-sm"
      >
        {signedIn === true && level !== "off" ? (
          <WithTooltip label="Everything you've written, and where each stands">
            <Link to="/reviews/mine" className="hover:text-fg">
              Your reviews
            </Link>
          </WithTooltip>
        ) : null}
        <WithTooltip label="What reviews can and can't say, and how checks work">
          <Link to="/reviews/policy" className="hover:text-fg">
            What's allowed
          </Link>
        </WithTooltip>
      </nav>
      <p className="mt-2 text-faint text-xs">
        Ratings and grades include PlanetTerp's, with thanks. Terpsicle isn't
        affiliated with the University of Maryland.
      </p>
    </ReviewsFrame>
  );
}

function CourseChip({ code }: { code: CourseCode }) {
  return (
    <WithTooltip label={`Reviews and grades for ${code}`}>
      <Link
        to="/reviews/courses/$code"
        params={{ code }}
        className="ident flex h-7 items-center rounded-md border border-hairline px-2.5 text-sm hover:bg-hover"
      >
        {code}
      </Link>
    </WithTooltip>
  );
}

function CourseLink({ code, title }: { code: CourseCode; title: string }) {
  return (
    <WithTooltip label={`Reviews and grades for ${code}`}>
      <Link
        to="/reviews/courses/$code"
        params={{ code }}
        className="flex min-w-0 items-baseline gap-2 hover:underline"
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
      <div className="flex h-9 items-center gap-2 border border-hairline-strong bg-raised px-2.5 focus-within:border-fg/40">
        <Search size={14} aria-hidden="true" className="text-faint" />
        <WithTooltip label="Search by course code, title or department">
          <input
            ref={inputRef}
            id={`${listId}-input`}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              // Typing replaces: Back leaves the page, not each letter.
              void navigate({
                to: "/reviews",
                search: e.target.value.trim() ? { q: e.target.value } : {},
                replace: true,
              });
            }}
            onFocus={() => setWanted(true)}
            placeholder={
              placeholder ?? "Find a course: CMSC351, algorithms, ENGL…"
            }
            autoComplete="off"
            aria-controls={listId}
            className="h-full flex-1 bg-transparent text-base placeholder:text-faint focus:outline-none"
          />
        </WithTooltip>
      </div>
      <ul id={listId} aria-label="Courses" className="mt-1">
        {typed !== "" && results.length === 0 && rows.status === "loading" ? (
          <li className="px-2.5 py-2 text-muted text-sm">Loading courses…</li>
        ) : typed !== "" && rows.status === "error" ? (
          <li className="px-2.5 py-2 text-muted text-sm">
            Couldn't load the course list. Check your connection and try again.
          </li>
        ) : typed !== "" && results.length === 0 && rows.status === "ready" ? (
          <li className="px-2.5 py-2 text-muted text-sm">
            No course matches “{typed}”.
          </li>
        ) : (
          results.map(([code, title]) => (
            <li key={code}>
              <WithTooltip label={`Reviews and grades for ${code}`}>
                <Link
                  to="/reviews/courses/$code"
                  params={{ code }}
                  className="flex items-baseline gap-2 px-2.5 py-1.5 hover:bg-hover"
                >
                  <span className="ident font-medium">{code}</span>
                  <span className="truncate text-muted">{title}</span>
                </Link>
              </WithTooltip>
            </li>
          ))
        )}
      </ul>
    </form>
  );
}
